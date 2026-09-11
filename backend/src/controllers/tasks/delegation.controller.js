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

    // Avisos de tareas delegadas que otro borró (ver lifecycle.controller#remove) —
    // se muestran como filas de pseudo-estado 'DELETED' en la misma lista, mismo
    // criterio de ventana de 7 días que las completadas de arriba.
    const deletedNotices = await prisma.deletedTaskNotice.findMany({
      where: { createdById, workspaceId, dismissed: false, deletedAt: { gte: weekAgo } },
      include: {
        project: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, avatar: true } },
        deletedBy: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: [{ project: { name: 'asc' } }, { deletedAt: 'desc' }],
    })
    const noticeRows = deletedNotices.map(n => ({
      id: n.id,
      __deletedNotice: true,
      status: 'DELETED',
      description: n.description,
      project: n.project,
      user: n.user,
      deletedBy: n.deletedBy,
      deletedAt: n.deletedAt,
      _count: { comments: 0 },
    }))

    res.json([...tasks, ...noticeRows])
  } catch (err) { next(err) }
}

async function dismissDelegated(req, res, next) {
  try {
    const createdById = req.user.userId
    const workspaceId = req.workspace.id
    const { status } = req.query  // opcional: filtra por estado ('DELETED' = solo avisos)

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    let taskCount = 0
    if (status !== 'DELETED') {
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
      const r = await prisma.task.updateMany({ where, data: { dismissedByCreator: true } })
      taskCount = r.count
    }

    // Sin filtro (ALL) o filtrando específicamente por los avisos: limpiar también
    // DeletedTaskNotice — "Borrar todas" debe incluir los avisos de eliminación.
    let noticeCount = 0
    if (!status || status === 'DELETED') {
      const r = await prisma.deletedTaskNotice.updateMany({
        where: { createdById, workspaceId, dismissed: false, deletedAt: { gte: weekAgo } },
        data: { dismissed: true },
      })
      noticeCount = r.count
    }

    res.json({ dismissed: taskCount + noticeCount })
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

// Descarta un aviso de tarea eliminada (espejo de dismissDelegatedOne, pero sobre
// DeletedTaskNotice en vez de Task).
async function dismissDeletedNotice(req, res, next) {
  try {
    const createdById = req.user.userId
    const noticeId = Number(req.params.id)

    const { count } = await prisma.deletedTaskNotice.updateMany({
      where: { id: noticeId, createdById, workspaceId: req.workspace.id },
      data: { dismissed: true },
    })
    if (count === 0) return res.status(404).json({ error: 'Aviso no encontrado' })
    res.json({ dismissed: true })
  } catch (err) { next(err) }
}

module.exports = { delegated, dismissDelegated, dismissDelegatedOne, dismissDeletedNotice }
