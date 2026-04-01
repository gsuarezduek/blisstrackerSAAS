const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function calcMins(t) {
  if (t.minutesOverride !== null && t.minutesOverride !== undefined) return t.minutesOverride
  return Math.max(0, Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000) - (t.pausedMinutes || 0))
}

// Returns time per project within a date range
async function byProject(req, res, next) {
  try {
    const { from, to } = req.query
    const where = { status: 'COMPLETED', startedAt: { not: null }, completedAt: { not: null } }
    if (from || to) {
      where.workDay = {}
      if (from) where.workDay.date = { gte: from }
      if (to) where.workDay.date = { ...where.workDay.date, lte: to }
    }

    const tasks = await prisma.task.findMany({
      where,
      include: { project: true, user: { select: { id: true, name: true, role: true } } },
    })

    // Group by project
    const map = {}
    for (const t of tasks) {
      const mins = calcMins(t)
      const key = t.project.id
      if (!map[key]) map[key] = { project: t.project, totalMinutes: 0, taskCount: 0, byUser: {} }
      map[key].totalMinutes += mins
      map[key].taskCount += 1
      const uid = t.user.id
      if (!map[key].byUser[uid]) map[key].byUser[uid] = { user: t.user, minutes: 0, tasks: 0, taskList: [] }
      map[key].byUser[uid].minutes += mins
      map[key].byUser[uid].tasks += 1
      map[key].byUser[uid].taskList.push({ id: t.id, description: t.description, minutes: mins, completedAt: t.completedAt, isOverride: t.minutesOverride !== null && t.minutesOverride !== undefined })
    }

    const result = Object.values(map).map(({ byUser, ...rest }) => ({
      ...rest,
      byUser: Object.values(byUser),
    }))

    res.json(result)
  } catch (err) { next(err) }
}

// Returns daily summary for a specific user (for admin detail view)
async function byUser(req, res, next) {
  try {
    const { userId, from, to } = req.query
    const where = { status: 'COMPLETED', startedAt: { not: null }, completedAt: { not: null } }
    if (userId) where.userId = Number(userId)
    if (from || to) {
      where.workDay = {}
      if (from) where.workDay.date = { gte: from }
      if (to) where.workDay.date = { ...where.workDay.date, lte: to }
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: true,
        workDay: { select: { date: true } },
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { startedAt: 'asc' },
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
    const { from, to } = req.query
    const where = { status: 'COMPLETED', startedAt: { not: null }, completedAt: { not: null } }
    if (from || to) {
      where.workDay = {}
      if (from) where.workDay.date = { gte: from }
      if (to) where.workDay.date = { ...where.workDay.date, lte: to }
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: true,
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { completedAt: 'asc' },
    })

    // Group by user → project → tasks
    const map = {}
    for (const t of tasks) {
      const mins = calcMins(t)
      const uid = t.user.id
      if (!map[uid]) map[uid] = { user: t.user, totalMinutes: 0, taskCount: 0, byProject: {} }
      map[uid].totalMinutes += mins
      map[uid].taskCount += 1
      const pid = t.project.id
      if (!map[uid].byProject[pid]) map[uid].byProject[pid] = { project: t.project, minutes: 0, taskList: [] }
      map[uid].byProject[pid].minutes += mins
      map[uid].byProject[pid].taskList.push({ id: t.id, description: t.description, minutes: mins, completedAt: t.completedAt, isOverride: t.minutesOverride !== null && t.minutesOverride !== undefined })
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
    const { from, to } = req.query
    const where = {
      userId: req.user.id,
      status: 'COMPLETED',
      startedAt: { not: null },
      completedAt: { not: null },
    }
    if (from || to) {
      where.workDay = {}
      if (from) where.workDay.date = { gte: from }
      if (to) where.workDay.date = { ...where.workDay.date, lte: to }
    }

    const tasks = await prisma.task.findMany({
      where,
      include: { project: true },
      orderBy: { completedAt: 'asc' },
    })

    let totalMinutes = 0
    const byProject = {}
    for (const t of tasks) {
      const mins = calcMins(t)
      totalMinutes += mins
      const pid = t.project.id
      if (!byProject[pid]) byProject[pid] = { project: t.project, minutes: 0, taskList: [] }
      byProject[pid].minutes += mins
      byProject[pid].taskList.push({ id: t.id, description: t.description, minutes: mins, completedAt: t.completedAt, isOverride: t.minutesOverride !== null && t.minutesOverride !== undefined })
    }

    res.json({
      totalMinutes,
      taskCount: tasks.length,
      byProject: Object.values(byProject).sort((a, b) => b.minutes - a.minutes),
    })
  } catch (err) { next(err) }
}

module.exports = { byProject, byUser, byUserSummary, mine }
