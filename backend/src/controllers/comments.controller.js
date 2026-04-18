const prisma = require('../lib/prisma')

function isAdmin(req) {
  const m = req.workspaceMember
  return req.user?.isSuperAdmin || m?.role === 'admin' || m?.role === 'owner'
}

async function getTaskWithAccess(taskId, userId, admin) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: true },
  })
  if (!task) return null
  if (!admin) {
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
    const userId = req.user.userId
    const task = await getTaskWithAccess(taskId, userId, isAdmin(req))
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    })
    res.json(comments)
  } catch (err) { next(err) }
}

function parseMentions(text) {
  const mentioned = new Set()
  const regex = /@([A-Za-záéíóúÁÉÍÓÚñÑüÜ]+(?:\s+[A-Za-záéíóúÁÉÍÓÚñÑüÜ]+)?)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    mentioned.add(match[1].toLowerCase())
  }
  return mentioned
}

async function addComment(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const { text } = req.body

    if (!text?.trim()) return res.status(400).json({ error: 'El comentario no puede estar vacío' })

    const task = await getTaskWithAccess(taskId, userId, isAdmin(req))
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const comment = await prisma.taskComment.create({
      data: { taskId, userId, content: text.trim() },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    })

    const desc = task.description.length > 60 ? task.description.slice(0, 57) + '...' : task.description

    const mentionedNames = parseMentions(text)
    const mentionedUserIds = new Set()

    if (mentionedNames.size > 0) {
      const projectMembers = await prisma.projectMember.findMany({
        where: { projectId: task.projectId },
        include: { user: { select: { id: true, name: true } } },
      })
      for (const pm of projectMembers) {
        if (pm.user.id === userId) continue
        const fullName  = pm.user.name.toLowerCase()
        const firstName = pm.user.name.split(' ')[0].toLowerCase()
        const matched = [...mentionedNames].some(captured =>
          captured === fullName ||
          captured === firstName ||
          captured.startsWith(fullName + ' ') ||
          captured.startsWith(firstName + ' ')
        )
        if (matched) mentionedUserIds.add(pm.user.id)
      }
    }

    if (mentionedUserIds.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(mentionedUserIds).map(uid => ({
          userId:      uid,
          actorId:     userId,
          taskId:      task.id,
          projectId:   task.projectId,
          workspaceId,
          type:        'TASK_MENTION',
          message:     `te mencionó en "${desc}"`,
        })),
      })
    }

    const prevCommenters = await prisma.taskComment.findMany({
      where: { taskId, userId: { not: userId }, id: { not: comment.id } },
      select: { userId: true },
      distinct: ['userId'],
    })

    const toNotify = new Set()
    if (task.userId !== userId && !mentionedUserIds.has(task.userId)) toNotify.add(task.userId)
    for (const c of prevCommenters) {
      if (!mentionedUserIds.has(c.userId)) toNotify.add(c.userId)
    }

    if (toNotify.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(toNotify).map(uid => ({
          userId:      uid,
          actorId:     userId,
          taskId:      task.id,
          projectId:   task.projectId,
          workspaceId,
          type:        'TASK_COMMENT',
          message:     `comentó en "${desc}"`,
        })),
      })
    }

    res.status(201).json(comment)
  } catch (err) { next(err) }
}

module.exports = { listComments, addComment }
