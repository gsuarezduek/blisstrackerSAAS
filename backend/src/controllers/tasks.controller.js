const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')

const taskInclude = {
  project: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
}

async function assertNoActiveTask(userId, currentWorkspaceId) {
  const active = await prisma.task.findFirst({
    where: { userId, status: 'IN_PROGRESS' },
    include: { workDay: { select: { workspaceId: true } } },
  })
  if (!active) return

  const activeWorkspaceId = active.workDay?.workspaceId
  const isSameWorkspace = !currentWorkspaceId || activeWorkspaceId === currentWorkspaceId

  const msg = isSameWorkspace
    ? 'Ya tenés una tarea en curso. Pausala o completala primero.'
    : 'Tenés una tarea activa en otro workspace. Pausala o completala antes de iniciar una nueva.'

  throw Object.assign(new Error(msg), { status: 409, isOperational: true })
}

function handleActiveTaskConflict(err) {
  if (err.code === 'P2002' && err.meta?.target?.includes?.('one_active_task_per_user')) {
    return Object.assign(
      new Error('Ya tenés una tarea en curso. Pausala o completala primero.'),
      { status: 409, isOperational: true }
    )
  }
  return err
}

function isAdmin(req) {
  const m = req.workspaceMember
  return req.user?.isSuperAdmin || m?.role === 'admin' || m?.role === 'owner'
}

async function create(req, res, next) {
  try {
    const requesterId = req.user.userId
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const { description, projectId, targetUserId } = req.body
    if (!description || !projectId) {
      return res.status(400).json({ error: 'Descripción y proyecto requeridos' })
    }

    const userId = targetUserId ? Number(targetUserId) : requesterId

    if (userId !== requesterId) {
      if (!isAdmin(req)) {
        const requesterMember = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: Number(projectId), userId: requesterId } },
        })
        if (!requesterMember) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

        const targetMember = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: Number(projectId), userId } },
        })
        if (!targetMember) return res.status(400).json({ error: 'El usuario no pertenece a este proyecto' })
      }
    }

    const date = todayString(tz)
    const wdKey = { userId_workspaceId_date: { userId, workspaceId, date } }
    let workDay = await prisma.workDay.findUnique({ where: wdKey })
    if (!workDay) {
      try {
        workDay = await prisma.workDay.create({ data: { userId, workspaceId, date } })
      } catch (createErr) {
        if (createErr.code === 'P2002') {
          workDay = await prisma.workDay.findUnique({ where: wdKey })
        } else {
          throw createErr
        }
      }
    }

    if (!workDay) {
      return res.status(500).json({ error: 'No se pudo obtener la jornada laboral. Recargá la página.' })
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

    if (userId !== requesterId) {
      const desc = description.length > 60 ? description.slice(0, 57) + '...' : description
      await prisma.notification.create({
        data: {
          userId,
          actorId:    requesterId,
          taskId:     task.id,
          projectId:  Number(projectId),
          workspaceId,
          type:       'TASK_MENTION',
          message:    `te asignó una tarea: "${desc}"`,
        },
      })
    }

    res.status(201).json(task)
  } catch (err) { next(err) }
}

async function startTask(req, res, next) {
  try {
    const userId = req.user.userId
    await assertNoActiveTask(userId, req.workspace?.id)

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
        where: { id: taskId, userId: req.user.userId },
        data: { status: 'PAUSED', pausedAt: now },
        include: taskInclude,
      }),
      prisma.taskSession.updateMany({ where: { taskId, endedAt: null }, data: { endedAt: now } }),
    ])
    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
}

