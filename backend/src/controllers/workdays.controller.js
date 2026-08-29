const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')
const { materializeForUser } = require('../services/recurrence.service')

const taskInclude = {
  project: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
  sessions: { select: { startedAt: true, endedAt: true } },
  // Pieza de Contenido vinculada (si la tarea vino de "Enviar al dashboard") — alcanza con
  // el id para armar el deep-link a /contenido?projectId=&piece= desde TaskCard.
  contentPiece: { select: { id: true } },
}

// Predicado "tarea visible/activa": no programada a futuro. Las tareas con scheduledFor
// posterior a hoy se ocultan del foco/backlog/carry-over hasta que llega su fecha.
const liveWhere = (today) => ({ OR: [{ scheduledFor: null }, { scheduledFor: { lte: today } }] })

async function getOrCreateToday(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const date = todayString(tz)

    const whereKey = { userId_workspaceId_date: { userId, workspaceId, date } }

    let workDay = await prisma.workDay.findUnique({ where: whereKey })
    if (!workDay) {
      try {
        workDay = await prisma.workDay.create({ data: { userId, workspaceId, date } })
      } catch (createErr) {
        if (createErr.code === 'P2002') {
          // Condición de carrera: otro request creó el registro entre el findUnique y el create.
          workDay = await prisma.workDay.findUnique({ where: whereKey })
        } else {
          throw createErr
        }
      }
    }

    if (workDay?.endedAt) {
      workDay = await prisma.workDay.update({
        where: whereKey,
        data: { endedAt: null, startedAt: new Date() },
      })
    }

    // Materializar tareas futuras/recurrentes: activar las que ya vencieron (enganchándolas
    // al workday de hoy) y generar la próxima ocurrencia de cada recurrencia. Aislado en su
    // propio try: un error de recurrencia no debe romper el dashboard.
    try {
      await materializeForUser(prisma, { userId, workspaceId, todayWorkDayId: workDay.id, today: date })
    } catch (matErr) {
      console.error('[Recurrence] Error materializando tareas:', matErr.message)
    }

    // Tareas de hoy (excluye futuras programadas)
    const tasks = await prisma.task.findMany({
      where: { workDayId: workDay.id, ...liveWhere(date) },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    })

    // Tareas de días anteriores aún activas en este workspace (excluye futuras)
    const carryOverTasks = await prisma.task.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] },
        workDay: { date: { lt: date }, workspaceId },
        ...liveWhere(date),
      },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    })

    // Tareas futuras (programadas para más adelante) — sección "Futuras" del dashboard
    const futureTasks = await prisma.task.findMany({
      where: {
        userId,
        status: { not: 'COMPLETED' },
        scheduledFor: { gt: date },
        workDay: { workspaceId },
      },
      include: taskInclude,
      orderBy: { scheduledFor: 'asc' },
    })

    res.json({ ...workDay, tasks, carryOverTasks, futureTasks })
  } catch (err) { next(err) }
}

async function finish(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const date = todayString(tz)
    const now = new Date()

    // Auto-pausar cualquier tarea IN_PROGRESS antes de cerrar la jornada
    const activeTask = await prisma.task.findFirst({
      where: { userId, status: 'IN_PROGRESS', workDay: { workspaceId } },
    })
    if (activeTask) {
      await prisma.$transaction([
        prisma.task.update({
          where: { id: activeTask.id },
          data: { status: 'PAUSED', pausedAt: now },
        }),
        prisma.taskSession.updateMany({
          where: { taskId: activeTask.id, endedAt: null },
          data: { endedAt: now },
        }),
      ])
    }

    const workDay = await prisma.workDay.update({
      where: { userId_workspaceId_date: { userId, workspaceId, date } },
      data: { endedAt: now },
    })
    res.json(workDay)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Jornada no encontrada' })
    next(err)
  }
}

module.exports = { getOrCreateToday, finish }
