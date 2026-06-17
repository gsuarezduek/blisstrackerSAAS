const prisma    = require('../lib/prisma')
const { generateMemoryForUser } = require('../services/insightMemory.service')
const { getWorkspaceStats, getProjectStats, getAttendanceStats, getHoursHistory, computeBenchmark, memberStatus, median } = require('../services/productivityStats.service')
const { sendTestDigest } = require('../services/productivityDigest.service')
const { getProductivityPeriod, businessDaysBetween } = require('../lib/timeMetrics')

// Modo de período: 'current' (mes en curso vs anterior, default) o 'closed' (mes anterior vs ante-anterior).
function periodMode(req) {
  return req.query.mode === 'closed' ? 'closed' : 'current'
}

async function listProductivity(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const period = getProductivityPeriod(periodMode(req), tz)

    const [members, statsMap, attendanceMap, hist] = await Promise.all([
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
      getHoursHistory(workspaceId, tz, { weeks: 12 }),
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

      // Δ horas = horas registradas (tiempo activo de tareas completadas) ÷ horas disponibles.
      const registeredHours = Math.round(s.current.totalMinutes / 60 * 10) / 10
      const availableHours   = att?.availableHours ?? null
      const utilization      = availableHours && availableHours > 0 ? registeredHours / availableHours : null
      const attendanceOut    = att ? { ...att, registeredHours, availableHours, utilization } : null
      const hoursHistory     = hist.history.get(u.id) || hist.labels.map(w => ({ weekStart: w, hours: 0 }))

      return {
        id: u.id,
        name: u.name,
        avatar: u.avatar,
        role: m.teamRole,
        status: memberStatus(s),
        stats: {
          completed: s.current.totalCompleted,
          hours: registeredHours,
          tasaCompletado: s.current.tasaCompletado,
          daysWorked: s.current.daysWorked,
          delta: s.delta,
          topProject: s.topProject,
          porProyecto: s.porProyecto.slice(0, 6),
          weeklySeries: s.weeklySeries,
          stuckTasks: s.stuckTasks,
          hasData: s.hasData,
          attendance: attendanceOut,
          utilization,
          hoursHistory,
        },
        insight: insight && (insight.tendencias || insight.fortalezas || insight.areasDeAtencion)
          ? { tendencias: insight.tendencias, fortalezas: insight.fortalezas, areasDeAtencion: insight.areasDeAtencion, updatedAt: insight.updatedAt }
          : null,
      }
    })

    // Mediana de utilización del equipo (para "Comparación con el equipo" → Δ horas).
    if (benchmark) {
      const utils = result.map(r => r.stats.utilization).filter(v => v != null)
      benchmark.utilizationMedian = utils.length ? median(utils) : null
    }

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

// POST /api/admin/productivity/digest/send-now — envía el aviso de prueba al admin que lo pide.
async function sendDigestNow(req, res, next) {
  try {
    const email = req.user?.email
    if (!email) return res.status(400).json({ error: 'No se encontró tu email' })
    const result = await sendTestDigest(req.workspace, email)
    res.json(result)
  } catch (err) { next(err) }
}

module.exports = { listProductivity, listByProject, refreshProductivity, sendDigestNow }
