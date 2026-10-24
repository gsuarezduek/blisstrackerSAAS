const prisma = require('../lib/prisma')
const { getProductivityPeriod, taskMins, buildCompletedAtWhere } = require('../lib/timeMetrics')
const { DEFAULT_TZ } = require('../utils/dates')
const { HUMAN_TASK_WHERE, formatAgentName } = require('../lib/agentTasks')
const {
  getWorkspaceStats, getAttendanceStats, getHoursHistory, computeBenchmark, memberStatus, median,
} = require('../services/productivityStats.service')

function defaultDateRange(tz = DEFAULT_TZ) {
  const to = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const d = new Date()
  d.setDate(d.getDate() - 90)
  const from = d.toLocaleDateString('en-CA', { timeZone: tz })
  return { from, to }
}

const taskSelect = {
  id:              true,
  description:     true,
  startedAt:       true,
  completedAt:     true,
  pausedMinutes:   true,
  minutesOverride: true,
  project: { select: { id: true, name: true, hoursEnabled: true, monthlyHours: true } },
  user:    { select: { id: true, name: true } },
}

async function byProject(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    let { from, to } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange(tz))
    const completedAtRange = buildCompletedAtWhere(from, to, tz)

    // Horas usadas vs contratadas = horas de PERSONAS. Lo que hicieron los agentes de IA
    // se informa aparte (agentTasks/agentMinutes por proyecto), nunca suma a totalMinutes.
    const [tasks, agentTasks] = await Promise.all([
      prisma.task.findMany({
        where: {
          status: 'COMPLETED',
          startedAt: { not: null },
          completedAt: { not: null, ...completedAtRange },
          workDay: { workspaceId },
          ...HUMAN_TASK_WHERE,
        },
        select: taskSelect,
        orderBy: { completedAt: 'desc' },
      }),
      prisma.task.findMany({
        where: {
          status: 'COMPLETED',
          isAgentTask: true,
          completedAt: { not: null, ...completedAtRange },
          workDay: { workspaceId },
        },
        select: { startedAt: true, completedAt: true, pausedMinutes: true, minutesOverride: true, project: { select: { id: true, name: true, hoursEnabled: true, monthlyHours: true } } },
      }),
    ])

    const map = {}
    for (const t of tasks) {
      const mins = taskMins(t)
      const key  = t.project.id
      if (!map[key]) map[key] = { project: t.project, totalMinutes: 0, taskCount: 0, byUser: {} }
      map[key].totalMinutes += mins
      map[key].taskCount += 1
      const uid = t.user.id
      if (!map[key].byUser[uid]) map[key].byUser[uid] = { user: t.user, minutes: 0, tasks: 0, taskList: [] }
      map[key].byUser[uid].minutes += mins
      map[key].byUser[uid].tasks += 1
      map[key].byUser[uid].taskList.push({
        id: t.id, description: t.description, minutes: mins,
        completedAt: t.completedAt,
        isOverride: t.minutesOverride !== null && t.minutesOverride !== undefined,
      })
    }

    // Proyectos con presupuesto de horas configurado que no tuvieron ninguna tarea
    // completada en el período: sin esto quedan afuera del reporte en vez de marcar
    // 0% de uso, y un cliente sin actividad en el mes pasa desapercibido.
    const trackedIds = Object.keys(map).map(Number)
    const idleBudgeted = await prisma.project.findMany({
      where: {
        workspaceId, active: true, hoursEnabled: true, monthlyHours: { not: null },
        ...(trackedIds.length ? { id: { notIn: trackedIds } } : {}),
      },
      select: { id: true, name: true, hoursEnabled: true, monthlyHours: true },
    })
    for (const project of idleBudgeted) {
      map[project.id] = { project, totalMinutes: 0, taskCount: 0, byUser: {} }
    }

    // Trabajo de agentes por proyecto (un proyecto donde solo trabajaron agentes también
    // aparece, con 0 horas de personas).
    for (const t of agentTasks) {
      const key = t.project.id
      if (!map[key]) map[key] = { project: t.project, totalMinutes: 0, taskCount: 0, byUser: {} }
      map[key].agentTasks   = (map[key].agentTasks || 0) + 1
      map[key].agentMinutes = (map[key].agentMinutes || 0) + taskMins(t)
    }

    const result = Object.values(map).map(({ byUser, ...rest }) => ({
      agentTasks: 0,
      agentMinutes: 0,
      ...rest,
      byUser: Object.values(byUser),
    }))

    res.json({ from, to, projects: result })
  } catch (err) { next(err) }
}

