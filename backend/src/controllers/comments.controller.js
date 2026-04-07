const prisma = require('../lib/prisma')

async function getTaskWithAccess(taskId, userId, isAdmin) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true },
  })
  if (!task) return null

  if (!isAdmin) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId } },
    })
    if (!member) return null
  }

  return task
}

async function listComments(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const userId = req.user.id

    const task = await getTaskWithAccess(taskId, userId, req.user.isAdmin)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    })

    res.json(comments)
  } catch (err) { next(err) }
}

async function addComment(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const userId = req.user.id
    const { text } = req.body

    if (!text?.trim()) return res.status(400).json({ error: 'El comentario no puede estar vacío' })

    const task = await getTaskWithAccess(taskId, userId, req.user.isAdmin)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const comment = await prisma.taskComment.create({
      data: { taskId, userId, content: text.trim() },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    })

    // Notificar al dueño de la tarea y a comentadores previos únicos
    const prevCommenters = await prisma.taskComment.findMany({
      where: { taskId, userId: { not: userId }, id: { not: comment.id } },
      select: { userId: true },
      distinct: ['userId'],
    })

    const toNotify = new Set()
    if (task.userId !== userId) toNotify.add(task.userId)
    for (const c of prevCommenters) toNotify.add(c.userId)

    if (toNotify.size > 0) {
      const desc = task.description.length > 60
        ? task.description.slice(0, 57) + '...'
        : task.description
      await prisma.notification.createMany({
        data: Array.from(toNotify).map(uid => ({
          userId:    uid,
          actorId:   userId,
          taskId:    task.id,
          projectId: task.projectId,
          type:      'TASK_COMMENT',
          message:   `comentó en "${desc}"`,
        })),
      })
    }

    res.status(201).json(comment)
  } catch (err) { next(err) }
}

module.exports = { listComments, addComment }
