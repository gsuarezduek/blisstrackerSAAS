const prisma = require('../lib/prisma')
const { saveAllCurrentMonth, METRIC_KEYS } = require('../services/rrhhMetricSnapshot.service')
const { monthLabel, prevMonthsArr } = require('../lib/monthUtils')
const { inArrivalWindow, laborableDays } = require('../lib/attendance')
const { deviceTypeFromUA } = require('../lib/deviceType')

function defaultDateRange(tz) {
  const to   = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const d = new Date()
  d.setDate(d.getDate() - 30)
  const from = d.toLocaleDateString('en-CA', { timeZone: tz })
  return { from, to }
}

function loginMinsFromMidnight(iso, tz) {
  const d = new Date(iso)
  const h = Number(d.toLocaleString('en-CA', { hour: 'numeric', hour12: false, timeZone: tz }))
  const m = Number(d.toLocaleString('en-CA', { minute: 'numeric', timeZone: tz }))
  return h * 60 + m
}

function minsToTime(mins) {
  const r = Math.round(mins)              // redondear el total primero evita "08:60" por minutos fraccionarios
  const h = Math.floor(r / 60), m = r % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// GET /api/admin/rrhh/logins
async function loginHistory(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    let { from, to, userId } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange(tz))

    const where = { workspaceId }
    if (from) where.loginAt = { ...(where.loginAt || {}), gte: new Date(from + 'T00:00:00' + tzSuffix(tz)) }
    if (to)   where.loginAt = { ...(where.loginAt || {}), lte: new Date(to   + 'T23:59:59' + tzSuffix(tz)) }
    if (userId) where.userId = Number(userId)

    const logins = await prisma.userLogin.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { loginAt: 'desc' },
    })

    // Agregar teamRole a cada login
    const memberMap = {}
    if (logins.length > 0) {
      const userIds = [...new Set(logins.map(l => l.userId))]
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId, userId: { in: userIds } },
        select: { userId: true, teamRole: true },
      })
      for (const m of members) memberMap[m.userId] = m.teamRole
    }

    res.json(logins.map(l => ({
      ...l,
      deviceType: deviceTypeFromUA(l.userAgent),
      user: { ...l.user, role: memberMap[l.userId] ?? '' },
    })))
  } catch (err) { next(err) }
}

// Helper: timezone offset string para new Date()
function tzSuffix(tz) {
  // Solo funciona correctamente con las timezones de LatAm comunes
  const offsets = {
    'America/Argentina/Buenos_Aires': '-03:00',
    'America/Santiago':               '-04:00',
    'America/Bogota':                 '-05:00',
    'America/Mexico_City':            '-06:00',
    'America/New_York':               '-05:00',
    'America/Los_Angeles':            '-08:00',
    'Europe/Madrid':                  '+01:00',
    'UTC':                            '+00:00',
  }
  return offsets[tz] ?? '-03:00'
}

// GET /api/admin/rrhh/last-logins
async function lastLogins(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId, active: true },
      select: {
        userId: true,
        user: {
          select: {
            loginEvents: {
              where: { workspaceId },
              orderBy: { loginAt: 'desc' },
              take: 1,
              select: { loginAt: true },
            },
          },
        },
      },
    })
    res.json(members.map(m => ({
      userId:    m.userId,
      lastLogin: m.user.loginEvents[0]?.loginAt ?? null,
    })))
  } catch (err) { next(err) }
}

