const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')
const { taskWorkedMinutes } = require('../lib/taskTime')

async function snapshot(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const tz = req.workspace.timezone
    const date = todayString(tz)

    const workDays = await prisma.workDay.findMany({
      where: { date, workspaceId },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        tasks: {
          // Excluir tareas futuras programadas (scheduledFor posterior a hoy)
          where: { OR: [{ scheduledFor: null }, { scheduledFor: { lte: date } }] },
          include: { project: true, sessions: { select: { startedAt: true, endedAt: true } } },
          orderBy: { updatedAt: 'desc' },
        },
      },
    })

    // Obtener teamRole para cada usuario desde WorkspaceMember
    const memberMap = {}
    const carryOverByUser = {}
    if (workDays.length > 0) {
      const userIds = workDays.map(wd => wd.userId)
      const [members, carryOverTasks] = await Promise.all([
        prisma.workspaceMember.findMany({
          where: { workspaceId, userId: { in: userIds } },
          select: { userId: true, teamRole: true },
        }),
        // Tareas de días anteriores aún activas (carryover): el realtime
        // controller solo ve workDay.tasks de hoy, por lo que sin esta
        // consulta las tareas iniciadas ayer y aún en curso quedan invisibles.
        prisma.task.findMany({
          where: {
            userId: { in: userIds },
            status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] },
            workDay: { date: { lt: date }, workspaceId },
            OR: [{ scheduledFor: null }, { scheduledFor: { lte: date } }],
          },
          include: { project: true, sessions: { select: { startedAt: true, endedAt: true } } },
        }),
      ])
      for (const m of members) memberMap[m.userId] = m.teamRole
      for (const t of carryOverTasks) {
        if (!carryOverByUser[t.userId]) carryOverByUser[t.userId] = []
        carryOverByUser[t.userId].push(t)
      }
    }

    let result = workDays.map(wd => {
      const carryOver = carryOverByUser[wd.userId] ?? []
      const allTasks  = [...wd.tasks, ...carryOver]
      const inProgressTask = allTasks.find(t => t.status === 'IN_PROGRESS') ?? null
      const completedCount = wd.tasks.filter(t => t.status === 'COMPLETED').length
      const totalMins = wd.tasks
        .filter(t => t.status === 'COMPLETED')
        .reduce((s, t) => s + taskWorkedMinutes(t), 0)

      return {
        user: { ...wd.user, role: memberMap[wd.userId] ?? '' },
        workDay: { id: wd.id, startedAt: wd.startedAt, endedAt: wd.endedAt },
        currentTask: inProgressTask,
        stats: {
          total: allTasks.length,
          completed: completedCount,
          pending: allTasks.filter(t => t.status === 'PENDING').length,
          blocked: allTasks.filter(t => t.status === 'BLOCKED').length,
          totalMinutes: totalMins,
        },
      }
    })

    // Marca en currentTask si el usuario actual ya la sigue, para poder
    // seguir/dejar de seguir directo desde la tarjeta sin abrir el modal.
    const currentTaskIds = result.filter(e => e.currentTask).map(e => e.currentTask.id)
    if (currentTaskIds.length > 0) {
      const follows = await prisma.taskFollow.findMany({
        where: { userId, taskId: { in: currentTaskIds } },
        select: { taskId: true },
      })
      const followedIds = new Set(follows.map(f => f.taskId))
      result = result.map(e => e.currentTask
        ? { ...e, currentTask: { ...e.currentTask, following: followedIds.has(e.currentTask.id) } }
        : e
      )
    }

    result.sort((a, b) => {
      const aTime = a.currentTask?.startedAt ? new Date(a.currentTask.startedAt).getTime() : null
      const bTime = b.currentTask?.startedAt ? new Date(b.currentTask.startedAt).getTime() : null
      if (aTime && bTime) return bTime - aTime
      if (aTime) return -1
      if (bTime) return 1
      return new Date(a.workDay.startedAt) - new Date(b.workDay.startedAt)
    })

    const workedIds = new Set(workDays.map(wd => wd.userId))
    const allMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId, active: true },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { user: { name: 'asc' } },
    })
    const notStarted = allMembers
      .filter(m => !workedIds.has(m.userId))
      .map(m => ({ ...m.user, role: m.teamRole }))

    // Personas de licencia hoy (aprobadas que se solapan con la fecha actual).
    // Vista de todo el equipo → NO se expone el tipo de licencia (puede ser sensible),
    // solo quién está y hasta cuándo.
    const leaveRows = await prisma.vacationRequest.findMany({
      where: {
        workspaceId,
        status: 'approved',
        startDate: { lte: date },
        endDate:   { gte: date },
      },
      select: {
        endDate: true,
        user: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { endDate: 'asc' },
    })
    const onLeave = leaveRows.map(l => ({
      id: l.user.id, name: l.user.name, avatar: l.user.avatar, endDate: l.endDate,
    }))

    res.json({ entries: result, notStarted, onLeave })
  } catch (err) { next(err) }
}

module.exports = { snapshot }
