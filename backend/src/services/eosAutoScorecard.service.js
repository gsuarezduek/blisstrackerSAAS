// Cálculo de las métricas AUTOMÁTICAS del Scorecard EOS, bucketeadas por semana ISO.
// Reutiliza los mismos criterios que la sección de Productividad / Asistencia:
//   - Tardanza = primer login del día > workStartTime + tolerancia (TZ del workspace).
//   - Horas disponibles = días hábiles esperados (sin licencia) × jornada (workEnd − workStart).
//   - Horas trabajadas = tiempo activo de tareas completadas (taskMins, tope 8h, descuenta pausas).
//   - Ocupación = Σ horas trabajadas ÷ Σ horas disponibles (solo quienes tienen horario) — ya
//     ponderada por horas, así normaliza jornadas de 4h vs 8h.
// No persiste nada: se recalcula desde los datos crudos (logins/workdays/tasks) en cada request.
// Devuelve, por métrica pedida, un mapa { 'YYYY-Www': { value, top3 } }.

const prisma = require('../lib/prisma')
const { tzOffsetStr, addDays, taskMins } = require('../lib/timeMetrics')
const { todayString } = require('../utils/dates')

// "YYYY-Www" (ISO 8601) de una fecha YYYY-MM-DD, interpretada como UTC.
function isoWeekPeriodOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

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

// Computa las métricas automáticas para todas las semanas ISO de un año calendario.
// year = número (ej 2026). autoKeys = subset de ['tardanzas','ocupacion'] a calcular.
// Devuelve { tardanzas?: {period:{value,top3}}, ocupacion?: {...} } solo con las claves pedidas.
async function computeAutoScorecardYear(workspaceId, tz, year, autoKeys = []) {
  const want = new Set(autoKeys)
  const out = {}
  for (const k of autoKeys) out[k] = {}
  if (!want.size) return out

  const todayStr = todayString(tz)
  // Padding de ±7 días para cubrir semanas ISO que cruzan el borde del año calendario.
  let rangeStart = addDays(`${year}-01-01`, -7)
  let rangeEnd   = addDays(`${year}-12-31`, 7)
  if (rangeStart > todayStr) return out          // año futuro: sin datos
  if (rangeEnd   > todayStr) rangeEnd = todayStr  // no calcular el futuro

  const offset = tzOffsetStr(tz)

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

  // Mapa de horarios por usuario.
  const info = new Map() // uid -> { name, avatar, startMins|null, dayMins|null }
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

  // ── Tardanzas ───────────────────────────────────────────────────────────────
  if (want.has('tardanzas') && attendanceEnabled) {
    const logins = await prisma.userLogin.findMany({
      where: { workspaceId, loginAt: { gte: new Date(rangeStart + 'T00:00:00' + offset), lte: new Date(rangeEnd + 'T23:59:59' + offset) } },
      select: { userId: true, loginAt: true },
      orderBy: { loginAt: 'asc' },
    })

    // Primer login por (usuario, día local).
    const firstByUserDay = new Map() // `${uid}::${date}` -> minutos
    for (const l of logins) {
      const date = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: tz })
      if (date < rangeStart || date > rangeEnd) continue
      const key = `${l.userId}::${date}`
      if (!firstByUserDay.has(key)) firstByUserDay.set(key, loginMinsFromMidnight(l.loginAt, tz))
    }

    // Acumular tardanzas por semana y usuario.
    const byWeek = new Map() // period -> Map<uid, {lateDays, lateMins}>
    for (const [key, mins] of firstByUserDay) {
      const [uidStr, date] = key.split('::')
      const uid = Number(uidStr)
      const startMins = info.get(uid)?.startMins
      if (startMins == null) continue
      const lateBy = mins - startMins - tolerance
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
        const pInfo = info.get(uid)
        people.push({ userId: uid, name: pInfo?.name || '—', avatar: pInfo?.avatar || null, lateDays: v.lateDays, lateMins: v.lateMins })
      }
      people.sort((a, b) => (b.lateDays - a.lateDays) || (b.lateMins - a.lateMins))
      out.tardanzas[period] = { value: total, top3: people.slice(0, 3) }
    }
  }

  // ── Ocupación ─────────────────────────────────────────────────────────────────
  if (want.has('ocupacion')) {
    const scheduled = [...info.entries()].filter(([, v]) => v.dayMins != null)
    if (scheduled.length) {
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
      const leaveDays = new Map() // uid -> Set<date>
      for (const lv of leaves) {
        if (!scheduledIds.has(lv.userId)) continue
        const start = lv.startDate > rangeStart ? lv.startDate : rangeStart
        const end   = lv.endDate   < rangeEnd   ? lv.endDate   : rangeEnd
        if (!leaveDays.has(lv.userId)) leaveDays.set(lv.userId, new Set())
        const set = leaveDays.get(lv.userId)
        for (const d of businessDayList(start, end)) set.add(d)
      }

      // Horas disponibles por (semana, usuario): días hábiles sin licencia × jornada.
      const availByWeek = new Map() // period -> Map<uid, mins>
      for (const day of businessDayList(rangeStart, rangeEnd)) {
        const period = isoWeekPeriodOf(day)
        if (!availByWeek.has(period)) availByWeek.set(period, new Map())
        const wm = availByWeek.get(period)
        for (const [uid, v] of scheduled) {
          if (leaveDays.get(uid)?.has(day)) continue
          wm.set(uid, (wm.get(uid) || 0) + v.dayMins)
        }
      }

      // Horas trabajadas por (semana, usuario) — solo quienes tienen horario.
      const regByWeek = new Map() // period -> Map<uid, mins>
      for (const t of tasks) {
        if (!scheduledIds.has(t.userId)) continue
        const date = new Date(t.completedAt).toLocaleDateString('en-CA', { timeZone: tz })
        if (date < rangeStart || date > rangeEnd) continue
        const period = isoWeekPeriodOf(date)
        if (!regByWeek.has(period)) regByWeek.set(period, new Map())
        const wm = regByWeek.get(period)
        wm.set(t.userId, (wm.get(t.userId) || 0) + taskMins(t))
      }

      for (const [period, availMap] of availByWeek) {
        const regMap = regByWeek.get(period) || new Map()
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
        out.ocupacion[period] = { value: Math.round(sumReg / sumAvail * 100), top3: people.slice(0, 3) }
      }
    }
  }

  return out
}

module.exports = { computeAutoScorecardYear, isoWeekPeriodOf }
