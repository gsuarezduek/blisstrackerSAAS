// Capa de datos de productividad: calcula métricas determinísticas por miembro
// comparando un período actual contra el previo. El período lo define el caller
// (mes en curso / mes cerrado en el admin; últimas 4 semanas por defecto para
// la memoria de insights). Los Δ se calculan por día logueado para neutralizar
// diferencias en la cantidad de días trabajados de cada período.
// Sin IA. Lo consumen el controller de admin (live) y el servicio de memoria de insights.

const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')
const { tzOffsetStr, getNWeeksAgoMonday, daysAgo, taskMins } = require('../lib/timeMetrics')

const STUCK_DAYS = 7

function dateDiffDays(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000)
}

// % de cambio entre dos valores. null = sin base de comparación (período previo en cero).
function pctChange(cur, prev) {
  if (!prev) return cur ? null : 0
  return (cur - prev) / prev
}

function summarize(workDays, completedTasks) {
  const totalCreated   = workDays.reduce((s, wd) => s + wd.tasks.length, 0)
  const daysWorked     = workDays.filter(wd => wd.tasks.length > 0).length
  const totalCompleted = completedTasks.length
  const totalMinutes   = completedTasks.reduce((s, t) => s + taskMins(t), 0)
  return {
    totalCreated,
    totalCompleted,
    totalMinutes,
    daysWorked,
    tasaCompletado: totalCreated > 0 ? totalCompleted / totalCreated : 0,
    tareasPorDia:   daysWorked > 0 ? Math.round(totalCompleted / daysWorked * 10) / 10 : 0,
    // Ritmo por día logueado (sin redondear) — base de los Δ, neutraliza días no trabajados.
    completedPerDay: daysWorked > 0 ? totalCompleted / daysWorked : 0,
    minutesPerDay:   daysWorked > 0 ? totalMinutes   / daysWorked : 0,
  }
}

// Computa stats de un miembro a partir de filas ya traídas de la DB.
function computeMemberStats({ workDays, completedTasks, stuckCount, curStart }) {
  const curWorkDays  = workDays.filter(wd => wd.date >= curStart)
  const prevWorkDays = workDays.filter(wd => wd.date <  curStart)
  const curCompleted  = completedTasks.filter(t => t.workDay.date >= curStart)
  const prevCompleted = completedTasks.filter(t => t.workDay.date <  curStart)

  const current  = summarize(curWorkDays,  curCompleted)
  const previous = summarize(prevWorkDays, prevCompleted)

  // Tiempo por proyecto (período actual), ordenado por minutos desc
  const byProject = {}
  for (const wd of curWorkDays) {
    for (const t of wd.tasks) {
      byProject[t.projectId] ??= { projectId: t.projectId, name: t.project.name, creadas: 0, completadas: 0, minutes: 0 }
      byProject[t.projectId].creadas += 1
    }
  }
  for (const t of curCompleted) {
    byProject[t.projectId] ??= { projectId: t.projectId, name: t.project.name, creadas: 0, completadas: 0, minutes: 0 }
    byProject[t.projectId].completadas += 1
    byProject[t.projectId].minutes     += taskMins(t)
  }
  const porProyecto = Object.values(byProject).sort((a, b) => b.minutes - a.minutes)
  const topProject = porProyecto[0] && current.totalMinutes > 0
    ? { name: porProyecto[0].name, minutes: porProyecto[0].minutes, pct: Math.round(porProyecto[0].minutes / current.totalMinutes * 100) }
    : null

  // Serie semanal (4 semanas) para sparkline. Índice 3 = semana más reciente.
  const weeks = Array.from({ length: 4 }, () => ({ created: 0, completed: 0, minutes: 0, days: new Set() }))
  for (const wd of curWorkDays) {
    const idx = Math.min(3, Math.max(0, Math.floor(dateDiffDays(curStart, wd.date) / 7)))
    weeks[idx].created += wd.tasks.length
    if (wd.tasks.length > 0) weeks[idx].days.add(wd.date)
  }
  for (const t of curCompleted) {
    const idx = Math.min(3, Math.max(0, Math.floor(dateDiffDays(curStart, t.workDay.date) / 7)))
    weeks[idx].completed += 1
    weeks[idx].minutes   += taskMins(t)
  }
  const weeklySeries = weeks.map(w => ({
    completed: w.completed,
    minutes:   w.minutes,
    tasa:      w.created > 0 ? Math.round(w.completed / w.created * 100) / 100 : 0,
  }))

  // Inactividad reciente: trabajó ≥3 días la última semana pero no completó nada
  const lastWeek = weeks[3]
  const recentInactive = lastWeek.days.size >= 3 && lastWeek.completed === 0

  return {
    current,
    previous,
    delta: {
      tasaCompletadoPts: Math.round((current.tasaCompletado - previous.tasaCompletado) * 100), // puntos %
      horasPct:          pctChange(current.minutesPerDay,   previous.minutesPerDay),   // ritmo por día logueado
      tareasPct:         pctChange(current.completedPerDay, previous.completedPerDay), // ritmo por día logueado
    },
    porProyecto,
    topProject,
    weeklySeries,
    stuckTasks: stuckCount,
    recentInactive,
    hasData: current.daysWorked > 0 || current.totalCompleted > 0,
  }
}

