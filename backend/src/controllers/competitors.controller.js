const prisma = require('../lib/prisma')
const {
  scrapeInstagramProfile, parseInstagramUsername,
  scrapeLinkedinCompany,  parseLinkedinCompany,
  scrapeFacebookPage,     parseFacebookPage,
} = require('../services/socialScrape.service')
const { cacheImagesInArray } = require('../services/socialImageCache.service')
const { DEFAULT_TZ } = require('../utils/dates')

// Adaptadores por plataforma — todos retornan métricas con shape común
// (followersCount, name, profilePicUrl, postsThisMonth, avgLikes, avgComments,
// engagementRate, topPosts, mediaCount?, isPrivate?). El normalizador de cada
// scraper ya se encarga de devolver ese shape.
const PLATFORM_SCRAPERS = {
  instagram: {
    parseId: parseInstagramUsername,
    // skipPostsActor: los competidores no corren la 2ª llamada (actor de posts) —
    // para trackear crecimiento de seguidores alcanza con el scrape de perfil y
    // así no duplicamos el costo de Apify.
    scrape:  (username, opts) => scrapeInstagramProfile(username, { ...opts, skipPostsActor: true }),
    invalidMsg: 'Usuario o URL de Instagram inválido.',
  },
  linkedin: {
    parseId: parseLinkedinCompany,
    // scrapeLinkedinCompany no expone profilePicUrl — lo mapeamos desde logoUrl si está
    scrape:  async (slug, opts) => {
      const m = await scrapeLinkedinCompany(slug, opts)
      return {
        ...m,
        profilePicUrl: m.profilePicUrl ?? m.org?.logoUrl ?? m.logoUrl ?? null,
        name:          m.name ?? m.org?.name ?? slug,
      }
    },
    invalidMsg: 'URL o nombre de Company Page de LinkedIn inválido.',
  },
  facebook: {
    parseId: parseFacebookPage,
    // El actor de Páginas trae seguidores (no posts) → engagement/avgLikes quedan
    // en null. scrapeFacebookPage devuelve el nombre en page.name; mapeamos al shape común.
    scrape:  async (slug, opts) => {
      const m = await scrapeFacebookPage(slug, opts)
      return {
        ...m,
        name:          m.name ?? m.page?.name ?? slug,
        profilePicUrl: m.profilePicUrl ?? m.page?.profilePicUrl ?? null,
      }
    },
    invalidMsg: 'URL o nombre de página de Facebook inválido.',
  },
}

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Límite de scraping: 1 llamada al proveedor (Apify) por competidor por mes calendario
// (ART), sea el scrape de alta, un refresh manual o el del cron mensual — todos escriben
// `CompetitorAccount.lastScrapedAt`, así el gate es persistente (sobrevive redeploys y
// no depende de que el pedido caiga en la misma instancia del backend).
function monthStrOfDate(date) {
  const d = new Date(date.toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextMonthLabel() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return next.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

function todayStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// Guarda snapshot mensual + log diario de seguidores de un competidor.
async function persistCompetitorData(competitorId, workspaceId, metrics) {
  const month = currentMonthStr()
  const date  = todayStr()
  // Cacheamos las imágenes de los top posts (las URLs del CDN de IG vencen).
  const topPostsCached = await cacheImagesInArray(metrics.topPosts ?? [], 'imgSrc', workspaceId)
  const topPostsJson = JSON.stringify(topPostsCached)
  await Promise.allSettled([
    prisma.competitorSnapshot.upsert({
      where:  { competitorId_month: { competitorId, month } },
      update: {
        followersCount: metrics.followersCount,
        mediaCount:     metrics.mediaCount     ?? null,
        postsCount:     metrics.postsThisMonth ?? null,
        avgLikes:       metrics.avgLikes       ?? null,
        avgComments:    metrics.avgComments    ?? null,
        engagementRate: metrics.engagementRate ?? null,
        topPosts:       topPostsJson,
      },
      create: {
        competitorId, workspaceId, month,
        followersCount: metrics.followersCount,
        mediaCount:     metrics.mediaCount     ?? null,
        postsCount:     metrics.postsThisMonth ?? null,
        avgLikes:       metrics.avgLikes       ?? null,
        avgComments:    metrics.avgComments    ?? null,
        engagementRate: metrics.engagementRate ?? null,
        topPosts:       topPostsJson,
      },
    }),
    prisma.competitorFollowerLog.upsert({
      where:  { competitorId_date: { competitorId, date } },
      update: { followersCount: metrics.followersCount },
      create: { competitorId, workspaceId, date, followersCount: metrics.followersCount },
    }),
  ])
}

async function assertProject(req) {
  const projectId = Number(req.params.id)
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: req.workspace.id }, select: { id: true },
  })
  return project ? projectId : null
}

