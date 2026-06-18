// Cálculo de las métricas AUTOMÁTICAS del Scorecard EOS, bucketeadas por semana ISO
// (semanales) o por mes calendario (mensuales). Reutiliza los mismos criterios que la
// sección de Productividad / Asistencia:
//   - Tardanza = primer login del día > workStartTime + tolerancia (TZ del workspace).
//   - Horas disponibles = días hábiles esperados (sin licencia) × jornada (workEnd − workStart).
//   - Horas trabajadas = tiempo activo de tareas completadas (taskMins, tope 8h, descuenta pausas).
//   - Ocupación = Σ horas trabajadas ÷ Σ horas disponibles (solo quienes tienen horario) — ya
//     ponderada por horas, así normaliza jornadas de 4h vs 8h.
// Las mensuales se calculan "a mes vencido": solo meses cerrados (el mes en curso queda vacío).
// No persiste nada: se recalcula desde los datos crudos en cada request.
// Devuelve, por métrica pedida, un mapa { period: { value, top3? } } (period = 'YYYY-Www' | 'YYYY-MM').

const prisma = require('../lib/prisma')
const { tzOffsetStr, addDays, taskMins } = require('../lib/timeMetrics')
const { todayString } = require('../utils/dates')
const { monthBounds } = require('../lib/monthUtils')
const { EOS_AUTO_METRICS } = require('../lib/eosAutoMetricCatalog')

// "YYYY-Www" (ISO 8601) de una fecha YYYY-MM-DD, interpretada como UTC.
function isoWeekPeriodOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const monthOf = dateStr => dateStr.slice(0, 7)

// Días hábiles (lun-vie) YYYY-MM-DD entre dos fechas inclusive.
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

const round1 = n => Math.round(n * 10) / 10
const localDate = (iso, tz) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })

// Carga horarios del equipo: { attendanceEnabled, tolerance, info: Map<uid,{name,avatar,startMins,dayMins}> }.
async function loadMemberInfo(workspaceId) {
  const [ws, members] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { attendanceTrackingEnabled: true, lateToleranceMins: true },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId, active: true },
      select: { userId: true, workStartTime: true, workEndTime: true, user: { select: { name: true, avatar: true } } },
    }),
  ])
  const attendanceEnabled = ws?.attendanceTrackingEnabled !== false
  const tolerance = ws?.lateToleranceMins ?? 0
  const info = new Map()
  for (const m of members) {
    let startMins = null, dayMins = null
    if (attendanceEnabled && m.workStartTime) {
      const [h, mm] = m.workStartTime.split(':').map(Number)
      startMins = h * 60 + mm
      if (m.workEndTime) {
        const [eh, em] = m.workEndTime.split(':').map(Number)
        const mins = (eh * 60 + em) - startMins
        if (mins > 0) dayMins = mins
      }
    }
    info.set(m.userId, { name: m.user.name, avatar: m.user.avatar, startMins, dayMins })
  }
  return { attendanceEnabled, tolerance, info }
}

