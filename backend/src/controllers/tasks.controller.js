const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')

const taskInclude = {
  project: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
}

async function assertNoActiveTask(userId) {
  const active = await prisma.task.findFirst({ where: { userId, status: 'IN_PROGRESS' } })
  if (active) throw Object.assign(new Error('Ya tenés una tarea en curso. Pausala o completala primero.'), { status: 409 })
}

// Converts a Prisma P2002 on the active-task index into a clean 409
function handleActiveTaskConflict(err) {
  if (err.code === 'P2002' && err.meta?.target?.includes?.('one_active_task_per_user')) {
    return Object.assign(new Error('Ya tenés una tarea en curso. Pausala o completala primero.'), { status: 409 })
  }
  return err
}

async function create(req, res, next) {
  try {
    const requesterId = req.user.id
    const isAdmin = req.user.isAdmin
    const { description, projectId, targetUserId } = req.body
    if (!description || !projectId) {
      return res.status(400).json({ error: 'Descripción y proyecto requeridos' })
    }

    const userId = targetUserId ? Number(targetUserId) : requesterId

    // If assigning to someone else, verify access
    if (userId !== requesterId) {
      if (!isAdmin) {
        // Non-admin: requester must be a member of the project
        const requesterMember = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: Number(projectId), userId: requesterId } },
        })
        if (!requesterMember) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

        // Non-admin: target must also be a member
        const targetMember = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: Number(projectId), userId } },
        })
        if (!targetMember) return res.status(400).json({ error: 'El usuario no pertenece a este proyecto' })
      }
      // Admins can assign to anyone in any project — no membership check needed
    }

    const date = todayString()
    let workDay = await prisma.workDay.findUnique({
      where: { userId_date: { userId, date } },
    })
    if (!workDay) {
      workDay = await prisma.workDay.create({ data: { userId, date } })
    }

    const task = await prisma.task.create({
      data: {
        description,
        projectId: Number(projectId),
        userId,
        workDayId: workDay.id,
        createdById: userId !== requesterId ? requesterId : null,
      },
      include: taskInclude,
    })

    // Notify the assignee if someone else created the task
    if (userId !== requesterId) {
      const desc = description.length > 60 ? description.slice(0, 57) + '...' : description
      await prisma.notification.create({
        data: {
          userId:    userId,
          actorId:   requesterId,
          taskId:    task.id,
          projectId: Number(projectId),
          type:      'TASK_MENTION',
          message:   `te asignó una tarea: "${desc}"`,
        },
      })
    }

    res.status(201).json(task)
  } catch (err) { next(err) }
}

async function startTask(req, res, next) {
  try {
    const userId = req.user.id
    await assertNoActiveTask(userId)

    const existing = await prisma.task.findUnique({ where: { id: Number(req.params.id) } })
    if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (existing.isBacklog) return res.status(400).json({ error: 'Agregá la tarea al día primero para iniciarla.' })

    const now = new Date()
    const taskId = Number(req.params.id)
    const [task] = await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId, userId },
        data: { status: 'IN_PROGRESS', startedAt: now },
        include: taskInclude,
      }),
      prisma.taskSession.create({ data: { taskId, startedAt: now } }),
    ])
    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(handleActiveTaskConflict(err))
  }
}

async function pauseTask(req, res, next) {
  try {
    const now = new Date()
    const taskId = Number(req.params.id)
    const [task] = await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId, userId: req.user.id },
        data: { status: 'PAUSED', pausedAt: now },
        include: taskInclude,
      }),
      prisma.taskSession.updateMany({
        where: { taskId, endedAt: null },
        data: { endedAt: now },
      }),
    ])
    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
}

async function resumeTask(req, res, next) {
  try {
    const userId = req.user.id
    await assertNoActiveTask(userId)

    const current = await prisma.task.findUnique({
      where: { id: Number(req.params.id) },
    })
    if (!current || current.userId !== userId) {
      return res.status(404).json({ error: 'Tarea no encontrada' })
    }
    if (current.isBacklog) return res.status(400).json({ error: 'Agregá la tarea al día primero para reanudarla.' })

    // Accumulate the time spent paused
    const now        = new Date()
    const pausedMs   = current.pausedAt ? now.getTime() - new Date(current.pausedAt).getTime() : 0
    const addedMins  = Math.round(pausedMs / 60000)
    const taskId     = Number(req.params.id)

    const [task] = await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId },
        data: {
          status:        'IN_PROGRESS',
          pausedAt:      null,
          pausedMinutes: { increment: addedMins },
        },
        include: taskInclude,
      }),
      prisma.taskSession.create({ data: { taskId, startedAt: now } }),
    ])
    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(handleActiveTaskConflict(err))
  }
}

