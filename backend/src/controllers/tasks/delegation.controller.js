const prisma = require('../../lib/prisma')
const { todayString } = require('../../utils/dates')

async function delegated(req, res, next) {
  try {
    const createdById = req.user.userId
    const workspaceId = req.workspace.id
    const today = todayString(req.workspace.timezone)

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const tasks = await prisma.task.findMany({
      where: {
        createdById,
        userId: { not: createdById },
        dismissedByCreator: false,
        workDay: { workspaceId },
        // Excluir tareas futuras (aún no materializadas para el destinatario)
        AND: [
          { OR: [{ scheduledFor: null }, { scheduledFor: { lte: today } }] },
          { OR: [
            { status: { not: 'COMPLETED' } },
            { status: 'COMPLETED', completedAt: { gte: weekAgo } },
          ] },
        ],
      },
      include: {
        project: true,
        user: { select: { id: true, name: true, avatar: true } },
        _count: { select: { comments: true } },
      },
      orderBy: [{ project: { name: 'asc' } }, { createdAt: 'desc' }],
    })

    res.json(tasks)
  } catch (err) { next(err) }
}

async function dismissDelegated(req, res, next) {
  try {
    const createdById = req.user.userId
    const workspaceId = req.workspace.id
    const { status } = req.query  // opcional: filtra por estado

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const where = {
      createdById,
      userId: { not: createdById },
      dismissedByCreator: false,
      workDay: { workspaceId },
      OR: [
        { status: { not: 'COMPLETED' } },
        { status: 'COMPLETED', completedAt: { gte: weekAgo } },
      ],
    }
    if (status) where.status = status

    const { count } = await prisma.task.updateMany({
      where,
      data: { dismissedByCreator: true },
    })

    res.json({ dismissed: count })
  } catch (err) { next(err) }
}

// Quita del dashboard una sola tarea delegada puntual (espejo individual de dismissDelegated).
async function dismissDelegatedOne(req, res, next) {
  try {
    const createdById = req.user.userId
    const taskId = Number(req.params.id)

    const { count } = await prisma.task.updateMany({
      where: { id: taskId, createdById, userId: { not: createdById } },
      data: { dismissedByCreator: true },
    })
    if (count === 0) return res.status(404).json({ error: 'Tarea no encontrada' })
    res.json({ dismissed: true })
  } catch (err) { next(err) }
}

module.exports = { delegated, dismissDelegated, dismissDelegatedOne }