// Ocupación por bucket (semana ISO o mes). Comparte la lógica entre la métrica semanal
// `ocupacion` y la mensual `delta_horas`; solo cambian el rango y `periodOf`.
async function occupancyByBucket(workspaceId, tz, offset, rangeStart, rangeEnd, periodOf, info) {
  const out = {}
  const scheduled = [...info.entries()].filter(([, v]) => v.dayMins != null)
  if (!scheduled.length) return out
  const scheduledIds = new Set(scheduled.map(([uid]) => uid))

  const [leaves, tasks] = await Promise.all([
    prisma.vacationRequest.findMany({
      where: { workspaceId, status: 'approved', startDate: { lte: rangeEnd }, endDate: { gte: rangeStart } },
      select: { userId: true, startDate: true, endDate: true },
    }),
    prisma.task.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: new Date(rangeStart + 'T00:00:00' + offset), lte: new Date(rangeEnd + 'T23:59:59' + offset) },
        workDay: { workspaceId },
      },
      select: { userId: true, completedAt: true, pausedMinutes: true, minutesOverride: true, startedAt: true },
    }),
  ])

  // Días de licencia (set) por usuario, recortados al rango.
  const leaveDays = new Map()
  for (const lv of leaves) {
    if (!scheduledIds.has(lv.userId)) continue
    const start = lv.startDate > rangeStart ? lv.startDate : rangeStart
    const end   = lv.endDate   < rangeEnd   ? lv.endDate   : rangeEnd
    if (!leaveDays.has(lv.userId)) leaveDays.set(lv.userId, new Set())
    const set = leaveDays.get(lv.userId)
    for (const d of businessDayList(start, end)) set.add(d)
  }

  // Horas disponibles por (bucket, usuario): días hábiles sin licencia × jornada.
  const availByBucket = new Map()
  for (const day of businessDayList(rangeStart, rangeEnd)) {
    const period = periodOf(day)
    if (!availByBucket.has(period)) availByBucket.set(period, new Map())
    const wm = availByBucket.get(period)
    for (const [uid, v] of scheduled) {
      if (leaveDays.get(uid)?.has(day)) continue
      wm.set(uid, (wm.get(uid) || 0) + v.dayMins)
    }
  }

  // Horas trabajadas por (bucket, usuario) — solo quienes tienen horario.
  const regByBucket = new Map()
  for (const t of tasks) {
    if (!scheduledIds.has(t.userId)) continue
    const date = localDate(t.completedAt, tz)
    if (date < rangeStart || date > rangeEnd) continue
    const period = periodOf(date)
    if (!regByBucket.has(period)) regByBucket.set(period, new Map())
    const wm = regByBucket.get(period)
    wm.set(t.userId, (wm.get(t.userId) || 0) + taskMins(t))
  }

  for (const [period, availMap] of availByBucket) {
    const regMap = regByBucket.get(period) || new Map()
    let sumAvail = 0, sumReg = 0
    const people = []
    for (const [uid, availMins] of availMap) {
      if (availMins <= 0) continue
      const regMins = regMap.get(uid) || 0
      sumAvail += availMins
      sumReg   += regMins
      const pInfo = info.get(uid)
      people.push({
        userId: uid,
        name:   pInfo?.name || '—',
        avatar: pInfo?.avatar || null,
        util:   Math.round(regMins / availMins * 100),
        registeredHours: round1(regMins / 60),
        availableHours:  round1(availMins / 60),
      })
    }
    if (sumAvail <= 0) continue
    people.sort((a, b) => a.util - b.util) // los que menos aprovecharon, primero
    out[period] = { value: Math.round(sumReg / sumAvail * 100), top3: people.slice(0, 3) }
  }
  return out
}

// ── Semanales ───────────────────────────────────────────────────────────────────

async function computeTardanzasWeekly(workspaceId, tz, offset, rangeStart, rangeEnd, ctx) {
  const out = {}
  if (!ctx.attendanceEnabled) return out

  const logins = await prisma.userLogin.findMany({
    where: { workspaceId, loginAt: { gte: new Date(rangeStart + 'T00:00:00' + offset), lte: new Date(rangeEnd + 'T23:59:59' + offset) } },
    select: { userId: true, loginAt: true },
    orderBy: { loginAt: 'asc' },
  })

  // Primer login por (usuario, día local).
  const firstByUserDay = new Map()
  for (const l of logins) {
    const date = localDate(l.loginAt, tz)
    if (date < rangeStart || date > rangeEnd) continue
    const key = `${l.userId}::${date}`
    if (!firstByUserDay.has(key)) firstByUserDay.set(key, loginMinsFromMidnight(l.loginAt, tz))
  }

  const byWeek = new Map() // period -> Map<uid, {lateDays, lateMins}>
  for (const [key, mins] of firstByUserDay) {
    const [uidStr, date] = key.split('::')
    const uid = Number(uidStr)
    const startMins = ctx.info.get(uid)?.startMins
    if (startMins == null) continue
    const lateBy = mins - startMins - ctx.tolerance
    if (lateBy <= 0) continue
    const period = isoWeekPeriodOf(date)
    if (!byWeek.has(period)) byWeek.set(period, new Map())
    const wm = byWeek.get(period)
    const cur = wm.get(uid) || { lateDays: 0, lateMins: 0 }
    cur.lateDays += 1
    cur.lateMins += lateBy
    wm.set(uid, cur)
  }

  for (const [period, wm] of byWeek) {
    let total = 0
    const people = []
    for (const [uid, v] of wm) {
      total += v.lateDays
      const pInfo = ctx.info.get(uid)
      people.push({ userId: uid, name: pInfo?.name || '—', avatar: pInfo?.avatar || null, lateDays: v.lateDays, lateMins: v.lateMins })
    }
    people.sort((a, b) => (b.lateDays - a.lateDays) || (b.lateMins - a.lateMins))
    out[period] = { value: total, top3: people.slice(0, 3) }
  }
  return out
}

// ── Mensuales ─────────────────────────────────────────────────────────────────

async function computeProyectosNuevosMonthly(workspaceId, tz, offset, rangeStart, rangeEnd, closedMonths) {
  const out = {}
  const closed = new Set(closedMonths)
  const projects = await prisma.project.findMany({
    where: { workspaceId, createdAt: { gte: new Date(rangeStart + 'T00:00:00' + offset), lte: new Date(rangeEnd + 'T23:59:59' + offset) } },
    select: { id: true, name: true, createdAt: true },
  })
  const byMonth = new Map()
  for (const p of projects) {
    const m = monthOf(localDate(p.createdAt, tz))
    if (!closed.has(m)) continue
    if (!byMonth.has(m)) byMonth.set(m, [])
    byMonth.get(m).push({ name: p.name })
  }
  for (const [m, items] of byMonth) out[m] = { value: items.length, top3: items.slice(0, 5) }
  return out
}

