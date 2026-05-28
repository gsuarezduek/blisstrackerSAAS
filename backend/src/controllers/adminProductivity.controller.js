const prisma    = require('../lib/prisma')
const { generateMemoryForUser } = require('../services/insightMemory.service')
const { getWorkspaceStats, getProjectStats, computeBenchmark } = require('../services/productivityStats.service')

// Umbrales de alertas (determinísticas, sin IA)
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

function buildAlerts(member, s) {
  const alerts = []
  const name = member.name
  const d = s.delta
  if (!s.hasData) return alerts

  if (s.recentInactive) {
    alerts.push({ severity: 'critical', userId: member.id, userName: name, kind: 'inactive',
      text: `${name} no completó ninguna tarea la última semana (trabajó varios días)` })
  }
  if (d.tareasPct !== null && d.tareasPct <= DROP_TAREAS_PCT) {
    alerts.push({ severity: 'critical', userId: member.id, userName: name, kind: 'drop',
      text: `${name} bajó ${Math.abs(Math.round(d.tareasPct * 100))}% en tareas completadas vs período previo` })
  } else if (d.horasPct !== null && d.horasPct <= DROP_HORAS_PCT) {
    alerts.push({ severity: 'warn', userId: member.id, userName: name, kind: 'drop',
      text: `${name} bajó ${Math.abs(Math.round(d.horasPct * 100))}% en horas trabajadas` })
  }
  if (s.stuckTasks >= STUCK_THRESHOLD) {
    alerts.push({ severity: 'warn', userId: member.id, userName: name, kind: 'stuck',
      text: `${name} tiene ${s.stuckTasks} tareas atascadas hace más de 7 días` })
  }
  if ((d.tareasPct !== null && d.tareasPct >= RISE_PCT) || (d.horasPct !== null && d.horasPct >= RISE_PCT)) {
    const pct = Math.max(d.tareasPct || 0, d.horasPct || 0)
    alerts.push({ severity: 'info', userId: member.id, userName: name, kind: 'rise',
      text: `${name} subió ${Math.round(pct * 100)}% su actividad${s.topProject ? `, sobre todo en ${s.topProject.name}` : ''}` })
  }
  return alerts
}

async function listProductivity(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone

    const [members, statsMap] = await Promise.all([
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
      getWorkspaceStats(workspaceId, tz),
    ])

    const benchmark = computeBenchmark(statsMap)
    const emptyStats = { current: { totalCompleted: 0, totalMinutes: 0, daysWorked: 0, tasaCompletado: 0 },
      delta: { tareasPct: null, horasPct: null, tasaCompletadoPts: 0 },
      porProyecto: [], topProject: null, weeklySeries: [], stuckTasks: 0, recentInactive: false, hasData: false }

    const alerts = []
    const result = members.map(m => {
      const u = m.user
      const s = statsMap.get(u.id) || emptyStats
      const insight = u.insightMemories[0] || null
      buildAlerts({ id: u.id, name: u.name }, s).forEach(a => alerts.push(a))

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
        },
        insight: insight && (insight.tendencias || insight.fortalezas || insight.areasDeAtencion)
          ? { tendencias: insight.tendencias, fortalezas: insight.fortalezas, areasDeAtencion: insight.areasDeAtencion, updatedAt: insight.updatedAt }
          : null,
      }
    })

    // Severidad: critical → warn → info
    const order = { critical: 0, warn: 1, info: 2 }
    alerts.sort((a, b) => order[a.severity] - order[b.severity])

    res.json({ members: result, alerts, benchmark })
  } catch (err) { next(err) }
}

async function listByProject(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const projects = await getProjectStats(workspaceId, tz)

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

    res.json(result)
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
