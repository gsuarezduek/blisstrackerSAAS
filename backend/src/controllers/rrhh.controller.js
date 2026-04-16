const prisma = require('../lib/prisma')

const TZ = 'America/Argentina/Buenos_Aires'

// Default: last 30 days in Buenos Aires timezone
function defaultDateRange() {
  const to   = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const d = new Date()
  d.setDate(d.getDate() - 30)
  const from = d.toLocaleDateString('en-CA', { timeZone: TZ })
  return { from, to }
}

function loginMinsFromMidnight(iso) {
  const d = new Date(iso)
  const h = Number(d.toLocaleString('en-CA', { hour: 'numeric', hour12: false, timeZone: TZ }))
  const m = Number(d.toLocaleString('en-CA', { minute: 'numeric', timeZone: TZ }))
  return h * 60 + m
}

function minsToTime(mins) {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

async function loginHistory(req, res, next) {
  try {
    let { from, to, userId } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange())

    const where = {}
    if (from) where.loginAt = { ...(where.loginAt || {}), gte: new Date(from + 'T00:00:00-03:00') }
    if (to)   where.loginAt = { ...(where.loginAt || {}), lte: new Date(to   + 'T23:59:59-03:00') }
    if (userId) where.userId = Number(userId)

    const logins = await prisma.userLogin.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, role: true, avatar: true } },
      },
      orderBy: { loginAt: 'desc' },
    })

    res.json(logins)
  } catch (err) { next(err) }
}

// Último login de cada usuario activo
async function lastLogins(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        loginEvents: {
          orderBy: { loginAt: 'desc' },
          take: 1,
          select: { loginAt: true },
        },
      },
    })
    res.json(users.map(u => ({
      userId:    u.id,
      lastLogin: u.loginEvents[0]?.loginAt ?? null,
    })))
  } catch (err) { next(err) }
}

// Resumen de un usuario: promedio histórico de ingreso + proyectos
async function userSummary(req, res, next) {
  try {
    const userId = Number(req.params.id)

    const [logins, memberships] = await Promise.all([
      prisma.userLogin.findMany({
        where: { userId },
        select: { loginAt: true },
      }),
      prisma.projectMember.findMany({
        where: { userId },
        include: { project: { select: { id: true, name: true, active: true } } },
      }),
    ])

    let avgLoginTime = null
    if (logins.length > 0) {
      const totalMins = logins.reduce((acc, l) => acc + loginMinsFromMidnight(l.loginAt), 0)
      avgLoginTime = minsToTime(totalMins / logins.length)
    }

    res.json({
      avgLoginTime,
      loginCount: logins.length,
      projects: memberships.map(m => m.project),
    })
  } catch (err) { next(err) }
}

// Actualizar días de vacaciones de un usuario
async function updateVacationDays(req, res, next) {
  try {
    const userId = Number(req.params.id)
    const { delta } = req.body  // +1 o -1
    if (delta !== 1 && delta !== -1) {
      return res.status(400).json({ error: 'delta debe ser 1 o -1' })
    }

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { vacationDays: true },
    })
    if (!current) return res.status(404).json({ error: 'Usuario no encontrado' })

    const newVal = Math.max(0, current.vacationDays + delta)
    const user = await prisma.user.update({
      where: { id: userId },
      data: { vacationDays: newVal },
      select: { id: true, vacationDays: true },
    })
    res.json(user)
  } catch (err) { next(err) }
}

module.exports = { loginHistory, lastLogins, userSummary, updateVacationDays }