async function computeProyectosPerdidosMonthly(workspaceId, tz, offset, rangeStart, rangeEnd, closedMonths) {
  const out = {}
  const closed = new Set(closedMonths)
  const projects = await prisma.project.findMany({
    where: { workspaceId, lostAt: { gte: new Date(rangeStart + 'T00:00:00' + offset), lte: new Date(rangeEnd + 'T23:59:59' + offset) } },
    select: { id: true, name: true, lostAt: true },
  })
  const byMonth = new Map()
  for (const p of projects) {
    if (!p.lostAt) continue
    const m = monthOf(localDate(p.lostAt, tz))
    if (!closed.has(m)) continue
    if (!byMonth.has(m)) byMonth.set(m, [])
    byMonth.get(m).push({ name: p.name })
  }
  for (const [m, items] of byMonth) out[m] = { value: items.length, top3: items.slice(0, 5) }
  return out
}

async function computeEquipoMonthly(workspaceId, closedMonths) {
  const out = {}
  if (!closedMonths.length) return out
  const snaps = await prisma.rrhhMetricSnapshot.findMany({
    where: { workspaceId, metric: 'activeMembers', month: { in: closedMonths } },
    select: { month: true, value: true },
  })
  for (const s of snaps) out[s.month] = { value: Math.round(s.value) }
  return out
}

// Computa las métricas automáticas pedidas para un año calendario.
// year = número (ej 2026). autoKeys = subset de las claves del catálogo.
// Devuelve { [autoKey]: { period: { value, top3? } } } solo con las claves pedidas.
async function computeAutoScorecardYear(workspaceId, tz, year, autoKeys = []) {
  const out = {}
  for (const k of autoKeys) out[k] = {}
  if (!autoKeys.length) return out

  const todayStr = todayString(tz)
  const offset = tzOffsetStr(tz)

  const weeklyKeys  = autoKeys.filter(k => EOS_AUTO_METRICS[k]?.frequency === 'weekly')
  const monthlyKeys = autoKeys.filter(k => EOS_AUTO_METRICS[k]?.frequency === 'monthly')

  // Horarios del equipo: los necesitan tardanzas, ocupacion y delta_horas.
  const needsSchedule = weeklyKeys.length || monthlyKeys.includes('delta_horas')
  const ctx = needsSchedule ? await loadMemberInfo(workspaceId) : null

  // ── Semanales: rango = año calendario con padding ±7 días, sin futuro.
  if (weeklyKeys.length) {
    let wStart = addDays(`${year}-01-01`, -7)
    let wEnd   = addDays(`${year}-12-31`, 7)
    if (wStart <= todayStr) {
      if (wEnd > todayStr) wEnd = todayStr
      if (weeklyKeys.includes('tardanzas')) out.tardanzas = await computeTardanzasWeekly(workspaceId, tz, offset, wStart, wEnd, ctx)
      if (weeklyKeys.includes('ocupacion'))  out.ocupacion  = await occupancyByBucket(workspaceId, tz, offset, wStart, wEnd, isoWeekPeriodOf, ctx.info)
    }
  }

  // ── Mensuales: solo meses cerrados (anteriores al mes en curso).
  if (monthlyKeys.length) {
    const curMonth = todayStr.slice(0, 7)
    const closedMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
      .filter(m => m < curMonth)
    if (closedMonths.length) {
      const mStart = `${closedMonths[0]}-01`
      const mEnd   = monthBounds(closedMonths[closedMonths.length - 1]).endDate
      if (monthlyKeys.includes('delta_horas'))        out.delta_horas        = await occupancyByBucket(workspaceId, tz, offset, mStart, mEnd, monthOf, ctx.info)
      if (monthlyKeys.includes('proyectos_nuevos'))   out.proyectos_nuevos   = await computeProyectosNuevosMonthly(workspaceId, tz, offset, mStart, mEnd, closedMonths)
      if (monthlyKeys.includes('proyectos_perdidos')) out.proyectos_perdidos = await computeProyectosPerdidosMonthly(workspaceId, tz, offset, mStart, mEnd, closedMonths)
      if (monthlyKeys.includes('equipo'))             out.equipo             = await computeEquipoMonthly(workspaceId, closedMonths)
    }
  }

  return out
}

module.exports = { computeAutoScorecardYear, isoWeekPeriodOf }
