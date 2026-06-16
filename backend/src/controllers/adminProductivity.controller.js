const prisma    = require('../lib/prisma')
const { generateMemoryForUser } = require('../services/insightMemory.service')
const { getWorkspaceStats, getProjectStats, getAttendanceStats, computeBenchmark } = require('../services/productivityStats.service')
const { getProductivityPeriod, businessDaysBetween } = require('../lib/timeMetrics')

// Umbrales para clasificar el estado de cada miembro (determinístico, sin IA)
const DROP_TAREAS_PCT   = -0.25   // caída ≥25% en tareas completadas
const DROP_HORAS_PCT    = -0.30   // caída ≥30% en horas
const DROP_TASA_PTS     = -15     // caída ≥15 puntos en tasa de completado
const RISE_PCT          = 0.30    // subida ≥30% en horas o tareas
const STUCK_THRESHOLD   = 5       // ≥5 tareas atascadas

function memberStatus(s) {
  if (!s.hasData) return 'nodata'
  if (s.recentInactive) return 'inactive'
  const d = s.delta
  if (d.tareasPct !== null && d.tareasPct <= DROP_TAREAS_PCT) return 'down'
  if (d.horasPct  !== null && d.horasPct  <= DROP_HORAS_PCT)  return 'down'
  if (d.tasaCompletadoPts <= DROP_TASA_PTS)                   return 'down'
  if (s.stuckTasks >= STUCK_THRESHOLD)                        return 'stuck'
  if (d.tareasPct !== null && d.tareasPct >= RISE_PCT)        return 'up'
  if (d.horasPct  !== null && d.horasPct  >= RISE_PCT)        return 'up'
  return 'ok'
}

// Modo de período: 'current' (mes en curso vs anterior, default) o 'closed' (mes anterior vs ante-anterior).
function periodMode(req) {
  return req.query.mode === 'closed' ? 'closed' : 'current'
}

async function listProductivity(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const period = getProductivityPeriod(periodMode(req), tz)

    const [members, statsMap, attendanceMap] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId, active: true },
        include: {
          user: {
            select: {
              id: true, name: true, avatar: true,
              insightMemories: {
                where: { workspaceId },
                select: { tendencias: true, fortalezas: true, areasDeAtencion: true, updatedAt: true },
                orderBy: { weekStart: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { user: { name: 'asc' } },
      }),
      getWorkspaceStats(workspaceId, tz, period),
      getAttendanceStats(workspaceId, tz, period),
    ])

    const benchmark = computeBenchmark(statsMap)

    const emptyStats = { current: { totalCompleted: 0, totalMinutes: 0, daysWorked: 0, tasaCompletado: 0 },
      delta: { tareasPct: null, horasPct: null, tasaCompletadoPts: 0 },
      porProyecto: [], topProject: null, weeklySeries: [], stuckTasks: 0, recentInactive: false, hasData: false }

    const result = members.map(m => {
      const u = m.user
      const s = statsMap.get(u.id) || emptyStats
      const att = attendanceMap.get(u.id) || null
      const insight = u.insightMemories[0] || null

      return {
        id: u.id,
        name: u.name,
        avatar: u.avatar,
        role: m.teamRole,
        status: memberStatus(s),
        stats: {
          completed: s.current.totalCompleted,
          hours: Math.round(s.current.totalMinutes / 60 * 10) / 10,
          tasaCompletado: s.current.tasaCompletado,
          daysWorked: s.current.daysWorked,
          delta: s.delta,
          topProject: s.topProject,
          porProyecto: s.porProyecto.slice(0, 6),
          weeklySeries: s.weeklySeries,
          stuckTasks: s.stuckTasks,
          hasData: s.hasData,
          attendance: att,
        },
        insight: insight && (insight.tendencias || insight.fortalezas || insight.areasDeAtencion)
          ? { tendencias: insight.tendencias, fortalezas: insight.fortalezas, areasDeAtencion: insight.areasDeAtencion, updatedAt: insight.updatedAt }
          : null,
      }
    })

    const periodOut = { ...period, businessDays: businessDaysBetween(period.curStart, period.curEnd) }
    res.json({ members: result, period: periodOut, benchmark })
  } catch (err) { next(err) }
}

async function listByProject(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const period = getProductivityPeriod(periodMode(req), tz)
    const projects = await getProjectStats(workspaceId, tz, period)

    // Resolver nombres de contribuyentes
    const userIds = new Set()
    projects.forEach(p => Object.keys(p.contributors).forEach(id => userIds.add(Number(id))))
    const users = userIds.size > 0
      ? await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true, avatar: true } })
      : []
    const userMap = new Map(users.map(u => [u.id, u]))

    const result = projects.map(p => ({
      projectId: p.projectId,
      name: p.name,
      hours: Math.round(p.minutes / 60 * 10) / 10,
      completed: p.completed,
      horasDeltaPct: p.horasDeltaPct,
      contributors: Object.entries(p.contributors)
        .map(([uid, mins]) => {
          const u = userMap.get(Number(uid))
          return { id: Number(uid), name: u?.name || '—', avatar: u?.avatar, hours: Math.round(mins / 60 * 10) / 10 }
        })
        .sort((a, b) => b.hours - a.hours),
    }))

    const periodOut = { ...period, businessDays: businessDaysBetween(period.curStart, period.curEnd) }
    res.json({ projects: result, period: periodOut })
  } catch (err) { next(err) }
}

async function refreshProductivity(req, res, next) {
  try {
    const userId = Number(req.params.userId)
    const workspace = req.workspace

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    })
    if (!member || !member.active) return res.status(404).json({ error: 'Usuario no encontrado' })

    await generateMemoryForUser(userId, workspace)
    const memory = await prisma.userInsightMemory.findFirst({
      where: { userId, workspaceId: workspace.id },
      orderBy: { weekStart: 'desc' },
      select: { tendencias: true, fortalezas: true, areasDeAtencion: true, updatedAt: true },
    })
    const hasContent = memory && (memory.tendencias || memory.fortalezas || memory.areasDeAtencion)
    res.json(hasContent ? memory : null)
  } catch (err) { next(err) }
}

module.exports = { listProductivity, listByProject, refreshProductivity }
