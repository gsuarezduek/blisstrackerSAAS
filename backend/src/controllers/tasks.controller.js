const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function todayString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

async function create(req, res, next) {
  try {
    const requesterId = req.user.id
    const isAdmin = req.user.role === 'ADMIN'
    const { description, projectId, targetUserId } = req.body
    if (!description || !projectId) {
      return res.status(400).json({ error: 'Descripción y proyecto requeridos' })
    }

    const userId = targetUserId ? Number(targetUserId) : requesterId

    // If assigning to someone else, verify both requester and target belong to the project
    if (userId !== requesterId) {
      if (!isAdmin) {
        const requesterMember = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: Number(projectId), userId: requesterId } },
        })
        if (!requesterMember) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
      }
      const targetMember = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: Number(projectId), userId } },
      })
      if (!targetMember) return res.status(400).json({ error: 'El usuario no pertenece a este proyecto' })
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
      include: { project: true, createdBy: { select: { id: true, name: true } } },
    })
    res.status(201).json(task)
  } catch (err) { next(err) }
}

async function startTask(req, res, next) {
  try {
    const userId = req.user.id

    // Only one task can be IN_PROGRESS at a time
    const active = await prisma.task.findFirst({
      where: { userId, status: 'IN_PROGRESS' },
    })
    if (active) {
      return res.status(409).json({ error: 'Ya tenés una tarea en curso. Pausala o completala primero.' })
    }

    const task = await prisma.task.update({
      where: { id: Number(req.params.id), userId },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
      include: { project: true },
    })
    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
}

async function pauseTask(req, res, next) {
  try {
    const task = await prisma.task.update({
      where: { id: Number(req.params.id), userId: req.user.id },
      data: { status: 'PAUSED', pausedAt: new Date() },
      include: { project: true },
    })
    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
}

async function resumeTask(req, res, next) {
  try {
    const userId = req.user.id

    // Only one task can be IN_PROGRESS at a time
    const active = await prisma.task.findFirst({
      where: { userId, status: 'IN_PROGRESS' },
    })
    if (active) {
      return res.status(409).json({ error: 'Ya tenés una tarea en curso. Pausala o completala primero.' })
    }

    const current = await prisma.task.findUnique({
      where: { id: Number(req.params.id) },
    })
    if (!current || current.userId !== userId) {
      return res.status(404).json({ error: 'Tarea no encontrada' })
    }

    // Accumulate the time spent paused
    const pausedMs   = current.pausedAt ? Date.now() - new Date(current.pausedAt).getTime() : 0
    const addedMins  = Math.round(pausedMs / 60000)

    const task = await prisma.task.update({
      where: { id: Number(req.params.id) },
      data: {
        status:        'IN_PROGRESS',
        pausedAt:      null,
        pausedMinutes: { increment: addedMins },
      },
      include: { project: true },
    })
    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
}

async function completeTask(req, res, next) {
  try {
    const userId = req.user.id
    const task = await prisma.task.update({
      where:   { id: Number(req.params.id), userId },
      data:    { status: 'COMPLETED', completedAt: new Date(), pausedAt: null },
      include: { project: true },
    })

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
          message:   `completó "${desc}" en ${task.project.name}`,
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
    const { reason } = req.body
    if (!reason?.trim()) return res.status(400).json({ error: 'La razón del bloqueo es requerida' })
    const task = await prisma.task.update({
      where: { id: Number(req.params.id), userId: req.user.id },
      data: { status: 'BLOCKED', blockedReason: reason.trim(), pausedAt: new Date() },
      include: { project: true, createdBy: { select: { id: true, name: true } } },
    })
    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
}

async function unblockTask(req, res, next) {
  try {
    const userId = req.user.id

    const active = await prisma.task.findFirst({
      where: { userId, status: 'IN_PROGRESS' },
    })
    if (active) {
      return res.status(409).json({ error: 'Ya tenés una tarea en curso. Pausala o completala primero.' })
    }

    const current = await prisma.task.findUnique({
      where: { id: Number(req.params.id) },
    })
    if (!current || current.userId !== userId) {
      return res.status(404).json({ error: 'Tarea no encontrada' })
    }

    // Accumulate time spent blocked so it doesn't count as work time
    const blockedMs  = current.pausedAt ? Date.now() - new Date(current.pausedAt).getTime() : 0
    const addedMins  = Math.round(blockedMs / 60000)

    const task = await prisma.task.update({
      where: { id: Number(req.params.id) },
      data: {
        status:        'IN_PROGRESS',
        blockedReason: null,
        pausedAt:      null,
        pausedMinutes: { increment: addedMins },
      },
      include: { project: true, createdBy: { select: { id: true, name: true } } },
    })
    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
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
    const updated = await prisma.task.update({
      where: { id },
      data: { minutesOverride: minutes },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

module.exports = { create, startTask, pauseTask, resumeTask, completeTask, blockTask, unblockTask, remove, setDuration }
