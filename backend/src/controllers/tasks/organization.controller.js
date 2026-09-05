const prisma = require('../../lib/prisma')
const { todayString } = require('../../utils/dates')
const { taskInclude, handleActiveTaskConflict } = require('./_shared')

async function starTask(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)

    const task = await prisma.task.findUnique({ where: { id }, include: { workDay: true } })
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Tarea no encontrada' })

    const currentLevel = task.starred || 0
    const nextLevel = (currentLevel + 1) % 4

    if (nextLevel === 1) {
      const starredCount = await prisma.task.count({
        where: { userId, starred: { gt: 0 }, status: { not: 'COMPLETED' }, workDay: { workspaceId } },
      })
      if (starredCount >= 3) {
        return res.status(409).json({ error: 'Máximo 3 tareas destacadas. Quitá una primero.' })
      }
    }

    const data = { starred: nextLevel }

    // Una tarea destacada se mantiene en el foco aunque se arrastre de días anteriores (no cae al
    // backlog mientras tenga estrella). Al quitarle la estrella (volver a 0), si era una pendiente
    // arrastrada de un día previo, se re-aloja en la jornada de hoy para que quede como pendiente
    // del día. Recién cuando pase un día sin completarla volverá a arrastrarse como pendiente → backlog.
    if (nextLevel === 0 && task.status === 'PENDING' && !task.isBacklog) {
      const date = todayString(req.workspace.timezone)
      if (task.workDay && task.workDay.date < date) {
        const wdKey = { userId_workspaceId_date: { userId, workspaceId, date } }
        let workDay = await prisma.workDay.findUnique({ where: wdKey })
        if (!workDay) {
          try {
            workDay = await prisma.workDay.create({ data: { userId, workspaceId, date } })
          } catch (createErr) {
            if (createErr.code === 'P2002') workDay = await prisma.workDay.findUnique({ where: wdKey })
            else throw createErr
          }
        }
        if (workDay) data.workDayId = workDay.id
      }
    }

    const updated = await prisma.task.update({
      where: { id },
      data,
      include: taskInclude,
    })
    res.json(updated)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
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

// Adelantar una tarea futura (scheduledFor en el futuro) a hoy: la engancha al workday de
// hoy, limpia scheduledFor y la saca del backlog. Pasa a ser una tarea normal del día.
async function bringToToday(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const taskId = Number(req.params.id)

    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (!task.scheduledFor) return res.status(400).json({ error: 'La tarea no es futura.' })

    const date = todayString(tz)
    const wdKey = { userId_workspaceId_date: { userId, workspaceId, date } }
    let workDay = await prisma.workDay.findUnique({ where: wdKey })
    if (!workDay) {
      try {
        workDay = await prisma.workDay.create({ data: { userId, workspaceId, date } })
      } catch (createErr) {
        if (createErr.code === 'P2002') workDay = await prisma.workDay.findUnique({ where: wdKey })
        else throw createErr
      }
    }
    if (!workDay) return res.status(500).json({ error: 'No se pudo obtener la jornada laboral. Recargá la página.' })

    const updated = await prisma.task.update({
      where: { id: taskId },
      data:  { scheduledFor: null, isBacklog: false, workDayId: workDay.id },
      include: taskInclude,
    })
    res.json(updated)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(err)
  }
}

async function moveToBacklog(req, res, next) {
  try {
    const userId = req.user.userId
    const taskId = Number(req.params.id)

    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task || task.userId !== userId) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (task.status !== 'PENDING') return res.status(400).json({ error: 'Solo las tareas pendientes pueden ir al Backlog. Una tarea pausada o bloqueada ya está empezada.' })

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

module.exports = { starTask, addToToday, bringToToday, moveToBacklog }
