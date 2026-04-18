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
        select: { loginAt: true },
        orderBy: { loginAt: 'asc' },
      }),
      prisma.projectMember.findMany({
        where: { userId, project: { active: true, workspaceId } },
        include: { project: { select: { id: true, name: true, active: true } } },
      }),
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { active: true },
      }),
    ])

    const byDay = {}
    for (const l of logins) {
      const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: tz })
      if (!byDay[day]) byDay[day] = l.loginAt
    }
    const firstLogins = Object.values(byDay)

    let avgLoginTime = null
    if (firstLogins.length > 0) {
      const totalMins = firstLogins.reduce((acc, iso) => acc + loginMinsFromMidnight(iso, tz), 0)
      avgLoginTime = minsToTime(totalMins / firstLogins.length)
    }

    res.json({
      avgLoginTime,
      loginCount: logins.length,
      projects: memberships.map(m => m.project),
      active: member?.active ?? false,
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

// GET /api/admin/rrhh/dashboard-stats
async function dashboardStats(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone

    const [activeMembers, activeProjects, allLogins] = await Promise.all([
      prisma.workspaceMember.count({ where: { workspaceId, active: true } }),
      prisma.project.count({ where: { workspaceId, active: true } }),
      prisma.userLogin.findMany({
        where: {
          workspaceId,
          workspaceMember: { some: { workspaceId, active: true } },
        },
        select: { userId: true, loginAt: true },
        orderBy: { loginAt: 'asc' },
      }),
    ])

    const byUserDay = {}
    for (const l of allLogins) {
      const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: tz })
      const key = `${l.userId}::${day}`
      if (!byUserDay[key]) byUserDay[key] = l.loginAt
    }
    const firstLoginMins = Object.values(byUserDay).map(iso => loginMinsFromMidnight(iso, tz))
    const avgFirstLoginTime = firstLoginMins.length > 0
      ? minsToTime(firstLoginMins.reduce((a, b) => a + b, 0) / firstLoginMins.length)
      : null

    res.json({
      projectsPerPerson: activeMembers > 0
        ? Math.round((activeProjects / activeMembers) * 10) / 10
        : 0,
      avgFirstLoginTime,
    })
  } catch (err) { next(err) }
}

module.exports = { loginHistory, lastLogins, userSummary, updateVacationDays, dashboardStats }