// Período por defecto (memoria de insights): últimas 4 semanas vs las 4 previas.
function weeksPeriod(tz) {
  return {
    curStart:  getNWeeksAgoMonday(4, tz),
    prevStart: getNWeeksAgoMonday(8, tz),
    curEnd:    todayString(tz),
    prevEnd:   null,
  }
}

// Trae las filas crudas (workDays + completed tasks) para un workspace en el rango
// [prevStart, curEnd], opcionalmente filtrado a un solo usuario. El período lo define
// el caller (default: weeksPeriod). Devuelve también el conteo de tareas atascadas.
async function fetchRows(workspaceId, tz, { userId = null, period = null } = {}) {
  const offset = tzOffsetStr(tz)
  const { curStart, prevStart, curEnd } = period || weeksPeriod(tz)
  const stuckCutoff = new Date(daysAgo(STUCK_DAYS, tz) + 'T00:00:00' + offset)

  const userFilter = userId ? { userId } : {}

  const [workDays, completedTasks, stuckTasks] = await Promise.all([
    prisma.workDay.findMany({
      where: { workspaceId, date: { gte: prevStart, lte: curEnd }, ...userFilter },
      select: {
        userId: true,
        date: true,
        tasks: {
          select: {
            projectId: true,
            status: true,
            project: { select: { name: true } },
          },
        },
      },
    }),
    prisma.task.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(prevStart + 'T00:00:00' + offset),
          lte: new Date(curEnd    + 'T23:59:59' + offset),
        },
        workDay: { workspaceId },
        ...userFilter,
      },
      select: {
        userId: true,
        projectId: true,
        startedAt: true,
        completedAt: true,
        pausedMinutes: true,
        minutesOverride: true,
        project: { select: { name: true } },
        workDay: { select: { date: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        status: { in: ['PAUSED', 'BLOCKED'] },
        updatedAt: { lt: stuckCutoff },
        workDay: { workspaceId },
        ...userFilter,
      },
      select: { userId: true },
    }),
  ])

  return { workDays, completedTasks, stuckTasks, curStart, prevStart, curEnd }
}

function groupByUser(rows) {
  const wdByUser   = new Map()
  const compByUser = new Map()
  const stuckByUser = new Map()
  for (const wd of rows.workDays) {
    if (!wdByUser.has(wd.userId)) wdByUser.set(wd.userId, [])
    wdByUser.get(wd.userId).push(wd)
  }
  for (const t of rows.completedTasks) {
    if (!compByUser.has(t.userId)) compByUser.set(t.userId, [])
    compByUser.get(t.userId).push(t)
  }
  for (const t of rows.stuckTasks) {
    stuckByUser.set(t.userId, (stuckByUser.get(t.userId) || 0) + 1)
  }
  return { wdByUser, compByUser, stuckByUser }
}

