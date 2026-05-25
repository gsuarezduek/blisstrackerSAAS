const prisma = require('../lib/prisma')
const { getValidLinkedinToken }     = require('../services/linkedinTokenRefresh.service')
const { fetchLinkedinMetrics, listAdminOrganizations } = require('../services/linkedin.service')
const { saveLinkedinSnapshot }      = require('../services/linkedinSnapshot.service')

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
      return res.status(502).json({ error: 'Error al obtener datos de LinkedIn', code: 'API_ERROR' })
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
    if (err.response?.status === 401) {
      return res.status(400).json({ error: 'Token de LinkedIn inválido. Reconectá la cuenta.', code: 'TOKEN_EXPIRED' })
    }
    next(err)
  }
}

module.exports = { getMetrics, getSnapshots, saveSnapshot, getFollowerLog, listOrganizations }
