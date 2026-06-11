const prisma = require('../lib/prisma')
const { scrapeInstagramProfile, parseInstagramUsername } = require('../services/socialScrape.service')
const { cacheImagesInArray } = require('../services/socialImageCache.service')

// Cooldown en memoria para el refresh manual (protege costo del proveedor de scraping).
const REFRESH_COOLDOWN_MS = 30 * 60 * 1000
const cooldownMap = new Map() // competitorId → timestamp del último scrape

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function todayStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
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
      const [snap, monthStartLog] = await Promise.all([
        prisma.competitorSnapshot.findFirst({ where: { competitorId: c.id }, orderBy: { month: 'desc' } }),
        prisma.competitorFollowerLog.findFirst({
          where: { competitorId: c.id, date: { gte: monthStart } }, orderBy: { date: 'asc' },
        }),
      ])
      const followersCount = snap?.followersCount ?? null
      const monthlyGain = (followersCount != null && monthStartLog)
        ? followersCount - monthStartLog.followersCount
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
      }
    }))

    res.json(result)
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/competitors
 * Body: { url | username, platform? }. Agrega un competidor y hace el primer scrape.
 */
async function addCompetitor(req, res, next) {
  try {
    const projectId = await assertProject(req)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const platform = req.body.platform || 'instagram'
    if (platform !== 'instagram') {
      return res.status(400).json({ error: 'Por ahora solo se soporta Instagram.' })
    }

    const username = parseInstagramUsername(req.body.url || req.body.username)
    if (!username) return res.status(400).json({ error: 'Usuario o URL de Instagram inválido.' })

    const existing = await prisma.competitorAccount.findUnique({
      where: { projectId_platform_username: { projectId, platform, username } },
    })
    if (existing) return res.status(409).json({ error: `@${username} ya está en la lista.` })

    let metrics
    try {
      metrics = await scrapeInstagramProfile(username, { targetMonth: currentMonthStr() })
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code })
    }

    const competitor = await prisma.competitorAccount.create({
      data: {
        projectId, workspaceId: req.workspace.id, platform, username,
        displayName:   metrics.name ?? null,
        profilePicUrl: metrics.profilePicUrl ?? null,
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
 * Re-scrapea un competidor (cooldown 30 min).
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

    const last = cooldownMap.get(competitorId)
    if (last && Date.now() - last < REFRESH_COOLDOWN_MS) {
      const waitMins = Math.ceil((REFRESH_COOLDOWN_MS - (Date.now() - last)) / 60000)
      return res.status(429).json({ error: `Esperá ${waitMins} min para actualizar de nuevo.`, code: 'COOLDOWN', waitMins })
    }

    let metrics
    try {
      metrics = await scrapeInstagramProfile(competitor.username, { targetMonth: currentMonthStr() })
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code })
    }

    cooldownMap.set(competitorId, Date.now())

    await prisma.competitorAccount.update({
      where: { id: competitorId },
      data:  { displayName: metrics.name ?? competitor.displayName, profilePicUrl: metrics.profilePicUrl ?? competitor.profilePicUrl },
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