async function byUser(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    let { userId, from, to } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange(tz))
    const completedAtRange = buildCompletedAtWhere(from, to, tz)

    const where = {
      status: 'COMPLETED',
      startedAt: { not: null },
      completedAt: { not: null, ...completedAtRange },
      workDay: { workspaceId },
      ...HUMAN_TASK_WHERE,
    }
    if (userId) where.userId = Number(userId)

    const tasks = await prisma.task.findMany({
      where,
      select: {
        ...taskSelect,
        workDay: { select: { date: true } },
      },
      orderBy: { startedAt: 'desc' },
    })

    res.json(tasks.map(t => ({
      ...t,
      durationMinutes: Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000),
    })))
  } catch (err) { next(err) }
}

async function mine(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    let { from, to } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange(tz))
    const completedAtRange = buildCompletedAtWhere(from, to, tz)

    // Trabajo propio y el de sus agentes de IA se traen por separado y nunca se mezclan en
    // el mismo total — mismo criterio que el resto de Productividad/Reportes (HUMAN_TASK_WHERE).
    const [tasks, agentTasks] = await Promise.all([
      prisma.task.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          startedAt: { not: null },
          completedAt: { not: null, ...completedAtRange },
          workDay: { workspaceId },
          ...HUMAN_TASK_WHERE,
        },
        select: {
          id: true, description: true, startedAt: true,
          completedAt: true, pausedMinutes: true, minutesOverride: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { completedAt: 'desc' },
      }),
      prisma.task.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          isAgentTask: true,
          startedAt: { not: null },
          completedAt: { not: null, ...completedAtRange },
          workDay: { workspaceId },
        },
        select: {
          id: true, description: true, startedAt: true,
          completedAt: true, pausedMinutes: true, minutesOverride: true,
          project: { select: { id: true, name: true } },
          agent: { select: { id: true, label: true } },
          agentName: true,
        },
        orderBy: { completedAt: 'desc' },
      }),
    ])

    let totalMinutes = 0
    const byProject = {}
    for (const t of tasks) {
      const mins = taskMins(t)
      totalMinutes += mins
      const pid = t.project.id
      if (!byProject[pid]) byProject[pid] = { project: t.project, minutes: 0, taskList: [] }
      byProject[pid].minutes += mins
      byProject[pid].taskList.push({
        id: t.id, description: t.description, minutes: mins,
        completedAt: t.completedAt,
        isOverride: t.minutesOverride !== null && t.minutesOverride !== undefined,
      })
    }

    let agentTotalMinutes = 0
    const agentByProject = {}
    for (const t of agentTasks) {
      const mins = taskMins(t)
      agentTotalMinutes += mins
      const pid = t.project.id
      if (!agentByProject[pid]) agentByProject[pid] = { project: t.project, minutes: 0, taskList: [] }
      agentByProject[pid].minutes += mins
      agentByProject[pid].taskList.push({
        id: t.id, description: t.description, minutes: mins,
        completedAt: t.completedAt,
        isOverride: t.minutesOverride !== null && t.minutesOverride !== undefined,
        agentLabel: formatAgentName(t.agent, t.agentName),
      })
    }

    res.json({
      totalMinutes,
      taskCount: tasks.length,
      byProject: Object.values(byProject).sort((a, b) => b.minutes - a.minutes),
      agentTotalMinutes,
      agentTaskCount: agentTasks.length,
      agentByProject: Object.values(agentByProject).sort((a, b) => b.minutes - a.minutes),
    })
  } catch (err) { next(err) }
}

