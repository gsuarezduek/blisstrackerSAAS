const prisma = require('../lib/prisma')
const { getValidFacebookToken }  = require('../services/metaTokenRefresh.service')
const { fetchFacebookMetrics, fetchFacebookProfile, debugPageInsights } = require('../services/facebook.service')
const { saveFacebookSnapshot }   = require('../services/facebookSnapshot.service')
const { scrapeFacebookPage, parseFacebookPage, debugScrapeFacebook } = require('../services/socialScrape.service')
const { DEFAULT_TZ } = require('../utils/dates')

// Cooldown en memoria para el refresh manual de scraping (protege el costo del proveedor).
const SCRAPE_REFRESH_COOLDOWN_MS = 30 * 60 * 1000
const scrapeCooldownMap = new Map() // integrationId → timestamp del último scrape

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function todayStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

async function getIntegrationForProject(projectId, workspaceId) {
  const project = await prisma.project.findFirst({
    where:  { id: projectId, workspaceId },
    select: { id: true },
  })
  if (!project) return { error: { status: 404, body: { error: 'Proyecto no encontrado' } } }

  const integration = await prisma.projectIntegration.findUnique({
    where: { projectId_type: { projectId, type: 'facebook' } },
  })
  if (!integration) {
    return { error: { status: 404, body: { error: 'Sin integración de Facebook', code: 'NOT_CONNECTED' } } }
  }
  return { integration }
}

