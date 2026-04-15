const prisma = require('../lib/prisma')

function calcMins(t) {
  if (t.minutesOverride !== null && t.minutesOverride !== undefined) return t.minutesOverride
  return Math.max(0, Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000) - (t.pausedMinutes || 0))
}

// Default fallback: last 90 days in Buenos Aires timezone
function defaultDateRange() {
  const tz = 'America/Argentina/Buenos_Aires'
  const to = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const d = new Date()
  d.setDate(d.getDate() - 90)
  const from = d.toLocaleDateString('en-CA', { timeZone: tz })
  return { from, to }
}

function buildDateWhere(from, to) {
  const range = {}
  if (from) range.gte = from
  if (to)   range.lte = to
  return { date: range }
}

// Filtra por completedAt usando el día en Buenos Aires (UTC-3)
function buildCompletedAtWhere(from, to) {
  const range = {}
  if (from) range.gte = new Date(from + 'T00:00:00-03:00')
  if (to)   range.lte = new Date(to   + 'T23:59:59-03:00')
  return range
}

// Minimal select shared across report queries — avoids loading full model columns
const taskSelect = {
  id:              true,
  description:     true,
  startedAt:       true,
  completedAt:     true,
  pausedMinutes:   true,
  minutesOverride: true,
  project: { select: { id: true, name: true } },
  user:    { select: { id: true, name: true, role: true } },
}

// Returns time per project within a date range
async function byProject(req, res, next) {
  try {
    let { from, to } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange())
    const completedAtRange = buildCompletedAtWhere(from, to)
    const where = {
      status: 'COMPLETED',
      startedAt: { not: null },
      completedAt: { not: null, ...completedAtRange },
    }

    const tasks = await prisma.task.findMany({
      where,
      select: taskSelect,
      orderBy: { completedAt: 'desc' },
    })

    const map = {}
    for (const t of tasks) {
      const mins = calcMins(t)
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

    const result = Object.values(map).map(({ byUser, ...rest }) => ({
      ...rest,
      byUser: Object.values(byUser),
    }))

    res.json(result)
  } catch (err) { next(err) }
}

// Returns daily summary for a specific user (admin detail view — needs workDay.date)
async function byUser(req, res, next) {
  try {
    let { userId, from, to } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange())
    const completedAtRange = buildCompletedAtWhere(from, to)
    const where = {
      status: 'COMPLETED',
      startedAt: { not: null },
      completedAt: { not: null, ...completedAtRange },
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

// Returns all users with their tasks grouped by project
async function byUserSummary(req, res, next) {
  try {
    let { from, to } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange())
    const completedAtRange = buildCompletedAtWhere(from, to)
    const where = {
      status: 'COMPLETED',
      startedAt: { not: null },
      completedAt: { not: null, ...completedAtRange },
    }

    const tasks = await prisma.task.findMany({
      where,
      select: taskSelect,
      orderBy: { completedAt: 'desc' },
    })

    const map = {}
    for (const t of tasks) {
      const mins = calcMins(t)
      const uid  = t.user.id
      if (!map[uid]) map[uid] = { user: t.user, totalMinutes: 0, taskCount: 0, byProject: {} }
      map[uid].totalMinutes += mins
      map[uid].taskCount += 1
      const pid = t.project.id
      if (!map[uid].byProject[pid]) map[uid].byProject[pid] = { project: t.project, minutes: 0, taskList: [] }
      map[uid].byProject[pid].minutes += mins
      map[uid].byProject[pid].taskList.push({
        id: t.id, description: t.description, minutes: mins,
        completedAt: t.completedAt,
        isOverride: t.minutesOverride !== null && t.minutesOverride !== undefined,
      })
    }

    const result = Object.values(map)
      .map(({ byProject, ...rest }) => ({ ...rest, byProject: Object.values(byProject) }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes)

    res.json(result)
  } catch (err) { next(err) }
}

// Returns the logged-in user's completed tasks grouped by project
async function mine(req, res, next) {
  try {
    let { from, to } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange())
    const completedAtRange = buildCompletedAtWhere(from, to)
    const where = {
      userId: req.user.id,
      status: 'COMPLETED',
      startedAt: { not: null },
      completedAt: { not: null, ...completedAtRange },
    }

    const tasks = await prisma.task.findMany({
      where,
      select: {
        id: true, description: true, startedAt: true,
        completedAt: true, pausedMinutes: true, minutesOverride: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { completedAt: 'desc' },
    })

    let totalMinutes = 0
    const byProject = {}
    for (const t of tasks) {
      const mins = calcMins(t)
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

    res.json({
      totalMinutes,
      taskCount: tasks.length,
      byProject: Object.values(byProject).sort((a, b) => b.minutes - a.minutes),
    })
  } catch (err) { next(err) }
}

module.exports = { byProject, byUser, byUserSummary, mine }