// GET /api/admin/rrhh/user-summary/:id
async function userSummary(req, res, next) {
  try {
    const userId = Number(req.params.id)
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone

    const [logins, memberships, member, leaveRows] = await Promise.all([
      prisma.userLogin.findMany({
        where: { userId, workspaceId },
        select: { id: true, loginAt: true },
        orderBy: { loginAt: 'asc' },
      }),
      prisma.projectMember.findMany({
        where: { userId, project: { active: true, workspaceId } },
        include: { project: { select: { id: true, name: true, active: true } } },
      }),
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { active: true, workStartTime: true, workEndTime: true },
      }),
      // Licencias efectivamente tomadas (aprobadas). El frontend filtra por año.
      prisma.vacationRequest.findMany({
        where: { workspaceId, userId, status: 'approved' },
        select: { id: true, type: true, startDate: true, endDate: true, observation: true },
        orderBy: { startDate: 'desc' },
      }),
    ])

    const attendanceTrackingEnabled = req.workspace.attendanceTrackingEnabled !== false
    const tolerance = req.workspace.lateToleranceMins ?? 0  // minutos de gracia para tardanza
    const start = member?.workStartTime
    const startMins = (attendanceTrackingEnabled && start)
      ? (() => { const [sh, sm] = start.split(':').map(Number); return sh * 60 + sm })()
      : null

    const byDay = {}
    for (const l of logins) {
      const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: tz })
      if (!byDay[day]) byDay[day] = l   // primer ingreso del día (orden asc)
    }
    // "Llegadas" válidas = primer ingreso dentro de la ventana de ±2h del horario (si hay horario).
    // Un ingreso fuera de la ventana (domingo a la tarde, chequeo nocturno) no es una llegada:
    // no entra al promedio ni a la puntualidad. Sin horario configurado no se filtra (no hay referencia).
    const isArrival = iso => inArrivalWindow(loginMinsFromMidnight(iso, tz), startMins)
    const arrivals = Object.values(byDay).map(l => l.loginAt).filter(isArrival)

    let avgLoginTime = null
    if (arrivals.length > 0) {
      const totalMins = arrivals.reduce((acc, iso) => acc + loginMinsFromMidnight(iso, tz), 0)
      avgLoginTime = minsToTime(totalMins / arrivals.length)
    }

    // Desglose día por día del PRIMER ingreso (más reciente primero). Se muestran todos los días
    // (para poder corregir/eliminar el ingreso), pero lateBy queda null fuera de la ventana → sin badge.
    const loginDays = Object.entries(byDay)
      .map(([date, l]) => {
        const mins = loginMinsFromMidnight(l.loginAt, tz)
        return {
          id: l.id,   // id del UserLogin del primer ingreso (para editar/eliminar)
          date,
          time: minsToTime(mins),
          lateBy: (startMins != null && inArrivalWindow(mins, startMins)) ? Math.max(0, mins - startMins - tolerance) : null,
        }
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))

    // Puntualidad: compara cada llegada válida (dentro de la ventana) con el horario + tolerancia.
    // Solo si el seguimiento de horarios está habilitado para el workspace.
    let punctuality = null
    if (startMins != null && arrivals.length > 0) {
      let lateDays = 0, totalLateMins = 0
      for (const iso of arrivals) {
        const lateBy = loginMinsFromMidnight(iso, tz) - startMins - tolerance
        if (lateBy > 0) { lateDays++; totalLateMins += lateBy }
      }
      const daysCount = arrivals.length
      punctuality = {
        expectedStart: start,
        toleranceMins: tolerance,
        daysCount,
        lateDays,
        onTimeDays: daysCount - lateDays,
        avgLateMins: lateDays > 0 ? Math.round(totalLateMins / lateDays) : 0,
        punctualityPct: Math.round(((daysCount - lateDays) / daysCount) * 100),
      }
    }

    res.json({
      avgLoginTime,
      loginCount: logins.length,
      loginDays,
      projects: memberships.map(m => m.project),
      active: member?.active ?? false,
      workStartTime: member?.workStartTime ?? null,
      workEndTime: member?.workEndTime ?? null,
      punctuality,
      leaves: leaveRows,
      attendanceTrackingEnabled,
      lateToleranceMins: tolerance,
    })
  } catch (err) { next(err) }
}

// PATCH /api/admin/rrhh/vacation-days/:id
async function updateVacationDays(req, res, next) {
  try {
    const userId = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { delta } = req.body
    if (delta !== 1 && delta !== -1) {
      return res.status(400).json({ error: 'delta debe ser 1 o -1' })
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    })
    if (!member) return res.status(404).json({ error: 'Usuario no encontrado' })

    const newVal = Math.max(0, member.vacationDays + delta)
    const updated = await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { vacationDays: newVal },
      select: { userId: true, vacationDays: true },
    })
    res.json({ id: updated.userId, vacationDays: updated.vacationDays })
  } catch (err) { next(err) }
}

