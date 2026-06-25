const prisma = require('../lib/prisma')

function isAdmin(req) {
  const m = req.workspaceMember
  return req.user?.isSuperAdmin || m?.role === 'admin' || m?.role === 'owner'
}

async function getTaskWithAccess(taskId, userId, admin, workspaceId) {
  // Scopear por workspace: evita que un admin lea/comente tareas de otros workspaces vía ID.
  const task = await prisma.task.findFirst({
    where: { id: taskId, workDay: { workspaceId } },
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
    const task = await getTaskWithAccess(taskId, userId, isAdmin(req), req.workspace.id)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const comments = await prisma.taskComment.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    })
    res.json(comments)
  } catch (err) { next(err) }
}

// Resuelve las @menciones de un comentario contra una lista de miembros.
// Matchea por nombre completo (preferido) o por primer nombre, tolerando
// nombres de cualquier cantidad de palabras (el autocompletado inserta el
// nombre completo, ej. "@María José García") y respetando límites de palabra
// para no confundir "@Ana" con "@Analía". Excluye al autor del comentario.
function resolveMentions(text, members, authorId) {
  const haystack = text.toLowerCase()
  const isLetter = ch => ch !== undefined && /[a-záéíóúñü]/.test(ch)
  const mentioned = new Set()

  for (const m of members) {
    if (m.id === authorId || !m.name) continue
    const full  = m.name.toLowerCase().trim().replace(/\s+/g, ' ')
    const first = full.split(' ')[0]
    // Probar nombre completo primero, luego primer nombre como fallback.
    const hit = [full, first].some(form => {
      if (!form) return false
      let from = 0
      for (;;) {
        const idx = haystack.indexOf('@' + form, from)
        if (idx === -1) return false
        // El caracter siguiente no debe ser otra letra (límite de palabra).
        if (!isLetter(haystack[idx + 1 + form.length])) return true
        from = idx + 1
      }
    })
    if (hit) mentioned.add(m.id)
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

    const task = await getTaskWithAccess(taskId, userId, isAdmin(req), workspaceId)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const comment = await prisma.taskComment.create({
      data: { taskId, userId, content: text.trim() },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    })

    const desc = task.description.length > 60 ? task.description.slice(0, 57) + '...' : task.description

    let mentionedUserIds = new Set()

    if (text.includes('@')) {
      const projectMembers = await prisma.projectMember.findMany({
        where: { projectId: task.projectId },
        include: { user: { select: { id: true, name: true } } },
      })
      mentionedUserIds = resolveMentions(text, projectMembers.map(pm => pm.user), userId)
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
