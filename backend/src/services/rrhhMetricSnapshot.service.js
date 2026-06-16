// Snapshots mensuales de métricas del MiniDashboard de RRHH (para ver su evolución histórica).
// Cada métrica guarda un `value` numérico + un `detail` JSON con su contexto.
//
// Hay dos clases de métrica:
//  · stock  → estado actual (headcount, proyectos/persona, antigüedad). Ignoran el mes;
//             el snapshot captura "como está hoy" y el mes es solo el bucket.
//  · período→ valor del mes (horario promedio de ingreso, puntualidad). Se calculan filtrando
//             los logins al mes; mid-mes dan el acumulado hasta la fecha, el cron congela el mes completo.
const prisma = require('../lib/prisma')
const { monthBounds } = require('../lib/monthUtils')

// Mes actual "YYYY-MM" en la timezone del workspace.
function currentMonth(tz) {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7)
}

// Minutos desde medianoche del primer login, en la TZ del workspace.
function loginMinsFromMidnight(iso, tz) {
  const d = new Date(iso)
  const h = Number(d.toLocaleString('en-CA', { hour: 'numeric', hour12: false, timeZone: tz }))
  const m = Number(d.toLocaleString('en-CA', { minute: 'numeric', timeZone: tz }))
  return h * 60 + m
}

// ─── Métricas de stock (estado actual) ──────────────────────────────────────────

// Personas activas: integrantes activos del workspace.
async function computeActiveMembers(workspaceId) {
  const value = await prisma.workspaceMember.count({ where: { workspaceId, active: true } })
  return { value, detail: {} }
}

// Proyectos por persona: proyectos activos ÷ equipo activo.
async function computeProjectsPerPerson(workspaceId) {
  const [activeMembers, activeProjects] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId, active: true } }),
    prisma.project.count({ where: { workspaceId, active: true } }),
  ])
  const value = activeMembers > 0
    ? Math.round((activeProjects / activeMembers) * 10) / 10
    : 0
  return { value, detail: { activeMembers, activeProjects } }
}

// Antigüedad promedio (en años) del equipo activo, según User.createdAt.
async function computeAvgTenure(workspaceId) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, active: true },
    select: { user: { select: { createdAt: true } } },
  })
  const memberCount = members.length
  let value = 0
  if (memberCount > 0) {
    const now = Date.now()
    const totalYears = members.reduce(
      (acc, m) => acc + (now - new Date(m.user.createdAt)) / (365.25 * 86400000),
      0,
    )
    value = Math.round((totalYears / memberCount) * 100) / 100 // años con 2 decimales
  }
  return { value, detail: { memberCount } }
}

// ─── Métricas de período (asistencia del mes) ───────────────────────────────────

// Calcula asistencia del mes (horario promedio + puntualidad) sobre quienes tienen horario.
// Devuelve null si el seguimiento está apagado, nadie tiene horario, o no hay logins en el mes.
async function computeMonthlyAttendance(workspaceId, month, tz) {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { attendanceTrackingEnabled: true, lateToleranceMins: true },
  })
  if (!ws || ws.attendanceTrackingEnabled === false) return null
  const tolerance = ws.lateToleranceMins ?? 0

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, active: true, workStartTime: { not: null } },
    select: { userId: true, workStartTime: true },
  })
  if (members.length === 0) return null
  const scheduleMap = {}
  for (const m of members) {
    const [h, mm] = m.workStartTime.split(':').map(Number)
    scheduleMap[m.userId] = h * 60 + mm
  }

  // Rango UTC con ±1 día de padding (cubre cualquier offset de TZ); luego se filtra por mes local.
  const { startDate, endDate } = monthBounds(month)
  const fromUTC = new Date(`${startDate}T00:00:00Z`); fromUTC.setUTCDate(fromUTC.getUTCDate() - 1)
  const toUTC   = new Date(`${endDate}T23:59:59Z`);   toUTC.setUTCDate(toUTC.getUTCDate() + 1)

  const logins = await prisma.userLogin.findMany({
    where: {
      workspaceId,
      userId: { in: Object.keys(scheduleMap).map(Number) },
      loginAt: { gte: fromUTC, lte: toUTC },
    },
    select: { userId: true, loginAt: true },
    orderBy: { loginAt: 'asc' },
  })

  // Primer login por usuario por día, dentro del mes (en TZ del workspace).
  const byUserDay = {}
  for (const l of logins) {
    const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: tz })
    if (day.slice(0, 7) !== month) continue
    const key = `${l.userId}::${day}`
    if (!byUserDay[key]) byUserDay[key] = l.loginAt
  }

  const entries = Object.entries(byUserDay)
  if (entries.length === 0) return null

  let totalMins = 0, lateCount = 0
  for (const [key, iso] of entries) {
    const uid = Number(key.split('::')[0])
    const mins = loginMinsFromMidnight(iso, tz)
    totalMins += mins
    if (mins - scheduleMap[uid] - tolerance > 0) lateCount++
  }
  const scheduledDays = entries.length
  return {
    avgLoginMins: Math.round(totalMins / scheduledDays),
    punctualityPct: Math.round(((scheduledDays - lateCount) / scheduledDays) * 100),
    scheduledDays,
    lateCount,
    membersWithSchedule: members.length,
  }
}

