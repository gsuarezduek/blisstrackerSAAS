const prisma = require('../lib/prisma')

function calcMins(t) {
  if (t.minutesOverride !== null && t.minutesOverride !== undefined) return t.minutesOverride
  return Math.max(0, Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000) - (t.pausedMinutes || 0))
}

function defaultDateRange(tz = 'America/Argentina/Buenos_Aires') {
  const to = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const d = new Date()
  d.setDate(d.getDate() - 90)
  const from = d.toLocaleDateString('en-CA', { timeZone: tz })
  return { from, to }
}

// Filtra por completedAt usando el timezone del workspace
function buildCompletedAtWhere(from, to, tz = 'America/Argentina/Buenos_Aires') {
  // Obtener el offset UTC para la timezone dada (aproximación para ART y similares)
  const testDate = new Date(`${from}T12:00:00Z`)
  const localStr = testDate.toLocaleDateString('en-CA', { timeZone: tz })
  const offsetMs = new Date(`${localStr}T12:00:00Z`) - testDate
  const offsetH  = -Math.round(offsetMs / 3600000)
  const sign     = offsetH <= 0 ? '+' : '-'
  const pad      = String(Math.abs(offsetH)).padStart(2, '0')
  const tzStr    = `${sign}${pad}:00`

  const range = {}
  if (from) range.gte = new Date(`${from}T00:00:00${tzStr}`)
  if (to)   range.lte = new Date(`${to}T23:59:59${tzStr}`)
  return range
}

const taskSelect = {
  id:              true,
  description:     true,
  startedAt:       true,
  completedAt:     true,
  pausedMinutes:   true,
  minutesOverride: true,
  project: { select: { id: true, name: true } },
  user:    { select: { id: true, name: true } },
}

async function byProject(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    let { from, to } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange(tz))
    const completedAtRange = buildCompletedAtWhere(from, to, tz)

    const tasks = await prisma.task.findMany({
      where: {
        status: 'COMPLETED',
        startedAt: { not: null },
        completedAt: { not: null, ...completedAtRange },
        workDay: { workspaceId },
      },
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

async function byUser(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    let { userId, from, to } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange(tz))
    const completedAtRange = buildCompletedAtWhere(from, to, tz)

    const where = {
      status: 'COMPLETED',
      startedAt: { not: null },
      completedAt: { not: null, ...completedAtRange },
      workDay: { workspaceId },
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

async function byUserSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    let { from, to } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange(tz))
    const completedAtRange = buildCompletedAtWhere(from, to, tz)

    const tasks = await prisma.task.findMany({
      where: {
        status: 'COMPLETED',
        startedAt: { not: null },
        completedAt: { not: null, ...completedAtRange },
        workDay: { workspaceId },
      },
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

async function mine(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    let { from, to } = req.query
    if (!from && !to) ({ from, to } = defaultDateRange(tz))
    const completedAtRange = buildCompletedAtWhere(from, to, tz)

    const tasks = await prisma.task.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        startedAt: { not: null },
        completedAt: { not: null, ...completedAtRange },
        workDay: { workspaceId },
      },
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
