const prisma = require('../lib/prisma')

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
  const h = Math.floor(mins / 60), m = Math.round(mins % 60)
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

    const [logins, memberships, member] = await Promise.all([
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
    ])

    const byDay = {}
    for (const l of logins) {
      const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: tz })
      if (!byDay[day]) byDay[day] = l   // primer ingreso del día (orden asc)
    }
    const firstLogins = Object.values(byDay).map(l => l.loginAt)

    let avgLoginTime = null
    if (firstLogins.length > 0) {
      const totalMins = firstLogins.reduce((acc, iso) => acc + loginMinsFromMidnight(iso, tz), 0)
      avgLoginTime = minsToTime(totalMins / firstLogins.length)
    }

    const attendanceTrackingEnabled = req.workspace.attendanceTrackingEnabled !== false
    const tolerance = req.workspace.lateToleranceMins ?? 0  // minutos de gracia para tardanza
    const start = member?.workStartTime
    const startMins = (attendanceTrackingEnabled && start)
      ? (() => { const [sh, sm] = start.split(':').map(Number); return sh * 60 + sm })()
      : null

    // Desglose día por día del PRIMER ingreso (más reciente primero).
    // lateBy = minutos por encima del límite tolerado (workStartTime + tolerancia).
    const loginDays = Object.entries(byDay)
      .map(([date, l]) => {
        const mins = loginMinsFromMidnight(l.loginAt, tz)
        return {
          id: l.id,   // id del UserLogin del primer ingreso (para editar/eliminar)
          date,
          time: minsToTime(mins),
          lateBy: startMins != null ? Math.max(0, mins - startMins - tolerance) : null,
        }
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))

    // Puntualidad: compara el primer ingreso de cada día con el horario + tolerancia.
    // Solo si el seguimiento de horarios está habilitado para el workspace.
    let punctuality = null
    if (startMins != null && firstLogins.length > 0) {
      let lateDays = 0, totalLateMins = 0
      for (const iso of firstLogins) {
        const lateBy = loginMinsFromMidnight(iso, tz) - startMins - tolerance
        if (lateBy > 0) { lateDays++; totalLateMins += lateBy }
      }
      const daysCount = firstLogins.length
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

    const [members, activeProjects, allLogins] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { workspaceId, active: true },
        select: { userId: true, workStartTime: true },
      }),
      prisma.project.count({ where: { workspaceId, active: true } }),
      prisma.userLogin.findMany({
        where: {
          workspaceId,
          user: { workspaceMembers: { some: { workspaceId, active: true } } },
        },
        select: { userId: true, loginAt: true },
        orderBy: { loginAt: 'asc' },
      }),
    ])

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

    const byUserDay = {}
    for (const l of allLogins) {
      const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: tz })
      const key = `${l.userId}::${day}`
      if (!byUserDay[key]) byUserDay[key] = l.loginAt
    }
    // Hora promedio de ingreso: solo personas con horario configurado (los freelancers
    // o quienes trabajan en otra franja horaria no tienen horario → no se cuentan).
    const firstLoginMins = Object.entries(byUserDay)
      .filter(([key]) => scheduleMap[Number(key.split('::')[0])] != null)
      .map(([, iso]) => loginMinsFromMidnight(iso, tz))
    const avgFirstLoginTime = firstLoginMins.length > 0
      ? minsToTime(firstLoginMins.reduce((a, b) => a + b, 0) / firstLoginMins.length)
      : null

    // Puntualidad del equipo: sobre el primer ingreso de cada día de quienes tienen horario
    let scheduledDays = 0, lateCount = 0
    for (const [key, iso] of Object.entries(byUserDay)) {
      const uid = Number(key.split('::')[0])
      const startMins = scheduleMap[uid]
      if (startMins == null) continue
      scheduledDays++
      if (loginMinsFromMidnight(iso, tz) - startMins > tolerance) lateCount++
    }
    const teamPunctualityPct = scheduledDays > 0
      ? Math.round(((scheduledDays - lateCount) / scheduledDays) * 100)
      : null

    // Tardanzas de hoy: primer ingreso de hoy vs horario, por persona
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
    const lateToday = []
    for (const uid of Object.keys(scheduleMap)) {
      const iso = byUserDay[`${uid}::${today}`]
      if (!iso) continue
      const lateBy = loginMinsFromMidnight(iso, tz) - scheduleMap[uid] - tolerance
      if (lateBy > 0) lateToday.push({ userId: Number(uid), lateBy })
    }
    lateToday.sort((a, b) => b.lateBy - a.lateBy)

    res.json({
      projectsPerPerson: activeMembers > 0
        ? Math.round((activeProjects / activeMembers) * 10) / 10
        : 0,
      avgFirstLoginTime,
      teamPunctualityPct,
      scheduledDays,
      lateCount,
      membersWithSchedule: Object.keys(scheduleMap).length,
      lateToday,
      attendanceTrackingEnabled,
      lateToleranceMins: tolerance,
    })
  } catch (err) { next(err) }
}

module.exports = { loginHistory, lastLogins, userSummary, updateVacationDays, dashboardStats, updateLogin, deleteLogin }
