const prisma  = require('../lib/prisma')
const { getValidMetaToken }        = require('../services/metaTokenRefresh.service')
const { fetchInstagramMetrics }    = require('../services/instagram.service')
const { saveInstagramSnapshot }    = require('../services/instagramSnapshot.service')

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function todayStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
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

    const token   = await getValidMetaToken(integration)
    const metrics = await fetchInstagramMetrics(integration.propertyId, token)

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

module.exports = { getMetrics, getSnapshots, saveSnapshot, getFollowerLog }