async function resumeTask(req, res, next) {
  try {
    const userId = req.user.userId
    await assertNoActiveTask(userId, req.workspace?.id)

    const current = await prisma.task.findUnique({ where: { id: Number(req.params.id) } })
    if (!current || current.userId !== userId) {
      return res.status(404).json({ error: 'Tarea no encontrada' })
    }
    if (current.isBacklog) return res.status(400).json({ error: 'Agregá la tarea al día primero para reanudarla.' })

    const now       = new Date()
    const pausedMs  = current.pausedAt ? now.getTime() - new Date(current.pausedAt).getTime() : 0
    const addedMins = Math.round(pausedMs / 60000)
    const taskId    = Number(req.params.id)

    const [task] = await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId },
        data: { status: 'IN_PROGRESS', pausedAt: null, pausedMinutes: { increment: addedMins } },
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
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const now    = new Date()
    const taskId = Number(req.params.id)
    const [task] = await prisma.$transaction([
      prisma.task.update({
        where:   { id: taskId, userId },
        data:    { status: 'COMPLETED', completedAt: now, pausedAt: null },
        include: taskInclude,
      }),
      prisma.taskSession.updateMany({ where: { taskId, endedAt: null }, data: { endedAt: now } }),
    ])

    const members = await prisma.projectMember.findMany({
      where: { projectId: task.projectId, userId: { not: userId } },
      select: { userId: true },
    })
    if (members.length > 0) {
      const desc = task.description.length > 60 ? task.description.slice(0, 57) + '...' : task.description
      await prisma.notification.createMany({
        data: members.map(m => ({
          userId:      m.userId,
          actorId:     userId,
          taskId:      task.id,
          projectId:   task.projectId,
          workspaceId,
          type:        'COMPLETED',
          message:     `completó "${desc}"`,
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
    const userId = req.user.userId
    const workspaceId = req.workspace.id
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
      prisma.taskSession.updateMany({ where: { taskId, endedAt: null }, data: { endedAt: now } }),
    ])

    const members = await prisma.projectMember.findMany({
      where: { projectId: task.projectId, userId: { not: userId } },
      select: { userId: true },
    })
    if (members.length > 0) {
      const desc = task.description.length > 60 ? task.description.slice(0, 57) + '...' : task.description
      await prisma.notification.createMany({
        data: members.map(m => ({
          userId:      m.userId,
          actorId:     userId,
          taskId:      task.id,
          projectId:   task.projectId,
          workspaceId,
          type:        'BLOCKED',
          message:     `bloqueó "${desc}"`,
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
    const userId = req.user.userId
    await assertNoActiveTask(userId, req.workspace?.id)

    const current = await prisma.task.findUnique({ where: { id: Number(req.params.id) } })
    if (!current || current.userId !== userId) {
      return res.status(404).json({ error: 'Tarea no encontrada' })
    }
    if (current.isBacklog) return res.status(400).json({ error: 'Agregá la tarea al día primero para desbloquearla.' })

    const now       = new Date()
    const blockedMs = current.pausedAt ? now.getTime() - new Date(current.pausedAt).getTime() : 0
    const addedMins = Math.round(blockedMs / 60000)
    const taskId    = Number(req.params.id)

    const [task] = await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId },
        data: { status: 'IN_PROGRESS', blockedReason: null, pausedAt: null, pausedMinutes: { increment: addedMins } },
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
    if (!isAdmin(req) && task.userId !== req.user.userId) {
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
    await prisma.task.delete({ where: { id: Number(req.params.id), userId: req.user.userId } })
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
    if (!isAdmin(req) && task.userId !== req.user.userId) {
      return res.status(403).json({ error: 'No tenés permiso para editar esta tarea' })
    }
    const updated = await prisma.task.update({ where: { id }, data: { minutesOverride: minutes } })
    res.json(updated)
  } catch (err) { next(err) }
}

async function starTask(req, res, next) {
  try {
    const userId = req.user.userId
    const id = Number(req.params.id)

    const task = await prisma.task.findUnique({ where: { id } })
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Tarea no encontrada' })

    const currentLevel = task.starred || 0
    const nextLevel = (currentLevel + 1) % 4

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
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const skip   = Math.max(0, Number(req.query.skip) || 0)
    const take   = 10
    const { before } = req.query

    const where = { userId, status: 'COMPLETED', workDay: { workspaceId } }
    if (before) where.workDay = { ...where.workDay, date: { lt: before } }

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
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const taskId = Number(req.params.id)

    const task = await prisma.task.findUnique({ where: { id: taskId }, include: { workDay: true } })
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (task.status === 'COMPLETED') return res.status(400).json({ error: 'No podés mover al día una tarea completada.' })

    const date = todayString(tz)
    if (task.workDay.date === date && !task.isBacklog) {
      return res.status(400).json({ error: 'La tarea ya está en el día de hoy.' })
    }

    if (task.status === 'IN_PROGRESS') {
      const otherActive = await prisma.task.findFirst({
        where: { userId, status: 'IN_PROGRESS', id: { not: taskId } },
      })
      if (otherActive) throw Object.assign(
        new Error('Ya tenés una tarea en curso. Pausala o completala primero.'),
        { status: 409 }
      )
    }

    const wdKey2 = { userId_workspaceId_date: { userId, workspaceId, date } }
    let workDay = await prisma.workDay.findUnique({ where: wdKey2 })
    if (!workDay) {
      try {
        workDay = await prisma.workDay.create({ data: { userId, workspaceId, date } })
      } catch (createErr) {
        if (createErr.code === 'P2002') {
          workDay = await prisma.workDay.findUnique({ where: wdKey2 })
        } else {
          throw createErr
        }
      }
    }

    if (!workDay) {
      return res.status(500).json({ error: 'No se pudo obtener la jornada laboral. Recargá la página.' })
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
    const userId = req.user.userId
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
    const createdById = req.user.userId
    const workspaceId = req.workspace.id

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const tasks = await prisma.task.findMany({
      where: {
        createdById,
        userId: { not: createdById },
        workDay: { workspaceId },
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
