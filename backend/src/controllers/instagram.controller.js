const prisma  = require('../lib/prisma')
const { getValidMetaToken }        = require('../services/metaTokenRefresh.service')
const { fetchInstagramMetrics }    = require('../services/instagram.service')
const { saveInstagramSnapshot }    = require('../services/instagramSnapshot.service')
const { scrapeInstagramProfile, parseInstagramUsername } = require('../services/socialScrape.service')

// Cooldown en memoria para el refresh manual de scraping (protege costo del proveedor).
const SCRAPE_REFRESH_COOLDOWN_MS = 30 * 60 * 1000
const scrapeCooldownMap = new Map() // integrationId → timestamp del último scrape

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function todayStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// Persiste snapshot mensual + log diario de seguidores a partir de métricas ya obtenidas.
async function persistScrapeData(projectId, workspaceId, metrics) {
  const month = currentMonthStr()
  const date  = todayStr()
  await Promise.allSettled([
    saveInstagramSnapshot(projectId, workspaceId, month, metrics),
    prisma.instagramFollowerLog.upsert({
      where:  { projectId_date: { projectId, date } },
      update: { followersCount: metrics.followersCount },
      create: { projectId, workspaceId, date, followersCount: metrics.followersCount },
    }),
  ])
}

// Reconstruye el shape de métricas a partir de un snapshot guardado (modo scraping cacheado).
function snapshotToMetrics(snap, integration, lastScrapedAt = null) {
  let topPosts = []
  try { topPosts = JSON.parse(snap.topPosts || '[]') } catch { topPosts = [] }
  return {
    followersCount: snap.followersCount,
    mediaCount:     snap.mediaCount ?? null,
    name:           null,
    username:       integration.propertyId ?? null,
    profilePicUrl:  null,
    biography:      null,
    website:        null,
    avgLikes:       snap.avgLikes ?? null,
    avgComments:    snap.avgComments ?? null,
    engagementRate: snap.engagementRate ?? null,
    postsThisMonth: snap.postsCount ?? 0,
    bestPost:       topPosts[0] ?? null,
    topPosts,
    byType:         [],
    bestHour:       null,
    recentMedia:    topPosts,
    // Insights cacheados (null en scraping)
    reachThisMonth: snap.reach       ?? null,
    viewsThisMonth: snap.views       ?? null,
    totalSaved:     snap.totalSaved  ?? null,
    totalShares:    snap.totalShares ?? null,
    avgReach:       snap.avgReach    ?? null,
    bestByReach:    topPosts.filter(p => p.reach != null).sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))[0] ?? null,
    scraped:        true,
    lastScrapedAt:  lastScrapedAt ?? snap.createdAt,
  }
}

/**
 * GET /api/marketing/projects/:id/instagram
 * Retorna métricas en tiempo real de Instagram para el proyecto.
 * Tras responder, guarda silenciosamente el snapshot mensual y el log diario de seguidores.
 */
