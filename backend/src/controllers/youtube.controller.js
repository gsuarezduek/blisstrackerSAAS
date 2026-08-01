const prisma = require('../lib/prisma')
const { getValidAccessToken }   = require('../services/tokenRefresh.service')
const { fetchYouTubeMetrics }   = require('../services/youtube.service')
const { saveYouTubeSnapshot }   = require('../services/youtubeSnapshot.service')
const { DEFAULT_TZ } = require('../utils/dates')

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function todayStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * GET /api/marketing/projects/:id/youtube
 */
async function getMetrics(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId }, select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'google_youtube' } },
    })
    if (!integration) {
      return res.status(404).json({ error: 'Sin integración de YouTube', code: 'NOT_CONNECTED' })
    }

    let token
    try {
      token = await getValidAccessToken(integration)
    } catch (tokenErr) {
      await prisma.projectIntegration.update({
        where: { id: integration.id }, data: { status: 'expired' },
      }).catch(err => console.error('[YouTube] Error al marcar integración expirada (token):', err.message))
      return res.status(400).json({ error: tokenErr.message, code: 'TOKEN_EXPIRED' })
    }

    let metrics
    try {
      metrics = await fetchYouTubeMetrics(token, null, integration.propertyId || null)
    } catch (apiErr) {
      const status = apiErr.response?.status
      console.error(`[YouTube] API error ${status}:`, JSON.stringify(apiErr.response?.data ?? apiErr.message, null, 2))
      if (status === 401) {
        await prisma.projectIntegration.update({
          where: { id: integration.id }, data: { status: 'expired' },
        }).catch(err => console.error('[YouTube] Error al marcar integración expirada (API 401):', err.message))
        return res.status(400).json({ error: 'Token de Google inválido. Reconectá la cuenta.', code: 'TOKEN_EXPIRED' })
      }
      if (apiErr.code === 'CHANNEL_NOT_FOUND') {
        return res.status(404).json({ error: 'La cuenta de Google no tiene un canal de YouTube asociado.', code: 'CHANNEL_NOT_FOUND' })
      }
      return res.status(502).json({ error: 'Error al obtener datos de YouTube', code: 'API_ERROR' })
    }

    res.json(metrics)

    // Auto-persistencia silenciosa (snapshot del mes + log diario de suscriptores)
    setImmediate(async () => {
      const month = currentMonthStr()
      const date  = todayStr()
      if (metrics.subscriberCount != null) {
        await Promise.allSettled([
          saveYouTubeSnapshot(projectId, workspaceId, month, metrics)
            .catch(err => console.warn('[YouTube] Auto-snapshot failed:', err.message)),
          prisma.youTubeFollowerLog.upsert({
            where:  { projectId_date: { projectId, date } },
            update: { followersCount: metrics.subscriberCount },
            create: { projectId, workspaceId, date, followersCount: metrics.subscriberCount },
          }).catch(err => console.warn('[YouTube] Subscriber log failed:', err.message)),
        ])
      }
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/youtube/snapshots?months=12
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

    const snapshots = await prisma.youTubeSnapshot.findMany({
      where:   { projectId, workspaceId },
      orderBy: { month: 'asc' },
      take,
      select: {
        month: true, subscriberCount: true, videoCount: true, viewCountTotal: true,
        monthViews: true, videosThisMonth: true, longsThisMonth: true, shortsThisMonth: true,
        avgViews: true, avgLikes: true, avgComments: true, engagementRate: true, createdAt: true,
      },
    })

    res.json({ snapshots })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/youtube/snapshots  body: { month? }
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

    await saveYouTubeSnapshot(projectId, workspaceId, month)
    res.json({ ok: true, month })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/marketing/projects/:id/youtube/snapshots/:month
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

    const { count } = await prisma.youTubeSnapshot.deleteMany({ where: { projectId, workspaceId, month } })
    if (count === 0) return res.status(404).json({ error: 'Snapshot no encontrado' })

    await prisma.youTubeFollowerLog.deleteMany({ where: { projectId, workspaceId, date: { startsWith: month } } })

    res.json({ ok: true, month })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/youtube/followers?from=YYYY-MM-DD&to=YYYY-MM-DD
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

    const logs = await prisma.youTubeFollowerLog.findMany({
      where:   { projectId, workspaceId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
      select:  { date: true, followersCount: true },
    })

    res.json({ logs, from, to })
  } catch (err) { next(err) }
}

module.exports = { getMetrics, getSnapshots, saveSnapshot, deleteSnapshot, getFollowerLog }
