const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function todayString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

async function snapshot(req, res, next) {
  try {
    const date = todayString()

    // Get all active users with their today workday and tasks
    const workDays = await prisma.workDay.findMany({
      where: { date },
      include: {
        user: { select: { id: true, name: true, role: true } },
        tasks: {
          include: { project: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { startedAt: 'asc' },
    })

    const result = workDays.map(wd => {
      const inProgressTask = wd.tasks.find(t => t.status === 'IN_PROGRESS') ?? null
      const completedCount = wd.tasks.filter(t => t.status === 'COMPLETED').length
      const totalMins = wd.tasks
        .filter(t => t.status === 'COMPLETED' && t.startedAt && t.completedAt)
        .reduce((s, t) => s + Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000), 0)

      return {
        user: wd.user,
        workDay: {
          id: wd.id,
          startedAt: wd.startedAt,
          endedAt: wd.endedAt,
        },
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

    const workedIds = new Set(workDays.map(wd => wd.userId))
    const allUsers = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    })
    const notStarted = allUsers.filter(u => !workedIds.has(u.id))

    res.json({ entries: result, notStarted })
  } catch (err) { next(err) }
}

module.exports = { snapshot }
