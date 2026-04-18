const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')

async function snapshot(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const date = todayString(tz)

    const workDays = await prisma.workDay.findMany({
      where: { date, workspaceId },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        tasks: {
          include: { project: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    })

    // Obtener teamRole para cada usuario desde WorkspaceMember
    const memberMap = {}
    if (workDays.length > 0) {
      const userIds = workDays.map(wd => wd.userId)
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId, userId: { in: userIds } },
        select: { userId: true, teamRole: true },
      })
      for (const m of members) memberMap[m.userId] = m.teamRole
    }

    const result = workDays.map(wd => {
      const inProgressTask = wd.tasks.find(t => t.status === 'IN_PROGRESS') ?? null
      const completedCount = wd.tasks.filter(t => t.status === 'COMPLETED').length
      const totalMins = wd.tasks
        .filter(t => t.status === 'COMPLETED' && t.startedAt && t.completedAt)
        .reduce((s, t) => s + Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000), 0)

      return {
        user: { ...wd.user, role: memberMap[wd.userId] ?? '' },
        workDay: { id: wd.id, startedAt: wd.startedAt, endedAt: wd.endedAt },
        currentTask: inProgressTask,
        stats: {
          total: wd.tasks.length,
          completed: completedCount,
          pending: wd.tasks.filter(t => t.status === 'PENDING').length,
          blocked: wd.tasks.filter(t => t.status === 'BLOCKED').length,
          totalMinutes: totalMins,
        },
      }
    })

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

    res.json({ entries: result, notStarted })
  } catch (err) { next(err) }
}

module.exports = { snapshot }
