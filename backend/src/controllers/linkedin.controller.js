const prisma = require('../lib/prisma')
const { getValidLinkedinToken }     = require('../services/linkedinTokenRefresh.service')
const { fetchLinkedinMetrics, listAdminOrganizations } = require('../services/linkedin.service')
const { saveLinkedinSnapshot }      = require('../services/linkedinSnapshot.service')
const { scrapeLinkedinCompany, parseLinkedinCompany, debugScrapeLinkedin } = require('../services/socialScrape.service')

// Cooldown en memoria para el refresh manual de scraping (protege el costo del proveedor).
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

async function getIntegrationForProject(projectId, workspaceId) {
  const project = await prisma.project.findFirst({
    where:  { id: projectId, workspaceId },
    select: { id: true },
  })
  if (!project) return { error: { status: 404, body: { error: 'Proyecto no encontrado' } } }

  const integration = await prisma.projectIntegration.findUnique({
    where: { projectId_type: { projectId, type: 'linkedin' } },
  })
  if (!integration) {
    return { error: { status: 404, body: { error: 'Sin integración de LinkedIn', code: 'NOT_CONNECTED' } } }
  }
  return { integration }
}

// Persiste snapshot mensual + log diario de seguidores a partir de métricas ya obtenidas.
async function persistScrapeData(projectId, workspaceId, metrics) {
  const month = currentMonthStr()
  const date  = todayStr()
  await Promise.allSettled([
    saveLinkedinSnapshot(projectId, workspaceId, month, metrics),
    prisma.linkedinFollowerLog.upsert({
      where:  { projectId_date: { projectId, date } },
      update: { followersCount: metrics.followersCount },
      create: { projectId, workspaceId, date, followersCount: metrics.followersCount },
    }),
  ])
}

// Reconstruye el shape de métricas a partir de un snapshot guardado (modo scraping cacheado).
function snapshotToMetrics(snap, integration, lastScrapedAt = null) {
  let topPosts = []
  let demographics = { industry: [], seniority: [], function: [], region: [] }
  try { topPosts     = JSON.parse(snap.topPosts     || '[]') } catch { topPosts = [] }
  try { demographics = JSON.parse(snap.demographics || '{}') } catch { /* keep default */ }
  return {
    org: { id: null, name: integration.propertyId ?? null, vanityName: integration.propertyId ?? null, logoUrl: null },
    followersCount: snap.followersCount,
    pageViews:      snap.pageViews      ?? null,
    uniqueVisitors: snap.uniqueVisitors ?? null,
    impressions:    snap.impressions    ?? null,
    clicks:         snap.clicks         ?? null,
    ctr:            snap.ctr            ?? null,
    totalLikes:     snap.totalLikes     ?? null,
    totalComments:  snap.totalComments  ?? null,
    totalShares:    snap.totalShares    ?? null,
    engagementRate: snap.engagementRate ?? null,
    postsThisMonth: snap.postsThisMonth ?? 0,
    topPosts,
    demographics,
    scraped:        true,
    lastScrapedAt:  lastScrapedAt ?? snap.createdAt,
  }
}

/**
 * GET /api/marketing/projects/:id/linkedin
 * Métricas en tiempo real + auto-snapshot.
 */