// Persiste snapshot mensual + log diario de seguidores a partir de métricas ya obtenidas.
async function persistFacebookData(projectId, workspaceId, metrics) {
  const month = currentMonthStr()
  const date  = todayStr()
  await Promise.allSettled([
    saveFacebookSnapshot(projectId, workspaceId, month, metrics),
    prisma.facebookFollowerLog.upsert({
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
    page: { id: null, name: integration.propertyId ?? null },
    followersCount: snap.followersCount,
    fanCount:       snap.fanCount       ?? null,
    reach:          snap.reach          ?? null,
    impressions:    snap.impressions    ?? null,
    pageViews:      snap.pageViews      ?? null,
    engagementRate: snap.engagementRate ?? null,
    totalLikes:     snap.totalLikes     ?? null,
    totalComments:  snap.totalComments  ?? null,
    totalShares:    snap.totalShares    ?? null,
    postsThisMonth: snap.postsThisMonth ?? 0,
    topPosts,
    scraped:        true,
    lastScrapedAt:  lastScrapedAt ?? snap.createdAt,
  }
}

/**
 * GET /api/marketing/projects/:id/facebook
 * Métricas en tiempo real + auto-snapshot. Modo scrape: snapshot cacheado.
 */
async function getMetrics(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const { integration, error } = await getIntegrationForProject(projectId, workspaceId)
    if (error) return res.status(error.status).json(error.body)

    // ── Modo scraping — devuelve el último snapshot cacheado (no pega a Apify) ──
    if (integration.scopes === 'scrape') {
      const [snap, lastLog] = await Promise.all([
        prisma.facebookSnapshot.findFirst({ where: { projectId }, orderBy: { month: 'desc' } }),
        prisma.facebookFollowerLog.findFirst({ where: { projectId }, orderBy: { date: 'desc' } }),
      ])
      if (!snap) {
        return res.json({ scraped: true, page: { name: integration.propertyId }, followersCount: 0, needsRefresh: true })
      }
      return res.json(snapshotToMetrics(snap, integration, lastLog?.createdAt ?? null))
    }

    if (!integration.propertyId) {
      return res.status(400).json({ error: 'Seleccioná la página de Facebook para empezar a ver métricas.', code: 'NO_PAGE' })
    }

    const wantRefresh = req.query.refresh === '1' || req.query.refresh === 'true'

    // ── Carga normal — servir el snapshot del mes al instante (no el fetch lento) ──
    // El fetch completo a la Graph API (perfil + posts paginados + insights + reach
    // por post) tarda varios segundos; solo se hace bajo demanda con ?refresh=1.
    // Acá devolvemos el último snapshot y refrescamos en vivo solo el perfil
    // (1 llamada liviana ~0,5s) para mantener seguidores/nombre/log diario al día.
    if (!wantRefresh) {
      const [snap, lastLog] = await Promise.all([
        prisma.facebookSnapshot.findFirst({ where: { projectId }, orderBy: { month: 'desc' } }),
        prisma.facebookFollowerLog.findFirst({ where: { projectId }, orderBy: { date: 'desc' } }),
      ])
      if (snap) {
        const base = { ...snapshotToMetrics(snap, integration, lastLog?.createdAt ?? null), scraped: false, cached: true }
        try {
          const token   = getValidFacebookToken(integration)
          const profile = await fetchFacebookProfile(integration.propertyId, token)
          if (profile.name)               base.page           = { id: profile.id, name: profile.name }
          if (profile.followersCount != null) base.followersCount = profile.followersCount
          if (profile.fanCount != null)       base.fanCount       = profile.fanCount
          if (profile.followersCount != null) {
            const date = todayStr()
            prisma.facebookFollowerLog.upsert({
              where:  { projectId_date: { projectId, date } },
              update: { followersCount: profile.followersCount },
              create: { projectId, workspaceId, date, followersCount: profile.followersCount },
            }).catch(err => console.warn('[Facebook] Follower log failed:', err.message))
          }
        } catch (err) {
          // Sin token vigente o perfil no disponible → mostramos el snapshot tal cual.
          console.warn('[Facebook] Refresco liviano de perfil falló, sirvo snapshot:', err.message)
        }
        return res.json(base)
      }
      // Sin snapshot todavía (primera carga) → cae al fetch completo de abajo.
    }

    let token
    try {
      token = getValidFacebookToken(integration)
    } catch (tokenErr) {
      await prisma.projectIntegration.update({
        where: { id: integration.id }, data: { status: 'expired' },
      }).catch(err => console.error('[Facebook] Error al marcar integración expirada (token):', err.message))
      return res.status(400).json({ error: tokenErr.message, code: 'TOKEN_EXPIRED' })
    }

    let metrics
    try {
      metrics = await fetchFacebookMetrics(integration.propertyId, token)
    } catch (apiErr) {
      const status = apiErr.response?.status
      const fbErr  = apiErr.response?.data?.error
      console.error(`[Facebook] API error ${status}:`, JSON.stringify(fbErr ?? apiErr.message, null, 2))
      if (fbErr?.code === 190 || status === 401) {
        await prisma.projectIntegration.update({
          where: { id: integration.id }, data: { status: 'expired' },
        }).catch(err => console.error('[Facebook] Error al marcar integración expirada (API):', err.message))
        return res.status(400).json({ error: 'Token de Facebook inválido. Reconectá la página.', code: 'TOKEN_EXPIRED' })
      }
      const fbMsg = fbErr?.message || apiErr.message
      return res.status(502).json({ error: `Facebook devolvió un error${status ? ` (${status})` : ''}: ${fbMsg}`, code: 'API_ERROR' })
    }

    // Refresh manual: persistimos el snapshot antes de responder, así la siguiente
    // carga (que lee del snapshot) muestra los datos frescos sin condición de carrera.
    if (wantRefresh && metrics.followersCount != null) {
      await persistFacebookData(projectId, workspaceId, metrics)
        .catch(err => console.warn('[Facebook] Persistencia tras refresh falló:', err.message))
      return res.json({ ...metrics, scraped: false, cached: false })
    }

    // Primera carga sin snapshot: respondemos ya y persistimos en segundo plano.
    res.json({ ...metrics, scraped: false, cached: false })
    setImmediate(async () => {
      if (metrics.followersCount != null) {
        await persistFacebookData(projectId, workspaceId, metrics)
          .catch(err => console.warn('[Facebook] Auto-snapshot failed:', err.message))
      }
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/facebook/snapshots?months=12
 */
async function getSnapshots(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const take        = Math.min(Number(req.query.months) || 12, 24)

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const snapshots = await prisma.facebookSnapshot.findMany({
      where:   { projectId, workspaceId },
      orderBy: { month: 'asc' },
      take,
      select: {
        month: true, followersCount: true, fanCount: true, reach: true, impressions: true,
        pageViews: true, engagementRate: true, totalLikes: true, totalComments: true,
        totalShares: true, postsThisMonth: true, topPosts: true, createdAt: true,
      },
    })

    const parsed = snapshots.map(s => ({
      ...s,
      topPosts: (() => { try { return JSON.parse(s.topPosts ?? '[]') } catch { return [] } })(),
    }))

    res.json({ snapshots: parsed })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/facebook/snapshots
 * Body: { month?: "YYYY-MM" }
 */
async function saveSnapshot(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const month       = req.body.month || currentMonthStr()

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    await saveFacebookSnapshot(projectId, workspaceId, month)
    res.json({ ok: true, month })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/marketing/projects/:id/facebook/snapshots/:month
 * Borra el snapshot de un mes (YYYY-MM) + sus logs diarios de seguidores.
 */
async function deleteSnapshot(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const month       = req.params.month

    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Mes inválido (YYYY-MM)' })

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const { count } = await prisma.facebookSnapshot.deleteMany({ where: { projectId, workspaceId, month } })
    if (count === 0) return res.status(404).json({ error: 'Snapshot no encontrado' })

    await prisma.facebookFollowerLog.deleteMany({ where: { projectId, workspaceId, date: { startsWith: month } } })

    res.json({ ok: true, month })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/facebook/followers?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
async function getFollowerLog(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const to   = req.query.to   || todayStr()
    const from = req.query.from || (() => {
      const d = new Date(to)
      d.setDate(d.getDate() - 89)
      return d.toISOString().slice(0, 10)
    })()

    const logs = await prisma.facebookFollowerLog.findMany({
      where:   { projectId, workspaceId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
      select:  { date: true, followersCount: true },
    })

    res.json({ logs, from, to })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/integrations/facebook/connect-scrape
 * Conecta una Página de Facebook por scraping (sin token). Body: { url | page }.
 */
async function connectScrape(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const identifier  = parseFacebookPage(req.body.url || req.body.page || req.body.username)
    if (!identifier) return res.status(400).json({ error: 'URL o nombre de página de Facebook inválido.' })

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    let metrics
    try {
      metrics = await scrapeFacebookPage(identifier, { targetMonth: currentMonthStr(), workspaceId, projectId, action: 'connect', actionLabel: 'Facebook — conexión por scraping' })
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code })
    }

    await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type: 'facebook' } },
      update: {
        workspaceId, status: 'active', scopes: 'scrape', propertyId: identifier,
        accessToken: null, refreshToken: null, expiresAt: null,
        connectedById: req.user.userId, connectedAt: new Date(),
      },
      create: {
        projectId, workspaceId, type: 'facebook', status: 'active',
        scopes: 'scrape', propertyId: identifier,
        connectedById: req.user.userId, connectedAt: new Date(),
      },
    })

    await persistFacebookData(projectId, workspaceId, metrics)

    res.json({ ok: true, identifier, followersCount: metrics.followersCount })
  } catch (err) { next(err) }
}

/**
 * Refresca el scrape de una integración puntual de Facebook (cooldown 30 min).
 * Reutilizado por el refresh individual (HTTP) y el refresh batch cross-proyecto
 * (marketingSummary.controller.js). No responde HTTP — devuelve un resultado tipado.
 * @returns {Promise<{status:'ok', metrics:object} | {status:'cooldown', waitMins:number} | {status:'error', message:string, code?:string, httpStatus:number}>}
 */
async function refreshScrapeForIntegration(integration, projectId, workspaceId) {
  const last = scrapeCooldownMap.get(integration.id)
  if (last && Date.now() - last < SCRAPE_REFRESH_COOLDOWN_MS) {
    const waitMins = Math.ceil((SCRAPE_REFRESH_COOLDOWN_MS - (Date.now() - last)) / 60000)
    return { status: 'cooldown', waitMins }
  }

  let metrics
  try {
    metrics = await scrapeFacebookPage(integration.propertyId, { targetMonth: currentMonthStr(), workspaceId, projectId, action: 'refresh', actionLabel: 'Facebook — refresh manual' })
  } catch (err) {
    return { status: 'error', message: err.message, code: err.code, httpStatus: err.status || 400 }
  }

  scrapeCooldownMap.set(integration.id, Date.now())
  await persistFacebookData(projectId, workspaceId, metrics)

  return { status: 'ok', metrics }
}

/**
 * POST /api/marketing/projects/:id/facebook/scrape/refresh
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
      where: { projectId_type: { projectId, type: 'facebook' } },
    })
    if (!integration || integration.scopes !== 'scrape') {
      return res.status(400).json({ error: 'Este proyecto no está conectado por scraping.', code: 'NOT_SCRAPE' })
    }

    const result = await refreshScrapeForIntegration(integration, projectId, workspaceId)
    if (result.status === 'cooldown') {
      return res.status(429).json({ error: `Esperá ${result.waitMins} min para actualizar de nuevo.`, code: 'COOLDOWN', waitMins: result.waitMins })
    }
    if (result.status === 'error') {
      return res.status(result.httpStatus).json({ error: result.message, code: result.code })
    }

    res.json({ ...result.metrics, lastScrapedAt: new Date() })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/facebook/scrape-debug?page=<url|slug>
 * Diagnóstico del scraping: output crudo de Apify + lo normalizado.
 */
async function scrapeDebug(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    let page = req.query.page || req.query.company
    if (!page) {
      const integration = await prisma.projectIntegration.findUnique({
        where: { projectId_type: { projectId, type: 'facebook' } },
      })
      page = integration?.propertyId
    }
    if (!page) return res.status(400).json({ error: 'Indicá la página (?page=) o conectá Facebook por scraping primero.' })

    let result
    try {
      result = await debugScrapeFacebook(page, { workspaceId, projectId, targetMonth: currentMonthStr() })
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code })
    }
    res.json(result)
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/facebook/insights-debug
 * Diagnóstico de los insights (alcance/impresiones/pageViews) de la conexión por
 * API oficial / token: scopes del token + respuesta cruda de la Graph API por métrica.
 */
async function insightsDebug(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const { integration, error } = await getIntegrationForProject(projectId, workspaceId)
    if (error) return res.status(error.status).json(error.body)

    if (integration.scopes === 'scrape') {
      return res.status(400).json({ error: 'Esta integración es por scraping; el diagnóstico de insights aplica solo a la conexión oficial o por token. Usá "🔍 Diagnóstico" de scraping.', code: 'SCRAPE_MODE' })
    }
    if (!integration.propertyId) {
      return res.status(400).json({ error: 'Seleccioná la página de Facebook primero.', code: 'NO_PAGE' })
    }

    let token
    try {
      token = getValidFacebookToken(integration)
    } catch (tokenErr) {
      return res.status(400).json({ error: tokenErr.message, code: 'TOKEN_EXPIRED' })
    }

    const result = await debugPageInsights(integration.propertyId, token)
    res.json({ propertyId: integration.propertyId, scopes: integration.scopes, ...result })
  } catch (err) { next(err) }
}

module.exports = { getMetrics, getSnapshots, saveSnapshot, deleteSnapshot, getFollowerLog, connectScrape, refreshScrape, refreshScrapeForIntegration, scrapeDebug, insightsDebug }
