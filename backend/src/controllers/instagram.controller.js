const prisma  = require('../lib/prisma')
const { getValidMetaToken }        = require('../services/metaTokenRefresh.service')
const { fetchInstagramMetrics }    = require('../services/instagram.service')
const { saveInstagramSnapshot }    = require('../services/instagramSnapshot.service')

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * GET /api/marketing/projects/:id/instagram
 * Retorna métricas en tiempo real de Instagram para el proyecto.
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

    const token   = await getValidMetaToken(integration)
    const metrics = await fetchInstagramMetrics(integration.propertyId, token)

    res.json(metrics)

    // Auto-snapshot silencioso: actualiza el mes actual sin bloquear la respuesta
    setImmediate(() => {
      saveInstagramSnapshot(projectId, workspaceId, currentMonthStr(), metrics)
        .catch(err => console.warn('[Instagram] Auto-snapshot failed:', err.message))
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
        postsCount: true, createdAt: true,
      },
    })

    res.json({ snapshots })
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

module.exports = { getMetrics, getSnapshots, saveSnapshot }