async function getMetrics(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const { integration, error } = await getIntegrationForProject(projectId, workspaceId)
    if (error) return res.status(error.status).json(error.body)

    // ── Modo scraping ─────────────────────────────────────────────────────────
    // No le pega a Apify en cada visita (costo): devuelve el último snapshot
    // cacheado. El refresh manual (POST .../scrape/refresh) trae datos frescos.
    if (integration.scopes === 'scrape') {
      const [snap, lastLog] = await Promise.all([
        prisma.linkedinSnapshot.findFirst({ where: { projectId }, orderBy: { month: 'desc' } }),
        prisma.linkedinFollowerLog.findFirst({ where: { projectId }, orderBy: { date: 'desc' } }),
      ])
      if (!snap) {
        return res.json({
          scraped: true, org: { name: integration.propertyId }, followersCount: 0,
          needsRefresh: true,
        })
      }
      return res.json(snapshotToMetrics(snap, integration, lastLog?.createdAt ?? null))
    }

    if (!integration.propertyId) {
      return res.status(400).json({
        error: 'Seleccioná la organización de LinkedIn para empezar a ver métricas.',
        code:  'NO_ORGANIZATION',
      })
    }

    let token
    try {
      token = await getValidLinkedinToken(integration)
    } catch (tokenErr) {
      await prisma.projectIntegration.update({
        where: { id: integration.id },
        data:  { status: 'expired' },
      }).catch(err => console.error('[LinkedIn] Error al marcar integración expirada (token):', err.message))
      return res.status(400).json({ error: tokenErr.message, code: 'TOKEN_EXPIRED' })
    }

    let metrics
    try {
      metrics = await fetchLinkedinMetrics(integration.propertyId, token)
    } catch (apiErr) {
      const status = apiErr.response?.status
      const liErr  = apiErr.response?.data
      console.error(`[LinkedIn] API error ${status}:`, JSON.stringify(liErr ?? apiErr.message, null, 2))
      if (status === 401) {
        await prisma.projectIntegration.update({
          where: { id: integration.id },
          data:  { status: 'expired' },
        }).catch(err => console.error('[LinkedIn] Error al marcar integración expirada (API 401):', err.message))
        return res.status(400).json({ error: 'Token de LinkedIn inválido. Reconectá la cuenta.', code: 'TOKEN_EXPIRED' })
      }
      const liMsg = liErr?.message || liErr?.error_description || apiErr.message
      const versionHint = /version/i.test(liMsg || '') ? ' · La versión de la API venció: actualizá LINKEDIN_API_VERSION a una vigente.' : ''
      return res.status(502).json({ error: `LinkedIn devolvió un error${status ? ` (${status})` : ''}: ${liMsg}${versionHint}`, code: 'API_ERROR' })
    }

    res.json(metrics)

    setImmediate(async () => {
      const month = currentMonthStr()
      const date  = todayStr()
      if (metrics.followersCount != null) {
        await Promise.allSettled([
          saveLinkedinSnapshot(projectId, workspaceId, month, metrics)
            .catch(err => console.warn('[LinkedIn] Auto-snapshot failed:', err.message)),
          prisma.linkedinFollowerLog.upsert({
            where:  { projectId_date: { projectId, date } },
            update: { followersCount: metrics.followersCount },
            create: { projectId, workspaceId, date, followersCount: metrics.followersCount },
          }).catch(err => console.warn('[LinkedIn] Follower log failed:', err.message)),
        ])
      }
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/linkedin/snapshots?months=12
 */
async function getSnapshots(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const take        = Math.min(Number(req.query.months) || 12, 24)

    const project = await prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const snapshots = await prisma.linkedinSnapshot.findMany({
      where:   { projectId, workspaceId },
      orderBy: { month: 'asc' },
      take,
      select: {
        month: true, followersCount: true, pageViews: true, uniqueVisitors: true,
        impressions: true, clicks: true, ctr: true, engagementRate: true,
        totalLikes: true, totalComments: true, totalShares: true,
        postsThisMonth: true, topPosts: true, demographics: true, createdAt: true,
      },
    })

    // Parsear los JSON del lado servidor para que el frontend reciba objetos
    const parsed = snapshots.map(s => ({
      ...s,
      topPosts:     (() => { try { return JSON.parse(s.topPosts     ?? '[]') } catch { return [] } })(),
      demographics: (() => { try { return JSON.parse(s.demographics ?? '{}') } catch { return {} } })(),
    }))

    res.json({ snapshots: parsed })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/linkedin/snapshots
 * Body: { month?: "YYYY-MM" }
 */
async function saveSnapshot(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const month       = req.body.month || currentMonthStr()

    const project = await prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    await saveLinkedinSnapshot(projectId, workspaceId, month)
    res.json({ ok: true, month })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/marketing/projects/:id/linkedin/snapshots/:month
 * Borra el snapshot de un mes (YYYY-MM) + sus logs diarios de seguidores.
 */
async function deleteSnapshot(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const month       = req.params.month

    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Mes inválido (YYYY-MM)' })

    const project = await prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const { count } = await prisma.linkedinSnapshot.deleteMany({ where: { projectId, workspaceId, month } })
    if (count === 0) return res.status(404).json({ error: 'Snapshot no encontrado' })

    await prisma.linkedinFollowerLog.deleteMany({ where: { projectId, workspaceId, date: { startsWith: month } } })

    res.json({ ok: true, month })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/linkedin/followers?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
async function getFollowerLog(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const to   = req.query.to   || todayStr()
    const from = req.query.from || (() => {
      const d = new Date(to)
      d.setDate(d.getDate() - 89)
      return d.toISOString().slice(0, 10)
    })()

    const logs = await prisma.linkedinFollowerLog.findMany({
      where:   { projectId, workspaceId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
      select:  { date: true, followersCount: true },
    })

    res.json({ logs, from, to })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/linkedin/orgs
 * Lista las organizaciones donde el user es admin.
 * Usado para el dropdown de selección post-OAuth.
 */
async function listOrganizations(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const { integration, error } = await getIntegrationForProject(projectId, workspaceId)
    if (error) return res.status(error.status).json(error.body)

    let token
    try { token = await getValidLinkedinToken(integration) }
    catch (tokenErr) {
      await prisma.projectIntegration.update({
        where: { id: integration.id }, data: { status: 'expired' },
      }).catch(() => {})
      return res.status(400).json({ error: tokenErr.message, code: 'TOKEN_EXPIRED' })
    }

    const orgs = await listAdminOrganizations(token)
    res.json({ orgs, selectedId: integration.propertyId ?? null })
  } catch (err) {
    console.error('[LinkedIn] listOrganizations error:', err.response?.data ?? err.message)
    const status = err.response?.status
    const liMsg  = err.response?.data?.message || err.response?.data?.error_description || err.message
    if (status === 401) {
      return res.status(400).json({ error: 'Token de LinkedIn inválido. Reconectá la cuenta.', code: 'TOKEN_EXPIRED' })
    }
    if (status === 403) {
      return res.status(400).json({
        error: `LinkedIn rechazó el acceso (403): ${liMsg}. Verificá que el producto "Community Management API" esté aprobado en la app y que los scopes r_organization_admin / r_organization_social estén concedidos.`,
        code:  'FORBIDDEN',
      })
    }
    return res.status(502).json({ error: `Error de LinkedIn al listar tus páginas: ${liMsg}`, code: 'API_ERROR' })
  }
}

/**
 * POST /api/marketing/projects/:id/integrations/linkedin/connect-scrape
 * Conecta una Company Page de LinkedIn por scraping (sin token). Body: { url | company }.
 * Valida con un scrape inicial y guarda snapshot + log de seguidores.
 */
async function connectScrape(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const identifier  = parseLinkedinCompany(req.body.url || req.body.company || req.body.username)
    if (!identifier) return res.status(400).json({ error: 'URL o nombre de empresa de LinkedIn inválido.' })

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    let metrics
    try {
      metrics = await scrapeLinkedinCompany(identifier, { targetMonth: currentMonthStr(), workspaceId, context: 'LinkedIn — conexión por scraping' })
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code })
    }

    await prisma.projectIntegration.upsert({
      where:  { projectId_type: { projectId, type: 'linkedin' } },
      update: {
        workspaceId, status: 'active', scopes: 'scrape', propertyId: identifier,
        accessToken: null, refreshToken: null, expiresAt: null,
        connectedById: req.user.userId, connectedAt: new Date(),
      },
      create: {
        projectId, workspaceId, type: 'linkedin', status: 'active',
        scopes: 'scrape', propertyId: identifier,
        connectedById: req.user.userId, connectedAt: new Date(),
      },
    })

    await persistScrapeData(projectId, workspaceId, metrics)

    res.json({ ok: true, identifier, followersCount: metrics.followersCount })
  } catch (err) { next(err) }
}

/**
 * Refresca el scrape de una integración puntual de LinkedIn (cooldown 30 min).
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
    metrics = await scrapeLinkedinCompany(integration.propertyId, { targetMonth: currentMonthStr(), workspaceId, context: 'LinkedIn — refresh manual' })
  } catch (err) {
    return { status: 'error', message: err.message, code: err.code, httpStatus: err.status || 400 }
  }

  scrapeCooldownMap.set(integration.id, Date.now())
  await persistScrapeData(projectId, workspaceId, metrics)

  return { status: 'ok', metrics }
}

/**
 * POST /api/marketing/projects/:id/linkedin/scrape/refresh
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
      where: { projectId_type: { projectId, type: 'linkedin' } },
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
 * GET /api/marketing/projects/:id/linkedin/scrape-debug?company=<url|slug>
 * Diagnóstico del scraping: devuelve el output crudo de Apify + lo normalizado.
 * Sin ?company= usa la empresa de la integración conectada.
 */
async function scrapeDebug(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    let company = req.query.company
    if (!company) {
      const integration = await prisma.projectIntegration.findUnique({
        where: { projectId_type: { projectId, type: 'linkedin' } },
      })
      company = integration?.propertyId
    }
    if (!company) return res.status(400).json({ error: 'Indicá la empresa (?company=) o conectá LinkedIn por scraping primero.' })

    let result
    try {
      result = await debugScrapeLinkedin(company, { workspaceId, targetMonth: currentMonthStr() })
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message, code: err.code })
    }
    res.json(result)
  } catch (err) { next(err) }
}

module.exports = { getMetrics, getSnapshots, saveSnapshot, deleteSnapshot, getFollowerLog, listOrganizations, connectScrape, refreshScrape, refreshScrapeForIntegration, scrapeDebug }