async function computeAvgLoginTime(workspaceId, ctx) {
  const a = await ctx.getAttendance(workspaceId)
  if (!a) return null
  return { value: a.avgLoginMins, detail: { scheduledDays: a.scheduledDays, membersWithSchedule: a.membersWithSchedule } }
}

async function computePunctuality(workspaceId, ctx) {
  const a = await ctx.getAttendance(workspaceId)
  if (!a) return null
  return { value: a.punctualityPct, detail: { lateCount: a.lateCount, scheduledDays: a.scheduledDays } }
}

// Catálogo de métricas snapshoteables. Agregar una entrada acá la incluye en
// el upsert perezoso, el cron mensual y el endpoint de historial.
const METRICS = {
  activeMembers: computeActiveMembers,
  projectsPerPerson: computeProjectsPerPerson,
  tenure: computeAvgTenure,
  avgLoginTime: computeAvgLoginTime,
  punctuality: computePunctuality,
}

const METRIC_KEYS = Object.keys(METRICS)

// Contexto por (workspace, mes): memoiza el cálculo de asistencia que comparten
// avgLoginTime y punctuality, para no consultar los logins dos veces.
function makeCtx(month, tz) {
  const cache = {}
  return {
    month,
    tz,
    getAttendance(workspaceId) {
      if (!(workspaceId in cache)) cache[workspaceId] = computeMonthlyAttendance(workspaceId, month, tz)
      return cache[workspaceId]
    },
  }
}

// ─── Persistencia ──────────────────────────────────────────────────────────────

async function saveSnapshot(workspaceId, metric, month, { value, detail }) {
  return prisma.rrhhMetricSnapshot.upsert({
    where: { workspaceId_metric_month: { workspaceId, metric, month } },
    update: { value, detail },
    create: { workspaceId, metric, month, value, detail },
  })
}

// Upsert del mes actual para TODAS las métricas (perezoso, al abrir RRHH).
// `precomputed` permite pasar métricas ya calculadas para evitar requeries (ej: projectsPerPerson).
// Las métricas que devuelven null (ej: asistencia con seguimiento apagado) se omiten.
async function saveAllCurrentMonth(workspaceId, tz, precomputed = {}) {
  const month = currentMonth(tz)
  const ctx = makeCtx(month, tz)
  for (const metric of METRIC_KEYS) {
    const data = precomputed[metric] ?? await METRICS[metric](workspaceId, ctx)
    if (data) await saveSnapshot(workspaceId, metric, month, data)
  }
}

// Cron: snapshot del mes ANTERIOR de todas las métricas para todos los workspaces activos.
// Asegura que cada mes quede registrado aunque nadie haya abierto RRHH durante el mes.
async function saveAllPreviousMonthSnapshots() {
  const workspaces = await prisma.workspace.findMany({
    where: { status: { notIn: ['cancelled', 'suspended'] } },
    select: { id: true, timezone: true },
  })
  let saved = 0
  for (const ws of workspaces) {
    try {
      const tz = ws.timezone || 'America/Argentina/Buenos_Aires'
      const now = new Date()
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const month = prev.toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7)
      const ctx = makeCtx(month, tz)
      for (const metric of METRIC_KEYS) {
        const data = await METRICS[metric](ws.id, ctx)
        if (data) await saveSnapshot(ws.id, metric, month, data)
      }
      saved++
    } catch (err) {
      console.error(`[RrhhMetricSnapshot] Error en workspace ${ws.id}:`, err.message)
    }
  }
  console.log(`[RrhhMetricSnapshot] ${saved}/${workspaces.length} workspaces con snapshots guardados.`)
  return saved
}

module.exports = {
  METRIC_KEYS,
  computeActiveMembers,
  computeProjectsPerPerson,
  computeAvgTenure,
  saveSnapshot,
  saveAllCurrentMonth,
  saveAllPreviousMonthSnapshots,
}
