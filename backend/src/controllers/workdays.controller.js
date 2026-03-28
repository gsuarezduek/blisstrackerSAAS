const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function todayString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

async function getOrCreateToday(req, res, next) {
  try {
    const userId = req.user.id
    const date = todayString()

    let workDay = await prisma.workDay.findUnique({
      where: { userId_date: { userId, date } },
      include: {
        tasks: {
          include: { project: true, createdBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!workDay) {
      workDay = await prisma.workDay.create({
        data: { userId, date },
        include: {
          tasks: {
            include: { project: true, createdBy: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
    } else if (workDay.endedAt) {
      // Reopen workday if user logs back in after finishing
      workDay = await prisma.workDay.update({
        where: { userId_date: { userId, date } },
        data: { endedAt: null, startedAt: new Date() },
        include: {
          tasks: {
            include: { project: true, createdBy: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
    }

    // Tareas pendientes/pausadas/en curso de días anteriores
    const carryOverTasks = await prisma.task.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] },
        workDay: { date: { lt: date } },
      },
      include: { project: true, createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })

    res.json({ ...workDay, carryOverTasks })
  } catch (err) { next(err) }
}

async function finish(req, res, next) {
  try {
    const userId = req.user.id
    const date = todayString()

    const workDay = await prisma.workDay.update({
      where: { userId_date: { userId, date } },
      data: { endedAt: new Date() },
    })
    res.json(workDay)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Jornada no encontrada' })
    next(err)
  }
}

module.exports = { getOrCreateToday, finish }
