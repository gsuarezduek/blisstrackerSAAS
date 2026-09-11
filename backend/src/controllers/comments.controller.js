const prisma = require('../lib/prisma')
const { resolveMentions } = require('../lib/mentions')
const { sendPushToUser } = require('../services/pushNotification.service')

// Mismo criterio "equipo = etiqueta, no barrera" que el resto del modelo de acceso a
// proyectos (ver ProjectAccess/Links/lecturas): cualquier miembro activo del workspace
// puede ver y comentar cualquier tarea, sin necesidad de ser ProjectMember. Solo se scopea
// por workspace (evita leer/comentar tareas de otro workspace vía ID).
async function getTaskWithAccess(taskId, workspaceId) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workDay: { workspaceId } },
    include: { project: true },
  })
  return task
}

const COMMENT_INCLUDE = {
  user: { select: { id: true, name: true, avatar: true } },
  reactions: { orderBy: { createdAt: 'asc' }, select: { id: true, emoji: true, userId: true, user: { select: { name: true } } } },
}

async function listComments(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const task = await getTaskWithAccess(taskId, req.workspace.id)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    })
    res.json(comments)
  } catch (err) { next(err) }
}

async function addComment(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const { text } = req.body

    if (!text?.trim()) return res.status(400).json({ error: 'El comentario no puede estar vacío' })

    const task = await getTaskWithAccess(taskId, workspaceId)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const comment = await prisma.taskComment.create({
      data: { taskId, userId, content: text.trim() },
      include: COMMENT_INCLUDE,
    })

    const desc = task.description.length > 60 ? task.description.slice(0, 57) + '...' : task.description

    // Contra miembros activos del workspace, no solo del equipo del proyecto — cualquiera
    // puede ser mencionado y notificado en un comentario, mismo criterio que la mención
    // en la descripción de la tarea (ver resolveTaskMentions en tasks.controller.js).
    let mentionedUserIds = new Set()

    if (text.includes('@')) {
      const wsMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId, active: true },
        include: { user: { select: { id: true, name: true } } },
      })
      mentionedUserIds = resolveMentions(text, wsMembers.map(m => m.user), userId)
    }

    if (mentionedUserIds.size > 0) {
      const mentionMessage = `te mencionó en "${desc}"`
      await prisma.notification.createMany({
        data: Array.from(mentionedUserIds).map(uid => ({
          userId:      uid,
          actorId:     userId,
          taskId:      task.id,
          projectId:   task.projectId,
          workspaceId,
          type:        'TASK_MENTION',
          message:     mentionMessage,
        })),
      })
      for (const uid of mentionedUserIds) {
        sendPushToUser({ userId: uid, workspaceId, type: 'TASK_MENTION', taskId: task.id, message: `${req.user.name} ${mentionMessage}` }).catch(() => {})
      }
    }

    const prevCommenters = await prisma.taskComment.findMany({
      where: { taskId, userId: { not: userId }, id: { not: comment.id } },
      select: { userId: true },
      distinct: ['userId'],
    })

    // Seguidores de la tarea (sección Seguimiento): reciben aviso de comentario.
    const followers = await prisma.taskFollow.findMany({
      where: { taskId, userId: { not: userId } },
      select: { userId: true },
    })

    const toNotify = new Set()
    if (task.userId !== userId && !mentionedUserIds.has(task.userId)) toNotify.add(task.userId)
    for (const c of prevCommenters) {
      if (!mentionedUserIds.has(c.userId)) toNotify.add(c.userId)
    }
    for (const f of followers) {
      if (!mentionedUserIds.has(f.userId)) toNotify.add(f.userId)
    }

    if (toNotify.size > 0) {
      const commentMessage = `comentó en "${desc}"`
      await prisma.notification.createMany({
        data: Array.from(toNotify).map(uid => ({
          userId:      uid,
          actorId:     userId,
          taskId:      task.id,
          projectId:   task.projectId,
          workspaceId,
          type:        'TASK_COMMENT',
          message:     commentMessage,
        })),
      })
      for (const uid of toNotify) {
        sendPushToUser({ userId: uid, workspaceId, type: 'TASK_COMMENT', taskId: task.id, message: `${req.user.name} ${commentMessage}` }).catch(() => {})
      }
    }

    res.status(201).json(comment)
  } catch (err) { next(err) }
}

// Reacciones con emoji sobre un comentario — mismo criterio que las reacciones del chat
// interno (chat.controller.js toggleReaction): abierto a cualquier miembro con acceso a
// la tarea (no solo el autor del comentario), sin catálogo fijo, toggle por
// (comentario, usuario, emoji).
async function toggleReaction(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const commentId = Number(req.params.commentId)
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const emoji = (req.body?.emoji || '').trim()
    if (!emoji || emoji.length > 32) return res.status(400).json({ error: 'Emoji inválido' })

    const task = await getTaskWithAccess(taskId, workspaceId)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const comment = await prisma.taskComment.findFirst({ where: { id: commentId, taskId } })
    if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' })

    const existingReaction = await prisma.taskCommentReaction.findUnique({
      where: { commentId_userId_emoji: { commentId, userId, emoji } },
    })
    if (existingReaction) {
      await prisma.taskCommentReaction.delete({ where: { id: existingReaction.id } })
    } else {
      await prisma.taskCommentReaction.create({ data: { workspaceId, commentId, userId, emoji } })
    }

    const updated = await prisma.taskComment.findUnique({ where: { id: commentId }, include: COMMENT_INCLUDE })
    res.json(updated)
  } catch (err) { next(err) }
}

module.exports = { listComments, addComment, toggleReaction }
