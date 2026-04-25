const prisma = require('../lib/prisma')

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

function geoBand(score) {
  if (score >= 86) return 'Excelente'
  if (score >= 68) return 'Bueno'
  if (score >= 36) return 'Base'
  return 'Crítico'
}

/**
 * GET /api/marketing/projects/:id/health-score
 */
async function getHealthScore(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const month     = currentMonthStr()
    const prevMonth = prevMonthStr(month)

    const [geoAudit, kwRankings, snapshot, prevSnapshot, pageSpeedMobile, pageSpeedDesktop] = await Promise.all([
      // GEO: audit más reciente completado
      prisma.geoAudit.findFirst({
        where:   { projectId, workspaceId, status: 'completed' },
        orderBy: { createdAt: 'desc' },
        select:  { score: true, createdAt: true },
      }),
      // Keywords: posición promedio del mes actual
      prisma.keywordRanking.findMany({
        where: {
          keyword: { projectId, workspaceId },
          month,
          position: { gt: 0 },
        },
        select: { position: true },
      }),
      // Analytics: snapshot del mes actual
      prisma.analyticsSnapshot.findFirst({
        where:   { projectId, workspaceId, month },
        orderBy: { createdAt: 'desc' },
        select:  { sessions: true, createdAt: true },
      }),
      // Analytics: snapshot del mes anterior
      prisma.analyticsSnapshot.findFirst({
        where:   { projectId, workspaceId, month: prevMonth },
        orderBy: { createdAt: 'desc' },
        select:  { sessions: true },
      }),
      // PageSpeed: último resultado mobile
      prisma.pageSpeedResult.findFirst({
        where:   { projectId, workspaceId, strategy: 'mobile', status: 'done' },
        orderBy: { createdAt: 'desc' },
        select:  { performanceScore: true, createdAt: true },
      }),
      // PageSpeed: último resultado desktop
      prisma.pageSpeedResult.findFirst({
        where:   { projectId, workspaceId, strategy: 'desktop', status: 'done' },
        orderBy: { createdAt: 'desc' },
        select:  { performanceScore: true, createdAt: true },
      }),
    ])

    // GEO
    const geo = geoAudit
      ? { score: geoAudit.score, band: geoBand(geoAudit.score), date: geoAudit.createdAt }
      : null

    // Keywords
    let keywords = null
    if (kwRankings.length > 0) {
      const total = kwRankings.reduce((s, r) => s + r.position, 0)
      keywords = { avgPosition: parseFloat((total / kwRankings.length).toFixed(1)), count: kwRankings.length, month }
    }

    // Traffic
    let traffic = null
    if (snapshot) {
      const sessions     = snapshot.sessions ?? 0
      const prevSessions = prevSnapshot?.sessions ?? null
      const delta        = prevSessions != null && prevSessions > 0
        ? parseFloat(((sessions - prevSessions) / prevSessions * 100).toFixed(1))
        : null
      traffic = { sessions, prevSessions, delta, month }
    }

    // Performance
    let performance = null
    if (pageSpeedMobile || pageSpeedDesktop) {
      performance = {
        mobile:  pageSpeedMobile?.performanceScore  ?? null,
        desktop: pageSpeedDesktop?.performanceScore ?? null,
        date:    (pageSpeedMobile ?? pageSpeedDesktop)?.createdAt,
      }
    }

    res.json({ geo, keywords, traffic, performance })
  } catch (err) { next(err) }
}

module.exports = { getHealthScore }