/**
 * GET /api/marketing/projects/:id/competitors?platform=instagram
 * Lista competidores con su último snapshot y la ganancia de seguidores del mes.
 */
async function listCompetitors(req, res, next) {
  try {
    const projectId = await assertProject(req)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const where = { projectId }
    if (req.query.platform) where.platform = req.query.platform

    const competitors = await prisma.competitorAccount.findMany({
      where, orderBy: { createdAt: 'asc' },
    })

    const month      = currentMonthStr()
    const monthStart = `${month}-01`

    const result = await Promise.all(competitors.map(async (c) => {
      const [snap, prevCloseLog, firstInMonthLog] = await Promise.all([
        prisma.competitorSnapshot.findFirst({ where: { competitorId: c.id }, orderBy: { month: 'desc' } }),
        // Baseline = cierre del mes anterior (último log antes del mes), valor congelado.
        prisma.competitorFollowerLog.findFirst({
          where: { competitorId: c.id, date: { lt: monthStart } }, orderBy: { date: 'desc' },
        }),
        // Fallback: primer log del mes si no hay dato del mes anterior.
        prisma.competitorFollowerLog.findFirst({
          where: { competitorId: c.id, date: { gte: monthStart } }, orderBy: { date: 'asc' },
        }),
      ])
      const followersCount = snap?.followersCount ?? null
      const baselineLog = prevCloseLog ?? firstInMonthLog
      const monthlyGain = (followersCount != null && baselineLog)
        ? followersCount - baselineLog.followersCount
        : null
      return {
        id:             c.id,
        platform:       c.platform,
        username:       c.username,
        displayName:    c.displayName,
        profilePicUrl:  c.profilePicUrl,
        followersCount,
        mediaCount:     snap?.mediaCount ?? null,
        postsCount:     snap?.postsCount ?? null,
        avgLikes:       snap?.avgLikes ?? null,
        avgComments:    snap?.avgComments ?? null,
        engagementRate: snap?.engagementRate ?? null,
        monthlyGain,
        lastUpdated:    snap?.createdAt ?? null,
        month:          snap?.month ?? null,
        lastScrapedAt:  c.lastScrapedAt,
      }
    }))

    res.json(result)
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/competitors
 * Body: { url | username, platform? }. Agrega un competidor y hace el primer scrape
 * (ese scrape consume el cupo mensual del competidor, ver `refreshCompetitor`).
 */
async function addCompetitor(req, res, next) {
  try {
    const projectId = await assertProject(req)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const platform = req.body.platform || 'instagram'
    const driver = PLATFORM_SCRAPERS[platform]
    if (!driver) {
      return res.status(400).json({ error: `Plataforma "${platform}" no soportada. Disponibles: ${Object.keys(PLATFORM_SCRAPERS).join(', ')}.` })
    }

    const username = driver.parseId(req.body.url || req.body.username)
    if (!username) return res.status(400).json({ error: driver.invalidMsg })

    const existing = await prisma.competitorAccount.findUnique({
      where: { projectId_platform_username: { projectId, platform, username } },
    })
    if (existing) {
      const handle = platform === 'instagram' ? `@${username}` : username
      return res.status(409).json({ error: `${handle} ya está en la lista.` })
    }

    let metrics
    try {
      metrics = await driver.scrape(username, { targetMonth: currentMonthStr(), workspaceId: req.workspace.id, projectId, action: 'competitor_add', actionLabel: `Competidores — alta de cuenta (${platform})` })
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code })
    }

    const competitor = await prisma.competitorAccount.create({
      data: {
        projectId, workspaceId: req.workspace.id, platform, username,
        displayName:   metrics.name ?? null,
        profilePicUrl: metrics.profilePicUrl ?? null,
        // El scrape de alta cuenta como el scrape del mes — no habilita otro refresh hasta el mes siguiente.
        lastScrapedAt: new Date(),
      },
    })

    await persistCompetitorData(competitor.id, req.workspace.id, metrics)

    res.json({
      id: competitor.id, platform, username,
      displayName: competitor.displayName, profilePicUrl: competitor.profilePicUrl,
      followersCount: metrics.followersCount, isPrivate: metrics.isPrivate,
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/competitors/:cid/refresh
 * Re-scrapea un competidor — máximo 1 vez por mes calendario (ver `lastScrapedAt`).
 */
async function refreshCompetitor(req, res, next) {
  try {
    const projectId = await assertProject(req)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const competitorId = Number(req.params.cid)
    const competitor = await prisma.competitorAccount.findFirst({
      where: { id: competitorId, projectId },
    })
    if (!competitor) return res.status(404).json({ error: 'Competidor no encontrado' })

    if (competitor.lastScrapedAt && monthStrOfDate(competitor.lastScrapedAt) === currentMonthStr()) {
      return res.status(429).json({
        error: `Ya se actualizó este mes. Próxima actualización disponible en ${nextMonthLabel()}.`,
        code: 'MONTHLY_LIMIT',
      })
    }

    const driver = PLATFORM_SCRAPERS[competitor.platform]
    if (!driver) {
      return res.status(400).json({ error: `Plataforma "${competitor.platform}" no soportada para refresh.` })
    }

    let metrics
    try {
      metrics = await driver.scrape(competitor.username, { targetMonth: currentMonthStr(), workspaceId: req.workspace.id, projectId, action: 'competitor_refresh', actionLabel: `Competidores — refresh manual (${competitor.platform})` })
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code })
    }

    await prisma.competitorAccount.update({
      where: { id: competitorId },
      data:  {
        displayName: metrics.name ?? competitor.displayName,
        profilePicUrl: metrics.profilePicUrl ?? competitor.profilePicUrl,
        lastScrapedAt: new Date(),
      },
    })
    await persistCompetitorData(competitorId, req.workspace.id, metrics)

    res.json({ ok: true, followersCount: metrics.followersCount })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/marketing/projects/:id/competitors/:cid
 */
async function deleteCompetitor(req, res, next) {
  try {
    const projectId = await assertProject(req)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const competitorId = Number(req.params.cid)
    const competitor = await prisma.competitorAccount.findFirst({
      where: { id: competitorId, projectId }, select: { id: true },
    })
    if (!competitor) return res.status(404).json({ error: 'Competidor no encontrado' })

    await prisma.competitorAccount.delete({ where: { id: competitorId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/competitors/:cid/history?months=6
 * Snapshots mensuales + logs de seguidores para gráficos.
 */
async function getCompetitorHistory(req, res, next) {
  try {
    const projectId = await assertProject(req)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const competitorId = Number(req.params.cid)
    const competitor = await prisma.competitorAccount.findFirst({
      where: { id: competitorId, projectId },
    })
    if (!competitor) return res.status(404).json({ error: 'Competidor no encontrado' })

    const take = Math.min(Number(req.query.months) || 6, 24)
    const [snapshots, followerLogs] = await Promise.all([
      prisma.competitorSnapshot.findMany({
        where: { competitorId }, orderBy: { month: 'asc' }, take,
        select: {
          month: true, followersCount: true, mediaCount: true, postsCount: true,
          avgLikes: true, avgComments: true, engagementRate: true, topPosts: true, createdAt: true,
        },
      }),
      prisma.competitorFollowerLog.findMany({
        where: { competitorId }, orderBy: { date: 'asc' },
        select: { date: true, followersCount: true },
      }),
    ])

    res.json({
      competitor: {
        id: competitor.id, platform: competitor.platform, username: competitor.username,
        displayName: competitor.displayName, profilePicUrl: competitor.profilePicUrl,
      },
      snapshots, followerLogs,
    })
  } catch (err) { next(err) }
}

module.exports = {
  listCompetitors, addCompetitor, refreshCompetitor, deleteCompetitor, getCompetitorHistory,
}