// Stats de un solo miembro (usado por el servicio de memoria de insights).
// Usa el período por defecto (últimas 4 semanas).
async function getMemberStats(userId, workspaceId, tz) {
  const rows = await fetchRows(workspaceId, tz, { userId })
  return computeMemberStats({
    workDays: rows.workDays,
    completedTasks: rows.completedTasks,
    stuckCount: rows.stuckTasks.length,
    curStart: rows.curStart,
  })
}

// Stats de todos los miembros de un workspace (usado por el controller, batched).
// Devuelve Map<userId, stats>.
async function getWorkspaceStats(workspaceId, tz, period = null) {
  const rows = await fetchRows(workspaceId, tz, { period })
  const { wdByUser, compByUser, stuckByUser } = groupByUser(rows)
  const userIds = new Set([...wdByUser.keys(), ...compByUser.keys(), ...stuckByUser.keys()])
  const result = new Map()
  for (const userId of userIds) {
    result.set(userId, computeMemberStats({
      workDays: wdByUser.get(userId) || [],
      completedTasks: compByUser.get(userId) || [],
      stuckCount: stuckByUser.get(userId) || 0,
      curStart: rows.curStart,
    }))
  }
  return result
}

// Agregado por proyecto a nivel equipo (período actual vs previo).
async function getProjectStats(workspaceId, tz, period = null) {
  const rows = await fetchRows(workspaceId, tz, { period })
  const { curStart } = rows

  // Días logueados (con actividad) en cada período, para normalizar el Δ por día.
  const curDaySet = new Set(), prevDaySet = new Set()
  for (const wd of rows.workDays) {
    if (wd.tasks.length === 0) continue
    if (wd.date >= curStart) curDaySet.add(wd.date)
    else                     prevDaySet.add(wd.date)
  }
  const nCurDays  = curDaySet.size
  const nPrevDays = prevDaySet.size

  const byProject = {}
  function ensure(projectId, name) {
    byProject[projectId] ??= {
      projectId, name,
      curMinutes: 0, curCompleted: 0, prevMinutes: 0, prevCompleted: 0,
      contributors: {}, // userId -> minutes (período actual)
    }
    return byProject[projectId]
  }

  for (const t of rows.completedTasks) {
    const isCurrent = t.workDay.date >= curStart
    const p = ensure(t.projectId, t.project.name)
    const mins = taskMins(t)
    if (isCurrent) {
      p.curMinutes   += mins
      p.curCompleted += 1
      p.contributors[t.userId] = (p.contributors[t.userId] || 0) + mins
    } else {
      p.prevMinutes   += mins
      p.prevCompleted += 1
    }
  }

  return Object.values(byProject)
    .map(p => ({
      projectId: p.projectId,
      name: p.name,
      minutes: p.curMinutes,
      completed: p.curCompleted,
      contributorCount: Object.keys(p.contributors).length,
      contributors: p.contributors, // { userId: minutes }
      // Δ del ritmo por día logueado (minutos/día), neutraliza períodos con menos días.
      horasDeltaPct: pctChange(
        nCurDays  ? p.curMinutes  / nCurDays  : 0,
        nPrevDays ? p.prevMinutes / nPrevDays : 0,
      ),
    }))
    .filter(p => p.minutes > 0 || p.completed > 0)
    .sort((a, b) => b.minutes - a.minutes)
}

function median(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Mediana del equipo de las métricas clave (sólo miembros con datos).
function computeBenchmark(statsMap) {
  const members = [...statsMap.values()].filter(s => s.hasData)
  if (!members.length) return null
  return {
    tasaCompletado: median(members.map(s => s.current.tasaCompletado)),
    tareasPorDia:   median(members.map(s => s.current.tareasPorDia)),
    horas:          Math.round(median(members.map(s => s.current.totalMinutes)) / 60 * 10) / 10,
    teamSize:       members.length,
  }
}

module.exports = { getMemberStats, getWorkspaceStats, getProjectStats, computeBenchmark, pctChange }
