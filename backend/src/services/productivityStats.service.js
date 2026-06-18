// Capa de datos de productividad: calcula métricas determinísticas por miembro
// comparando un período actual contra el previo. El período lo define el caller
// (mes en curso / mes cerrado en el admin; últimas 4 semanas por defecto para
// la memoria de insights). Los Δ se calculan por día logueado para neutralizar
// diferencias en la cantidad de días trabajados de cada período.
// Sin IA. Lo consumen el controller de admin (live) y el servicio de memoria de insights.

const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')
const { tzOffsetStr, getNWeeksAgoMonday, daysAgo, taskMins, addDays, businessDaysBetween } = require('../lib/timeMetrics')

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
// period = { curStart, curEnd, prevStart, prevEnd }: las dos ventanas se bucketean explícitamente
// (con ventanas de igual largo puede haber un "hueco" entre prevEnd y curStart que se descarta).
function computeMemberStats({ workDays, completedTasks, stuckCount, period }) {
  const { curStart, curEnd, prevStart, prevEnd } = period
  const inCur  = d => d >= curStart  && d <= curEnd
  const inPrev = d => d >= prevStart && d <= prevEnd
  const curWorkDays  = workDays.filter(wd => inCur(wd.date))
  const prevWorkDays = workDays.filter(wd => inPrev(wd.date))
  const curCompleted  = completedTasks.filter(t => inCur(t.completedDate))
  const prevCompleted = completedTasks.filter(t => inPrev(t.completedDate))

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
    const idx = Math.min(3, Math.max(0, Math.floor(dateDiffDays(curStart, t.completedDate) / 7)))
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
  const curStart = getNWeeksAgoMonday(4, tz)
  return {
    curStart,
    prevStart: getNWeeksAgoMonday(8, tz),
    curEnd:    todayString(tz),
    prevEnd:   addDays(curStart, -1), // ventana previa = [prevStart, día antes de curStart]
  }
}

// Trae las filas crudas (workDays + completed tasks) para un workspace en el rango
// [prevStart, curEnd], opcionalmente filtrado a un solo usuario. El período lo define
// el caller (default: weeksPeriod). Devuelve también el conteo de tareas atascadas.
async function fetchRows(workspaceId, tz, { userId = null, period = null } = {}) {
  const offset = tzOffsetStr(tz)
  const usePeriod = period || weeksPeriod(tz)
  const { curStart, prevStart, curEnd } = usePeriod
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

  // Atribuir cada tarea completada al día de COMPLETADO (no al de creación del workDay),
  // así "Hechas" cuenta lo terminado en el período aunque se haya arrastrado de días previos.
  const completedWithDate = completedTasks.map(t => ({
    ...t,
    completedDate: t.completedAt
      ? new Date(t.completedAt).toLocaleDateString('en-CA', { timeZone: tz })
      : t.workDay.date,
  }))

  return { workDays, completedTasks: completedWithDate, stuckTasks, period: usePeriod, curStart, prevStart, curEnd }
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
    period: rows.period,
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
      period: rows.period,
    }))
  }
  return result
}

// Días hábiles (YYYY-MM-DD) entre dos fechas inclusive.
function businessDayList(startStr, endStr) {
  const out = []
  if (!startStr || !endStr || startStr > endStr) return out
  const end = new Date(endStr + 'T00:00:00Z')
  for (let d = new Date(startStr + 'T00:00:00Z'); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10))
  }
  return out
}

function loginMinsFromMidnight(iso, tz) {
  const d = new Date(iso)
  const h = Number(d.toLocaleString('en-CA', { hour: 'numeric', hour12: false, timeZone: tz }))
  const m = Number(d.toLocaleString('en-CA', { minute: 'numeric', timeZone: tz }))
  return h * 60 + m
}