async function getMetrics(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'instagram' } },
    })
    if (!integration) {
      return res.status(404).json({ error: 'Sin integración de Instagram', code: 'NOT_CONNECTED' })
    }

    // ── Modo scraping ─────────────────────────────────────────────────────────
    // No le pega a Apify en cada visita (costo): devuelve el último snapshot
    // cacheado. El refresh manual (POST .../scrape/refresh) trae datos frescos.
    if (integration.scopes === 'scrape') {
      const [snap, lastLog] = await Promise.all([
        prisma.instagramSnapshot.findFirst({ where: { projectId }, orderBy: { month: 'desc' } }),
        prisma.instagramFollowerLog.findFirst({ where: { projectId }, orderBy: { date: 'desc' } }),
      ])
      if (!snap) {
        return res.json({
          scraped: true, username: integration.propertyId, followersCount: 0,
          needsRefresh: true,
        })
      }
      return res.json(snapshotToMetrics(snap, integration, lastLog?.createdAt ?? null))
    }

    let token
    try {
      token = await getValidMetaToken(integration)
    } catch (tokenErr) {
      await prisma.projectIntegration.update({
        where: { id: integration.id },
        data:  { status: 'expired' },
      })
      return res.status(400).json({ error: tokenErr.message, code: 'TOKEN_EXPIRED' })
    }

    let metrics
    try {
      const useFbGraph = integration.scopes?.startsWith('fb_graph')
      metrics = await fetchInstagramMetrics(integration.propertyId, token, null, useFbGraph)
    } catch (apiErr) {
      const igErrCode = apiErr.response?.data?.error?.code
      const igErrMsg  = apiErr.response?.data?.error?.message ?? ''
      // Error 190 = token inválido/expirado; también capturamos OAuthException genérico
      if (apiErr.response?.status === 400 || igErrCode === 190 || igErrMsg.includes('OAuthException')) {
        await prisma.projectIntegration.update({
          where: { id: integration.id },
          data:  { status: 'expired' },
        })
        return res.status(400).json({ error: 'El token de Instagram expiró. Reconectá la cuenta desde la configuración del proyecto.', code: 'TOKEN_EXPIRED' })
      }
      throw apiErr
    }

    res.json(metrics)

    // Auto-persistencia silenciosa — no bloquea la respuesta
    setImmediate(async () => {
      const month = currentMonthStr()
      const date  = todayStr()
      await Promise.allSettled([
        // Snapshot mensual (upsert — se actualiza cada visita)
        saveInstagramSnapshot(projectId, workspaceId, month, metrics)
          .catch(err => console.warn('[Instagram] Auto-snapshot failed:', err.message)),
        // Log diario de seguidores (upsert — un registro por día)
        prisma.instagramFollowerLog.upsert({
          where:  { projectId_date: { projectId, date } },
          update: { followersCount: metrics.followersCount },
          create: { projectId, workspaceId, date, followersCount: metrics.followersCount },
        }).catch(err => console.warn('[Instagram] Follower log failed:', err.message)),
      ])
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/instagram/snapshots?months=12
 * Lista snapshots mensuales históricos de Instagram.
 */
async function getSnapshots(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const take        = Math.min(Number(req.query.months) || 12, 24)

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const snapshots = await prisma.instagramSnapshot.findMany({
      where:   { projectId, workspaceId },
      orderBy: { month: 'asc' },
      take,
      select: {
        month: true, followersCount: true, mediaCount: true,
        avgLikes: true, avgComments: true, engagementRate: true,
        postsCount: true, topPosts: true, createdAt: true,
        reach: true, views: true, totalSaved: true, totalShares: true, avgReach: true,
      },
    })

    // Parseamos topPosts (JSON) para que el front pueda mostrar el "Top del mes"
    // también en meses anteriores.
    const parsed = snapshots.map(s => {
      let topPosts = []
      try { topPosts = JSON.parse(s.topPosts || '[]') } catch { topPosts = [] }
      return { ...s, topPosts }
    })

    res.json({ snapshots: parsed })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/instagram/snapshots
 * Guarda manualmente un snapshot del mes indicado (o mes actual).
 * Body: { month?: "YYYY-MM" }
 */
async function saveSnapshot(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const month       = req.body.month || currentMonthStr()

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    await saveInstagramSnapshot(projectId, workspaceId, month)
    res.json({ ok: true, month })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/instagram/followers?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Devuelve el historial diario de seguidores entre dos fechas.
 * Si no se pasan fechas, devuelve los últimos 90 días.
 */
async function getFollowerLog(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const to   = req.query.to   || todayStr()
    const from = req.query.from || (() => {
      const d = new Date(to)
      d.setDate(d.getDate() - 89)
      return d.toISOString().slice(0, 10)
    })()

    const logs = await prisma.instagramFollowerLog.findMany({
      where: {
        projectId,
        workspaceId,
        date: { gte: from, lte: to },
      },
      orderBy: { date: 'asc' },
      select:  { date: true, followersCount: true },
    })

    res.json({ logs, from, to })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/integrations/instagram/connect-scrape
 * Conecta Instagram por scraping (sin token). Body: { url | username }.
 * Valida con un scrape inicial y guarda snapshot + log de seguidores.
 */
async function connectScrape(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const username    = parseInstagramUsername(req.body.url || req.body.username)
    if (!username) return res.status(400).json({ error: 'Usuario o URL de Instagram inválido.' })

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    let metrics
    try {
      metrics = await scrapeInstagramProfile(username, { targetMonth: currentMonthStr(), workspaceId, context: 'Instagram — conexión por scraping' })
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code })
    }

    await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type: 'instagram' } },
      update: {
        workspaceId, status: 'active', scopes: 'scrape', propertyId: username,
        accessToken: null, refreshToken: null, expiresAt: null,
        connectedById: req.user.userId, connectedAt: new Date(),
      },
      create: {
        projectId, workspaceId, type: 'instagram', status: 'active',
        scopes: 'scrape', propertyId: username,
        connectedById: req.user.userId, connectedAt: new Date(),
      },
    })

    await persistScrapeData(projectId, workspaceId, metrics)

    res.json({ ok: true, username, followersCount: metrics.followersCount, isPrivate: metrics.isPrivate })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/instagram/scrape/refresh
 * Fuerza un scrape fresco (cooldown 30 min) y actualiza snapshot + log.
 */
async function refreshScrape(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'instagram' } },
    })
    if (!integration || integration.scopes !== 'scrape') {
      return res.status(400).json({ error: 'Este proyecto no está conectado por scraping.', code: 'NOT_SCRAPE' })
    }

    const last = scrapeCooldownMap.get(integration.id)
    if (last && Date.now() - last < SCRAPE_REFRESH_COOLDOWN_MS) {
      const waitMins = Math.ceil((SCRAPE_REFRESH_COOLDOWN_MS - (Date.now() - last)) / 60000)
      return res.status(429).json({ error: `Esperá ${waitMins} min para actualizar de nuevo.`, code: 'COOLDOWN', waitMins })
    }

    let metrics
    try {
      metrics = await scrapeInstagramProfile(integration.propertyId, { targetMonth: currentMonthStr(), workspaceId, context: 'Instagram — refresh manual' })
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code })
    }

    scrapeCooldownMap.set(integration.id, Date.now())
    await persistScrapeData(projectId, workspaceId, metrics)

    res.json({ ...metrics, username: integration.propertyId, lastScrapedAt: new Date() })
  } catch (err) { next(err) }
}

module.exports = { getMetrics, getSnapshots, saveSnapshot, getFollowerLog, connectScrape, refreshScrape }