// PATCH /api/admin/rrhh/logins/:loginId
// Edita la hora (y opcionalmente la fecha) de un ingreso registrado.
// Útil para corregir un ingreso de la tarde (fin de semana/feriado) que distorsiona el promedio.
async function updateLogin(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const loginId = Number(req.params.loginId)
    const { time, date } = req.body || {}

    const login = await prisma.userLogin.findFirst({ where: { id: loginId, workspaceId } })
    if (!login) return res.status(404).json({ error: 'Ingreso no encontrado' })

    const curDay  = new Date(login.loginAt).toLocaleDateString('en-CA', { timeZone: tz })
    const curTime = minsToTime(loginMinsFromMidnight(login.loginAt, tz))

    const newDay  = date || curDay
    const newTime = time || curTime
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDay)) return res.status(400).json({ error: 'Fecha inválida' })
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newTime)) return res.status(400).json({ error: 'Hora inválida (HH:MM)' })

    const loginAt = new Date(`${newDay}T${newTime}:00${tzSuffix(tz)}`)
    const updated = await prisma.userLogin.update({ where: { id: loginId }, data: { loginAt } })
    res.json(updated)
  } catch (err) { next(err) }
}

// DELETE /api/admin/rrhh/logins/:loginId
async function deleteLogin(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const loginId = Number(req.params.loginId)
    const login = await prisma.userLogin.findFirst({ where: { id: loginId, workspaceId } })
    if (!login) return res.status(404).json({ error: 'Ingreso no encontrado' })
    await prisma.userLogin.delete({ where: { id: loginId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// GET /api/admin/rrhh/dashboard-stats
async function dashboardStats(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const attendanceTrackingEnabled = req.workspace.attendanceTrackingEnabled !== false
    const tolerance = req.workspace.lateToleranceMins ?? 0  // minutos de gracia para tardanza

    // Hora promedio y puntualidad se calculan sobre el MES EN CURSO (hay historial para otros meses).
    const monthStart = new Date().toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7) + '-01'

    // Ventana para "Licencias": aprobadas que se solapan con [hoy, hoy+30d].
    const today30 = new Date(); today30.setDate(today30.getDate() + 30)
    const leaveHorizon = today30.toLocaleDateString('en-CA', { timeZone: tz })
    const todayStrTz = new Date().toLocaleDateString('en-CA', { timeZone: tz })

    const [members, activeProjects, monthLogins, leaveRows] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId, active: true },
        select: { userId: true, workStartTime: true },
      }),
      prisma.project.count({ where: { workspaceId, active: true } }),
      prisma.userLogin.findMany({
        where: {
          workspaceId,
          user: { workspaceMembers: { some: { workspaceId, active: true } } },
          loginAt: { gte: new Date(monthStart + 'T00:00:00' + tzSuffix(tz)) },
        },
        select: { userId: true, loginAt: true },
        orderBy: { loginAt: 'asc' },
      }),
      prisma.vacationRequest.findMany({
        where: {
          workspaceId,
          status: 'approved',
          startDate: { lte: leaveHorizon },  // empieza dentro del horizonte
          endDate:   { gte: todayStrTz },     // y todavía no terminó
        },
        select: {
          id: true, type: true, startDate: true, endDate: true,
          user: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { startDate: 'asc' },
      }),
    ])
    // Licencias en curso o próximas (30 días). Cada fila marca si está activa hoy.
    const leaves = leaveRows.map(l => ({
      id: l.id,
      userId: l.user.id,
      name: l.user.name,
      avatar: l.user.avatar,
      type: l.type,
      startDate: l.startDate,
      endDate: l.endDate,
      active: l.startDate <= todayStrTz && l.endDate >= todayStrTz,
    }))

    const activeMembers = members.length
    // Mapa userId → minutos del horario de inicio configurado.
    // Si el seguimiento de horarios está apagado, queda vacío → no se calcula puntualidad/tardanzas.
    const scheduleMap = {}
    if (attendanceTrackingEnabled) {
      for (const m of members) {
        if (m.workStartTime) {
          const [h, mm] = m.workStartTime.split(':').map(Number)
          scheduleMap[m.userId] = h * 60 + mm
        }
      }
    }

    // Días laborables del mes: un día cuenta solo si >50% del equipo activo se logueó (excluye
    // fines de semana y feriados). Un login de domingo a la tarde no hace "laborable" al domingo.
    const laborSet = laborableDays(monthLogins, activeMembers, tz)

    const byUserDay = {}
    for (const l of monthLogins) {
      const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: tz })
      const key = `${l.userId}::${day}`
      if (!byUserDay[key]) byUserDay[key] = l.loginAt
    }
    // Hora promedio y puntualidad: solo personas con horario, en días laborables y cuando la
    // llegada cae dentro de la ventana de ±2h (descarta conexiones sueltas que ensucian el promedio).
    const firstLoginMins = []
    let scheduledDays = 0, lateCount = 0
    for (const [key, iso] of Object.entries(byUserDay)) {
      const [uidStr, day] = key.split('::')
      const startMins = scheduleMap[Number(uidStr)]
      if (startMins == null) continue
      if (!laborSet.has(day)) continue
      const mins = loginMinsFromMidnight(iso, tz)
      if (!inArrivalWindow(mins, startMins)) continue
      firstLoginMins.push(mins)
      scheduledDays++
      if (mins - startMins - tolerance > 0) lateCount++
    }
    const avgFirstLoginTime = firstLoginMins.length > 0
      ? minsToTime(firstLoginMins.reduce((a, b) => a + b, 0) / firstLoginMins.length)
      : null
    const teamPunctualityPct = scheduledDays > 0
      ? Math.round(((scheduledDays - lateCount) / scheduledDays) * 100)
      : null

    // Tardanzas de hoy: primer ingreso de hoy vs horario, dentro de la ventana de ±2h.
    // (No exige "día laborable": a la mañana temprano todavía no se logueó >50% del equipo.)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
    const lateToday = []
    for (const uid of Object.keys(scheduleMap)) {
      const iso = byUserDay[`${uid}::${today}`]
      if (!iso) continue
      const mins = loginMinsFromMidnight(iso, tz)
      if (!inArrivalWindow(mins, scheduleMap[uid])) continue
      const lateBy = mins - scheduleMap[uid] - tolerance
      if (lateBy > 0) lateToday.push({ userId: Number(uid), lateBy })
    }
    lateToday.sort((a, b) => b.lateBy - a.lateBy)

    const projectsPerPerson = activeMembers > 0
      ? Math.round((activeProjects / activeMembers) * 10) / 10
      : 0

    // Snapshot perezoso del mes actual: cada visita a RRHH actualiza el punto del mes,
    // así se construye el historial de métricas. Aislado para no romper el dashboard.
    // Pasamos projectsPerPerson ya calculado; el resto (tenure) lo computa el servicio.
    saveAllCurrentMonth(workspaceId, tz, {
      projectsPerPerson: { value: projectsPerPerson, detail: { activeMembers, activeProjects } },
    }).catch(err => console.error('[RrhhMetricSnapshot] upsert mes actual:', err.message))

    res.json({
      projectsPerPerson,
      avgFirstLoginTime,
      teamPunctualityPct,
      scheduledDays,
      lateCount,
      membersWithSchedule: Object.keys(scheduleMap).length,
      lateToday,
      leaves,
      attendanceTrackingEnabled,
      lateToleranceMins: tolerance,
    })
  } catch (err) { next(err) }
}