// Asistencia por miembro en el período actual: presencia (días hábiles trabajados),
// licencias aprobadas, ausencias sin justificar y tardanzas. Todo en "espacio de días hábiles".
// Separa "el período tiene menos días" de "la persona faltó". Devuelve Map<userId, {...}>.
async function getAttendanceStats(workspaceId, tz, period) {
  const { curStart, curEnd } = period
  const offset = tzOffsetStr(tz)
  const bizDays = businessDayList(curStart, curEnd)
  const bizSet  = new Set(bizDays)
  const businessDays = bizDays.length

  const [ws, members, workDays, leaves, logins] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { attendanceTrackingEnabled: true, lateToleranceMins: true } }),
    prisma.workspaceMember.findMany({ where: { workspaceId, active: true }, select: { userId: true, workStartTime: true, workEndTime: true } }),
    prisma.workDay.findMany({ where: { workspaceId, date: { gte: curStart, lte: curEnd } }, select: { userId: true, date: true } }),
    prisma.vacationRequest.findMany({
      where: { workspaceId, status: 'approved', startDate: { lte: curEnd }, endDate: { gte: curStart } },
      select: { userId: true, startDate: true, endDate: true },
    }),
    prisma.userLogin.findMany({
      where: { workspaceId, loginAt: { gte: new Date(curStart + 'T00:00:00' + offset), lte: new Date(curEnd + 'T23:59:59' + offset) } },
      select: { userId: true, loginAt: true },
      orderBy: { loginAt: 'asc' },
    }),
  ])

  const attendanceEnabled = ws?.attendanceTrackingEnabled !== false
  const tolerance = ws?.lateToleranceMins ?? 0

  const scheduleMap = {}  // userId -> minuto de inicio (para tardanzas)
  const dayMinsMap  = {}  // userId -> minutos de jornada (workEnd - workStart), para horas disponibles
  for (const m of members) {
    if (!attendanceEnabled) continue
    if (m.workStartTime) {
      const [h, mm] = m.workStartTime.split(':').map(Number)
      scheduleMap[m.userId] = h * 60 + mm
      if (m.workEndTime) {
        const [eh, em] = m.workEndTime.split(':').map(Number)
        const mins = (eh * 60 + em) - (h * 60 + mm)
        if (mins > 0) dayMinsMap[m.userId] = mins
      }
    }
  }

  // Días hábiles presentes por usuario (intersección con días hábiles del período).
  const presentByUser = new Map()
  for (const wd of workDays) {
    if (!bizSet.has(wd.date)) continue
    if (!presentByUser.has(wd.userId)) presentByUser.set(wd.userId, new Set())
    presentByUser.get(wd.userId).add(wd.date)
  }

  // Días hábiles de licencia aprobada por usuario (recortados al período).
  const leaveByUser = new Map()
  for (const lv of leaves) {
    const start = lv.startDate > curStart ? lv.startDate : curStart
    const end   = lv.endDate   < curEnd   ? lv.endDate   : curEnd
    if (!leaveByUser.has(lv.userId)) leaveByUser.set(lv.userId, new Set())
    const set = leaveByUser.get(lv.userId)
    for (const d of businessDayList(start, end)) set.add(d)
  }

  // Tardanzas: primer login del día vs horario + tolerancia.
  const firstLogin = new Map()
  for (const l of logins) {
    const date = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: tz })
    if (date < curStart || date > curEnd) continue
    const key = `${l.userId}::${date}`
    if (!firstLogin.has(key)) firstLogin.set(key, loginMinsFromMidnight(l.loginAt, tz))
  }
  const lateByUser = new Map()
  for (const [key, mins] of firstLogin) {
    const uid = Number(key.split('::')[0])
    if (scheduleMap[uid] == null) continue
    if (mins - scheduleMap[uid] - tolerance > 0) lateByUser.set(uid, (lateByUser.get(uid) || 0) + 1)
  }

  const result = new Map()
  for (const m of members) {
    const uid = m.userId
    const daysPresent  = presentByUser.get(uid)?.size || 0
    const leaveDays    = leaveByUser.get(uid)?.size || 0
    const expectedDays = Math.max(0, businessDays - leaveDays)
    const hasSchedule  = scheduleMap[uid] != null
    const dayMins      = dayMinsMap[uid] ?? null
    result.set(uid, {
      businessDays,
      daysPresent,
      leaveDays,
      expectedDays,
      absentDays: Math.max(0, expectedDays - daysPresent),
      lateDays:   hasSchedule ? (lateByUser.get(uid) || 0) : null,
      hasSchedule,
      // Horas disponibles del período = días esperados × jornada (workEnd - workStart). null = sin horario completo.
      dailyHours:     dayMins != null ? Math.round(dayMins / 60 * 10) / 10 : null,
      availableHours: dayMins != null ? Math.round(expectedDays * dayMins / 60 * 10) / 10 : null,
    })
  }
  return result
}

// Historial de horas activas (de tareas completadas) por semana ISO, últimas `weeks` semanas.
// INDEPENDIENTE del período seleccionado — sirve como contexto de tendencia en la vista expandida.
// Devuelve { history: Map<userId, [{weekStart, hours}]>, labels: [weekStart,...] }.
async function getHoursHistory(workspaceId, tz, { weeks = 12 } = {}) {
  const offset = tzOffsetStr(tz)
  const today  = todayString(tz)
  const startMonday = getNWeeksAgoMonday(weeks - 1, tz) // lunes de hace (weeks-1) semanas → cubre `weeks` semanas incl. la actual

  const tasks = await prisma.task.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { gte: new Date(startMonday + 'T00:00:00' + offset), lte: new Date(today + 'T23:59:59' + offset) },
      workDay: { workspaceId },
    },
    select: { userId: true, startedAt: true, completedAt: true, pausedMinutes: true, minutesOverride: true },
  })

  const labels = Array.from({ length: weeks }, (_, i) => addDays(startMonday, i * 7))
  const minsByUser = new Map()
  for (const t of tasks) {
    const date = new Date(t.completedAt).toLocaleDateString('en-CA', { timeZone: tz })
    const idx  = Math.min(weeks - 1, Math.max(0, Math.floor(dateDiffDays(startMonday, date) / 7)))
    if (!minsByUser.has(t.userId)) minsByUser.set(t.userId, new Array(weeks).fill(0))
    minsByUser.get(t.userId)[idx] += taskMins(t)
  }

  const history = new Map()
  for (const [uid, mins] of minsByUser) {
    history.set(uid, mins.map((m, i) => ({ weekStart: labels[i], hours: Math.round(m / 60 * 10) / 10 })))
  }
  return { history, labels }
}

// Umbrales para clasificar el estado de cada miembro (determinístico, sin IA).
const DROP_TAREAS_PCT = -0.25   // caída ≥25% en tareas completadas (ritmo/día)
const DROP_HORAS_PCT  = -0.30   // caída ≥30% en horas (ritmo/día)
const DROP_TASA_PTS   = -15     // caída ≥15 puntos en tasa de completado
const RISE_PCT        = 0.30    // subida ≥30% en horas o tareas
const STUCK_THRESHOLD = 5       // ≥5 tareas atascadas

// Estado del miembro: 'inactive' | 'down' | 'stuck' | 'up' | 'ok' | 'nodata'.
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
    completed:      median(members.map(s => s.current.totalCompleted)),
    horas:          Math.round(median(members.map(s => s.current.totalMinutes)) / 60 * 10) / 10,
    teamSize:       members.length,
  }
}

module.exports = { getMemberStats, getWorkspaceStats, getAttendanceStats, getHoursHistory, computeBenchmark, memberStatus, median, pctChange }
