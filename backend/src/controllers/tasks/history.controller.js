const prisma = require('../../lib/prisma')

async function completedHistory(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const skip   = Math.max(0, Number(req.query.skip) || 0)
    const take   = 10
    const { before } = req.query

    const where = { userId, status: 'COMPLETED', workDay: { workspaceId } }
    if (before) where.workDay = { ...where.workDay, date: { lt: before } }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        workDay: { select: { date: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { completedAt: 'desc' },
      skip,
      take: take + 1,
    })

    const hasMore = tasks.length > take
    res.json({ tasks: tasks.slice(0, take), hasMore })
  } catch (err) { next(err) }
}

module.exports = { completedHistory }
