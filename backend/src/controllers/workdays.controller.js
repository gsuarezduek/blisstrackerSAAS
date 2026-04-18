const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')

const taskInclude = {
  project: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
}

async function getOrCreateToday(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const date = todayString(tz)

    let workDay = await prisma.workDay.findUnique({
      where: { userId_workspaceId_date: { userId, workspaceId, date } },
      include: {
        tasks: { include: taskInclude, orderBy: { createdAt: 'desc' } },
      },
    })

    if (!workDay) {
      workDay = await prisma.workDay.create({
        data: { userId, workspaceId, date },
        include: {
          tasks: { include: taskInclude, orderBy: { createdAt: 'desc' } },
        },
      })
    } else if (workDay.endedAt) {
      workDay = await prisma.workDay.update({
        where: { userId_workspaceId_date: { userId, workspaceId, date } },
        data: { endedAt: null, startedAt: new Date() },
        include: {
          tasks: { include: taskInclude, orderBy: { createdAt: 'desc' } },
        },
      })
    }

    // Tareas de días anteriores aún activas en este workspace
    const carryOverTasks = await prisma.task.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] },
        workDay: { date: { lt: date }, workspaceId },
      },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    })

    res.json({ ...workDay, carryOverTasks })
  } catch (err) { next(err) }
}

async function finish(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const date = todayString(tz)

    const workDay = await prisma.workDay.update({
      where: { userId_workspaceId_date: { userId, workspaceId, date } },
      data: { endedAt: new Date() },
    })
    res.json(workDay)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Jornada no encontrada' })
    next(err)
  }
}

module.exports = { getOrCreateToday, finish }