async function completeTask(req, res, next) {
  try {
    const userId = req.user.id
    const now    = new Date()
    const taskId = Number(req.params.id)
    const [task] = await prisma.$transaction([
      prisma.task.update({
        where:   { id: taskId, userId },
        data:    { status: 'COMPLETED', completedAt: now, pausedAt: null },
        include: taskInclude,
      }),
      prisma.taskSession.updateMany({
        where: { taskId, endedAt: null },
        data:  { endedAt: now },
      }),
    ])

    // Notify all other members of the same project
    const members = await prisma.projectMember.findMany({
      where: { projectId: task.projectId, userId: { not: userId } },
      select: { userId: true },
    })

    if (members.length > 0) {
      const desc = task.description.length > 60
        ? task.description.slice(0, 57) + '...'
        : task.description
      await prisma.notification.createMany({
        data: members.map(m => ({
          userId:    m.userId,
          actorId:   userId,
          taskId:    task.id,
          projectId: task.projectId,
          type:      'COMPLETED',
          message:   `completó "${desc}"`,
        })),
      })
    }

    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
}

async function blockTask(req, res, next) {
  try {
    const userId = req.user.id
    const { reason } = req.body
    if (!reason?.trim()) return res.status(400).json({ error: 'La razón del bloqueo es requerida' })
    const now    = new Date()
    const taskId = Number(req.params.id)
    const [task] = await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId, userId },
        data: { status: 'BLOCKED', blockedReason: reason.trim(), pausedAt: now },
        include: taskInclude,
      }),
      prisma.taskSession.updateMany({
        where: { taskId, endedAt: null },
        data:  { endedAt: now },
      }),
    ])

    // Notificar a todos los miembros del proyecto
    const members = await prisma.projectMember.findMany({
      where: { projectId: task.projectId, userId: { not: userId } },
      select: { userId: true },
    })
    if (members.length > 0) {
      const desc = task.description.length > 60
        ? task.description.slice(0, 57) + '...'
        : task.description
      await prisma.notification.createMany({
        data: members.map(m => ({
          userId:    m.userId,
          actorId:   userId,
          taskId:    task.id,
          projectId: task.projectId,
          type:      'BLOCKED',
          message:   `bloqueó "${desc}"`,
        })),
      })
    }

    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
}

async function unblockTask(req, res, next) {
  try {
    const userId = req.user.id
    await assertNoActiveTask(userId)

    const current = await prisma.task.findUnique({
      where: { id: Number(req.params.id) },
    })
    if (!current || current.userId !== userId) {
      return res.status(404).json({ error: 'Tarea no encontrada' })
    }
    if (current.isBacklog) return res.status(400).json({ error: 'Agregá la tarea al día primero para desbloquearla.' })

    // Accumulate time spent blocked so it doesn't count as work time
    const now        = new Date()
    const blockedMs  = current.pausedAt ? now.getTime() - new Date(current.pausedAt).getTime() : 0
    const addedMins  = Math.round(blockedMs / 60000)
    const taskId     = Number(req.params.id)

    const [task] = await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId },
        data: {
          status:        'IN_PROGRESS',
          blockedReason: null,
          pausedAt:      null,
          pausedMinutes: { increment: addedMins },
        },
        include: taskInclude,
      }),
      prisma.taskSession.create({ data: { taskId, startedAt: now } }),
    ])
    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(handleActiveTaskConflict(err))
  }
}

async function editTask(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { description } = req.body
    if (!description?.trim()) return res.status(400).json({ error: 'La descripción es requerida' })

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (!req.user.isAdmin && task.userId !== req.user.id) {
      return res.status(403).json({ error: 'No tenés permiso para editar esta tarea' })
    }

    const updated = await prisma.task.update({
      where: { id },
      data: { description: description.trim() },
      include: taskInclude,
    })
    res.json(updated)
  } catch (err) { next(err) }
}

