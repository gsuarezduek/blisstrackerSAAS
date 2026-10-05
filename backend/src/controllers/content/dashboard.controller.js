const prisma = require('../../lib/prisma')
const { todayString } = require('../../utils/dates')
const { emitPieceUpdated, formatPiece, loadPiece, resolveCtx } = require('./_shared')

/**
 * POST /api/contenido/projects/:id/pieces/:pid/send-to-dashboard
 * Crea una Task en el dashboard del responsable y la vincula a la pieza
 * (Task.contentPieceId, SIN unique). Una pieza real pasa por varios tramos de
 * trabajo a lo largo de su vida (CM arma el copy → diseñador arma el reel →
 * CM revisa → CM publica): cada llamada acá crea una tarea NUEVA para el
 * responsable ACTUAL de la pieza, sin importar si ya hubo tramos anteriores.
 * Copia el patrón de sendTodoToDashboard en projectMeetings.controller.js —
 * mismas validaciones, mismo ensureWorkDay con manejo de P2002, misma
 * notificación TASK_MENTION.
 */
async function sendToDashboard(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId, timezone } = ctx
    const requesterId = req.user.userId

    const piece = await loadPiece(req.params.pid, projectId, workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })
    if (!piece.ownerId) {
      // ownerId null puede ser "sin asignar" o "asignado al cliente" — el
      // cliente no es un User, no se le puede crear una Task interna.
      const msg = piece.ownerContactId
        ? 'El responsable es un contacto del cliente — no se le puede asignar una tarea interna'
        : 'Asigná un responsable a la pieza primero'
      return res.status(400).json({ error: msg })
    }

    // Tramo anterior de trabajo, si hay alguno (piece.tasks viene ordenado por
    // createdAt desc — ver PIECE_INCLUDE). Con el cronómetro corriendo no se
    // puede saber cuánto tiempo real le llevó a esa persona: hay que pausar o
    // completar esa tarea antes de pasarle la posta a otra.
    const previousTask = piece.tasks?.[0] ?? null
    if (previousTask && previousTask.status === 'IN_PROGRESS') {
      return res.status(409).json({
        error: `${previousTask.user?.name ?? 'Alguien'} está trabajando ahora en esta pieza — pausá o completá esa tarea antes de reasignarla.`,
      })
    }

    const member = await prisma.workspaceMember.findUnique({
      where:  { workspaceId_userId: { workspaceId, userId: piece.ownerId } },
      select: { active: true },
    })
    if (!member || !member.active) return res.status(400).json({ error: 'El responsable no es un miembro activo del workspace' })

    // El tramo anterior quedó sin cerrar (nunca se empezó, o se pausó/bloqueó):
    // se completa solo al hacer el handoff — no debe quedar colgado en el
    // dashboard de alguien que ya no es el responsable de esta pieza.
    if (previousTask && previousTask.status !== 'COMPLETED') {
      const now = new Date()
      await prisma.$transaction([
        prisma.task.update({
          where: { id: previousTask.id },
          data:  { status: 'COMPLETED', completedAt: now, pausedAt: null, blockedReason: null },
        }),
        prisma.taskSession.updateMany({ where: { taskId: previousTask.id, endedAt: null }, data: { endedAt: now } }),
      ])
    }

    // WorkDay de hoy del responsable (crear si falta — mismo patrón que projectMeetings/tasks.create).
    const today = todayString(timezone)
    const wdKey = { userId_workspaceId_date: { userId: piece.ownerId, workspaceId, date: today } }
    let workDay = await prisma.workDay.findUnique({ where: wdKey })
    if (!workDay) {
      try {
        workDay = await prisma.workDay.create({ data: { userId: piece.ownerId, workspaceId, date: today } })
      } catch (e) {
        if (e.code === 'P2002') workDay = await prisma.workDay.findUnique({ where: wdKey })
        else throw e
      }
    }
    if (!workDay) return res.status(500).json({ error: 'No se pudo obtener la jornada del responsable' })

    const task = await prisma.task.create({
      data: {
        description: `Contenido - ${piece.title}`,
        projectId,
        userId:      piece.ownerId,
        workDayId:   workDay.id,
        createdById: piece.ownerId !== requesterId ? requesterId : null,
        contentPieceId: piece.id,
      },
    })

    if (piece.ownerId !== requesterId) {
      const desc = piece.title.length > 60 ? `${piece.title.slice(0, 57)}...` : piece.title
      await prisma.notification.create({
        data: {
          userId:     piece.ownerId,
          actorId:    requesterId,
          taskId:     task.id,
          projectId,
          workspaceId,
          contentPieceId: piece.id,
          type:       'TASK_MENTION',
          message:    `te asignó una tarea de contenido: "${desc}"`,
        },
      })
    }

    const fresh = await loadPiece(piece.id, projectId, workspaceId)
    const formatted = formatPiece(fresh)
    emitPieceUpdated(workspaceId, projectId, formatted)
    res.status(201).json(formatted)
  } catch (err) { next(err) }
}

module.exports = {
  sendToDashboard,
}
