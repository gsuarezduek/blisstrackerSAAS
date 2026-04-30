const prisma = require('../lib/prisma')
const { getValidTikTokToken }  = require('../services/tiktokTokenRefresh.service')
const { fetchTikTokMetrics }   = require('../services/tiktok.service')
const { saveTikTokSnapshot }   = require('../services/tiktokSnapshot.service')

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function todayStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * GET /api/marketing/projects/:id/tiktok
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
      where: { projectId_type: { projectId, type: 'tiktok' } },
    })
    if (!integration) {
      return res.status(404).json({ error: 'Sin integración de TikTok', code: 'NOT_CONNECTED' })
    }

    const token   = await getValidTikTokToken(integration)
    const metrics = await fetchTikTokMetrics(token)

    res.json(metrics)

    // Auto-persistencia silenciosa
    setImmediate(async () => {
      const month = currentMonthStr()
      const date  = todayStr()
      await Promise.allSettled([
        saveTikTokSnapshot(projectId, workspaceId, month, metrics)
          .catch(err => console.warn('[TikTok] Auto-snapshot failed:', err.message)),
        prisma.tikTokFollowerLog.upsert({
          where:  { projectId_date: { projectId, date } },
          update: { followersCount: metrics.followersCount },
          create: { projectId, workspaceId, date, followersCount: metrics.followersCount },
        }).catch(err => console.warn('[TikTok] Follower log failed:', err.message)),
      ])
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/tiktok/snapshots?months=12
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

    const snapshots = await prisma.tikTokSnapshot.findMany({
      where:   { projectId, workspaceId },
      orderBy: { month: 'asc' },
      take,
      select: {
        month: true, followersCount: true, videoCount: true, likesCount: true,
        avgViews: true, avgLikes: true, avgComments: true, avgShares: true,
        postsThisMonth: true, engagementRate: true, createdAt: true,
      },
    })

    res.json({ snapshots })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/tiktok/snapshots
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

    await saveTikTokSnapshot(projectId, workspaceId, month)
    res.json({ ok: true, month })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/tiktok/followers?from=YYYY-MM-DD&to=YYYY-MM-DD
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

    const logs = await prisma.tikTokFollowerLog.findMany({
      where:   { projectId, workspaceId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
      select:  { date: true, followersCount: true },
    })

    res.json({ logs, from, to })
  } catch (err) { next(err) }
}

module.exports = { getMetrics, getSnapshots, saveSnapshot, getFollowerLog }