// Self-view de productividad para el usuario actual (NO admin): sus números de auto-mejora.
// Filtrado: Δ horas propio, tendencia 12 semanas, tasa, tareas, insight IA + comparación
// anónima contra la mediana del equipo. NO incluye asistencia/tardanzas ni el semáforo crudo.
async function mineProductivity(req, res, next) {
  try {
    if (req.workspace?.productivityEnabled === false) {
      return res.status(403).json({ error: 'La sección de Productividad está deshabilitada para este workspace' })
    }
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const period = getProductivityPeriod('current', tz)

    const [statsMap, attendanceMap, hist, insight] = await Promise.all([
      getWorkspaceStats(workspaceId, tz, period),
      getAttendanceStats(workspaceId, tz, period),
      getHoursHistory(workspaceId, tz, { weeks: 12 }),
      prisma.userInsightMemory.findFirst({
        where: { userId, workspaceId },
        orderBy: { weekStart: 'desc' },
        select: { tendencias: true, fortalezas: true, areasDeAtencion: true, updatedAt: true },
      }),
    ])

    const s = statsMap.get(userId) || null
    const att = attendanceMap.get(userId) || null
    const benchmark = computeBenchmark(statsMap)

    const registeredHours = s ? Math.round(s.current.totalMinutes / 60 * 10) / 10 : 0
    const availableHours   = att?.availableHours ?? null
    const utilization      = availableHours && availableHours > 0 ? registeredHours / availableHours : null
    const hoursHistory     = hist.history.get(userId) || hist.labels.map(w => ({ weekStart: w, hours: 0 }))

    // Mediana de Δ horas del equipo (anónima).
    let utilizationMedian = null
    if (benchmark) {
      const utils = []
      for (const [uid, st] of statsMap) {
        const a = attendanceMap.get(uid)
        const avail = a?.availableHours ?? null
        const reg = st.current.totalMinutes / 60
        if (avail && avail > 0) utils.push(reg / avail)
      }
      utilizationMedian = utils.length ? median(utils) : null
    }

    res.json({
      period: { ...period },
      hasData: s?.hasData ?? false,
      status: s ? memberStatus(s) : 'nodata',
      stats: s ? {
        completed: s.current.totalCompleted,
        hours: registeredHours,
        tasaCompletado: s.current.tasaCompletado,
        utilization,
        delta: s.delta,
        stuckTasks: s.stuckTasks,
        hoursHistory,
      } : { completed: 0, hours: 0, tasaCompletado: 0, utilization: null, delta: { horasPct: null, tareasPct: null, tasaCompletadoPts: 0 }, stuckTasks: 0, hoursHistory },
      // Trabajo de sus agentes de IA en el período — aparte, ya calculado por getWorkspaceStats
      // (mismo computeAgentStats que alimenta el bloque "Sus agentes" de Productividad admin).
      agents: s?.agents ?? null,
      benchmark: benchmark ? {
        completed: benchmark.completed,
        horas: benchmark.horas,
        tasaCompletado: benchmark.tasaCompletado,
        utilizationMedian,
        teamSize: benchmark.teamSize,
      } : null,
      insight: insight && (insight.tendencias || insight.fortalezas || insight.areasDeAtencion) ? insight : null,
    })
  } catch (err) { next(err) }
}

// GET /api/reports/mine/hours-history?back=N
// Historial semanal propio, corrido `back` bloques de 12 semanas hacia atrás (navegación
// a meses anteriores del sparkline de Mis Reportes). Liviano: no recalcula stats/asistencia.
async function mineHoursHistory(req, res, next) {
  try {
    if (req.workspace?.productivityEnabled === false) {
      return res.status(403).json({ error: 'La sección de Productividad está deshabilitada para este workspace' })
    }
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const back = Math.max(0, Number(req.query.back) || 0)
    const tz = req.workspace.timezone

    const hist = await getHoursHistory(workspaceId, tz, { weeks: 12, back })
    const history = hist.history.get(userId) || hist.labels.map(w => ({ weekStart: w, hours: 0 }))
    res.json({ history })
  } catch (err) { next(err) }
}

module.exports = { byProject, byUser, mine, mineProductivity, mineHoursHistory }