// GET /api/admin/rrhh/metric-history?metric=projectsPerPerson|tenure&year=YYYY
// Historial mensual de una métrica de RRHH. Sin year → últimos 12 meses.
// Con year → los 12 meses de ese año calendario. Devuelve también los años con datos.
async function metricHistory(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const metric = req.query.metric
    if (!METRIC_KEYS.includes(metric)) {
      return res.status(400).json({ error: 'metric inválido' })
    }
    const yearParam = req.query.year ? Number(req.query.year) : null

    const all = await prisma.rrhhMetricSnapshot.findMany({
      where: { workspaceId, metric },
      select: { month: true, value: true, detail: true },
      orderBy: { month: 'asc' },
    })

    const availableYears = [...new Set(all.map(s => Number(s.month.slice(0, 4))))].sort((a, b) => a - b)
    const byMonth = Object.fromEntries(all.map(s => [s.month, s]))

    // Lista de meses a mostrar (siempre 12, rellenando huecos con null para no romper el eje).
    let months
    if (yearParam) {
      months = Array.from({ length: 12 }, (_, i) => `${yearParam}-${String(i + 1).padStart(2, '0')}`)
    } else {
      const curMonth = new Date().toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7)
      months = prevMonthsArr(curMonth, 12)
    }

    const snapshots = months.map(m => {
      const s = byMonth[m]
      return {
        month: m,
        label: monthLabel(m),
        value: s ? s.value : null,
        detail: s ? s.detail : null,
      }
    })

    res.json({ snapshots, availableYears })
  } catch (err) { next(err) }
}

module.exports = { loginHistory, lastLogins, userSummary, updateVacationDays, dashboardStats, updateLogin, deleteLogin, metricHistory }