async function remove(req, res, next) {
  try {
    await prisma.task.delete({ where: { id: Number(req.params.id), userId: req.user.id } })
    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
}

async function setDuration(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { minutes } = req.body
    if (!Number.isInteger(minutes) || minutes < 0) {
      return res.status(400).json({ error: 'minutes debe ser un entero mayor o igual a 0' })
    }
    const task = await prisma.task.findUnique({ where: { id } })
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (task.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Solo se puede editar la duración de tareas completadas' })
    }
    if (!req.user.isAdmin && task.userId !== req.user.id) {
      return res.status(403).json({ error: 'No tenés permiso para editar esta tarea' })
    }
    const updated = await prisma.task.update({
      where: { id },
      data: { minutesOverride: minutes },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

async function starTask(req, res, next) {
  try {
    const userId = req.user.id
    const id = Number(req.params.id)

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Tarea no encontrada' })

    const currentLevel = task.starred || 0
    const nextLevel = (currentLevel + 1) % 4  // ciclo: 0→1→2→3→0

    // Al agregar una nueva estrella (0→1), verificar límite de 3 destacadas
    if (nextLevel === 1) {
      const starredCount = await prisma.task.count({
        where: { userId, starred: { gt: 0 }, status: { not: 'COMPLETED' } },
      })
      if (starredCount >= 3) {
        return res.status(409).json({ error: 'Máximo 3 tareas destacadas. Quitá una primero.' })
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data: { starred: nextLevel },
      include: taskInclude,
    })
    res.json(updated)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
}

async function completedHistory(req, res, next) {
  try {
    const userId = req.user.id
    const skip   = Math.max(0, Number(req.query.skip) || 0)
    const take   = 10
    const { before } = req.query // YYYY-MM-DD — only return tasks from workdays before this date

    const where = { userId, status: 'COMPLETED' }
    if (before) where.workDay = { date: { lt: before } }

    const tasks = await prisma.task.findMany({
      where,
      include: { project: { select: { id: true, name: true } }, workDay: { select: { date: true } } },
      orderBy: { completedAt: 'desc' },
      skip,
      take: take + 1,
    })

    const hasMore = tasks.length > take
    res.json({ tasks: tasks.slice(0, take), hasMore })
  } catch (err) { next(err) }
}

async function addToToday(req, res, next) {
  try {
    const userId = req.user.id
    const taskId = Number(req.params.id)

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { workDay: true },
    })
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (task.status === 'COMPLETED') return res.status(400).json({ error: 'No podés mover al día una tarea completada.' })

    // If it's already in today's workday and not backlog, nothing to do
    const date = todayString()
    if (task.workDay.date === date && !task.isBacklog) {
      return res.status(400).json({ error: 'La tarea ya está en el día de hoy.' })
    }

    // If the task is IN_PROGRESS (carry-over edge case), check no OTHER active task
    if (task.status === 'IN_PROGRESS') {
      const otherActive = await prisma.task.findFirst({
        where: { userId, status: 'IN_PROGRESS', id: { not: taskId } },
      })
      if (otherActive) throw Object.assign(
        new Error('Ya tenés una tarea en curso. Pausala o completala primero.'),
        { status: 409 }
      )
    }

    // Get or create today's workday
    let workDay = await prisma.workDay.findUnique({ where: { userId_date: { userId, date } } })
    if (!workDay) {
      workDay = await prisma.workDay.create({ data: { userId, date } })
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { isBacklog: false, workDayId: workDay.id },
      include: taskInclude,
    })
    res.json(updated)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(handleActiveTaskConflict(err))
  }
}

async function moveToBacklog(req, res, next) {
  try {
    const userId = req.user.id
    const taskId = Number(req.params.id)

    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (task.status === 'IN_PROGRESS') return res.status(400).json({ error: 'Pausá la tarea en curso antes de moverla al Backlog.' })
    if (task.status === 'COMPLETED') return res.status(400).json({ error: 'No podés mover al Backlog una tarea completada.' })

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { isBacklog: true },
      include: taskInclude,
    })
    res.json(updated)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
}

async function delegated(req, res, next) {
  try {
    const createdById = req.user.id

    // Completadas hace más de 7 días se excluyen de la vista
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const tasks = await prisma.task.findMany({
      where: {
        createdById,
        userId: { not: createdById },
        OR: [
          { status: { not: 'COMPLETED' } },
          { status: 'COMPLETED', completedAt: { gte: weekAgo } },
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

module.exports = { create, startTask, pauseTask, resumeTask, completeTask, blockTask, unblockTask, remove, editTask, setDuration, starTask, addToToday, moveToBacklog, completedHistory, delegated, assertNoActiveTask }
