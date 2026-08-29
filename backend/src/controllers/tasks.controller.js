const prisma = require('../lib/prisma')
const { todayString } = require('../utils/dates')
const {
  buildRecurrenceParams, firstScheduledDate, spawnInstance,
} = require('../services/recurrence.service')
const { isAdmin } = require('../lib/projectAccess')
const { resolveMentions } = require('../lib/mentions')
const { emitTo } = require('../lib/socket')
const { nextOnTaskDone } = require('../lib/contentCatalog')
const { maybeAutoFinishMeeting } = require('../lib/projectMeetingLifecycle')
const { statusSideEffects, logEvent, loadPiece, formatPiece } = require('./content.controller')

// Resuelve @menciones de un texto contra los miembros activos del workspace (cualquiera
// puede ser mencionado en una tarea, sea o no su responsable — la etiqueta de proyecto/
// equipo no es una barrera, ver "Project access model" en CLAUDE.md) y devuelve el Set
// de userIds a notificar.
async function resolveTaskMentions(text, workspaceId, authorId) {
  if (!text.includes('@')) return new Set()
  const wsMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId, active: true },
    include: { user: { select: { id: true, name: true } } },
  })
  return resolveMentions(text, wsMembers.map(m => m.user), authorId)
}

const taskInclude = {
  project: true,
  createdBy: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
  sessions: { select: { startedAt: true, endedAt: true } },
  // Pieza de Contenido vinculada (si la tarea vino de "Enviar al dashboard") — alcanza con
  // el id para armar el deep-link a /contenido?projectId=&piece= desde TaskCard.
  contentPiece: { select: { id: true } },
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

// Destinatarios de una notificación sobre el ciclo de vida de una tarea (completar,
// bloquear, desbloquear): miembros del proyecto + seguidores (TaskFollow) + quien la
// delegó (createdById), aunque no sea miembro del proyecto. Sin duplicar, sin el actor.
async function taskLifecycleRecipients(task, actorId) {
  const members = await prisma.projectMember.findMany({
    where: { projectId: task.projectId, userId: { not: actorId } },
    select: { userId: true },
  })
  const recipients = new Set(members.map(m => m.userId))
  const followers = await prisma.taskFollow.findMany({
    where: { taskId: task.id, userId: { not: actorId } },
    select: { userId: true },
  })
  for (const f of followers) recipients.add(f.userId)
  if (task.createdById && task.createdById !== actorId) recipients.add(task.createdById)
  return recipients
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

    const project = await prisma.project.findFirst({ where: { id: Number(projectId), workspaceId, active: true } })
    if (!project) return res.status(400).json({ error: 'Proyecto inválido' })

    const userId = targetUserId ? Number(targetUserId) : requesterId
    const today = todayString(tz)

    // ── Validación de opciones de tarea futura / recurrente ──────────────────
    const isYMD = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
    const recurrence = req.body.recurrence || null
    let scheduledFor = req.body.scheduledFor || null

    if (scheduledFor && !isYMD(scheduledFor)) {
      return res.status(400).json({ error: 'Fecha inválida (formato YYYY-MM-DD)' })
    }
    // Una fecha futura igual o anterior a hoy es una tarea normal.
    if (scheduledFor && scheduledFor <= today) scheduledFor = null

    if (recurrence) {
      const FREQ = ['daily', 'weekly', 'monthly', 'annual']
      if (!FREQ.includes(recurrence.frequency)) {
        return res.status(400).json({ error: 'Tipo de recurrencia inválido' })
      }
      if (recurrence.endDate && !isYMD(recurrence.endDate)) {
        return res.status(400).json({ error: 'Fecha de finalización inválida' })
      }
      if (recurrence.endDate && recurrence.endDate < today) {
        return res.status(400).json({ error: 'La fecha de finalización no puede ser anterior a hoy' })
      }
      // Día del mes elegido desde el calendario (monthly/annual)
      if ((recurrence.frequency === 'monthly' || recurrence.frequency === 'annual') && recurrence.dayOfMonth != null) {
        const dom = Number(recurrence.dayOfMonth)
        if (!Number.isInteger(dom) || dom < 1 || dom > 31) {
          return res.status(400).json({ error: 'Día del mes inválido (1-31)' })
        }
      }
      // Mes elegido desde el calendario (annual)
      if (recurrence.frequency === 'annual' && recurrence.month != null) {
        const mo = Number(recurrence.month)
        if (!Number.isInteger(mo) || mo < 1 || mo > 12) {
          return res.status(400).json({ error: 'Mes inválido (1-12)' })
        }
      }
    }

    if (userId !== requesterId) {
      // El equipo del proyecto (ProjectMember) es solo una etiqueta de "trabajan
      // principalmente acá": cualquier integrante del workspace puede aportar o
      // recibir tareas en cualquier proyecto sin pasar a formar parte del equipo.
      // Única validación: el destinatario debe ser un miembro activo del workspace.
      const targetMember = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      })
      if (!targetMember || !targetMember.active) {
        return res.status(400).json({ error: 'El usuario no pertenece a este workspace' })
      }
    }

    const wdKey = { userId_workspaceId_date: { userId, workspaceId, date: today } }
    let workDay = await prisma.workDay.findUnique({ where: wdKey })
    if (!workDay) {
      try {
        workDay = await prisma.workDay.create({ data: { userId, workspaceId, date: today } })
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

    let task
    if (recurrence) {
      // Tarea recurrente: crear la plantilla + materializar la primera ocurrencia.
      const params = buildRecurrenceParams({
        frequency:  recurrence.frequency,
        weekdays:   recurrence.weekdays,
        dayOfMonth: recurrence.dayOfMonth,
        month:      recurrence.month,
        startDate:  today,
      })
      const rec = await prisma.taskRecurrence.create({
        data: {
          workspaceId,
          userId,
          createdById: userId !== requesterId ? requesterId : null,
          projectId:   Number(projectId),
          description,
          frequency:   recurrence.frequency,
          weekdays:    params.weekdays,
          dayOfMonth:  params.dayOfMonth,
          month:       params.month,
          startDate:   today,
          endDate:     recurrence.endDate || null,
        },
      })
      const first = firstScheduledDate(rec)
      if (!first) {
        // La recurrencia no produce ninguna ocurrencia (ej. endDate antes del inicio).
        await prisma.taskRecurrence.update({ where: { id: rec.id }, data: { active: false } })
        return res.status(400).json({ error: 'La recurrencia no genera ninguna fecha válida' })
      }
      const created = await spawnInstance(prisma, rec, first, workDay.id)
      task = await prisma.task.findUnique({ where: { id: created.id }, include: taskInclude })
    } else {
      // Tarea normal o futura (one-off).
      task = await prisma.task.create({
        data: {
          description,
          projectId: Number(projectId),
          userId,
          workDayId: workDay.id,
          createdById: userId !== requesterId ? requesterId : null,
          scheduledFor: scheduledFor || null,
        },
        include: taskInclude,
      })
    }

    // Notificar solo si la tarea ya está activa (no programada a futuro): si es futura,
    // la notificación (y el link a la tarea) se verían antes de que la tarea exista/sea
    // visible para el destinatario (queda excluida de las listas hasta scheduledFor).
    if (!task.scheduledFor) {
      const desc = description.length > 60 ? description.slice(0, 57) + '...' : description

      if (userId !== requesterId) {
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

      // @menciones en la descripción: notifican aunque la tarea sea para uno mismo
      // (ej. "Para mí, avisale a @Fulano"). Si la mencionada es además la responsable,
      // no se duplica el aviso — ya recibió el de arriba.
      const mentioned = await resolveTaskMentions(description, workspaceId, requesterId)
      mentioned.delete(userId)
      if (mentioned.size > 0) {
        await prisma.notification.createMany({
          data: Array.from(mentioned).map(uid => ({
            userId:      uid,
            actorId:     requesterId,
            taskId:      task.id,
            projectId:   Number(projectId),
            workspaceId,
            type:        'TASK_MENTION',
            message:     `te mencionó en una tarea: "${desc}"`,
          })),
        })
      }
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
    if (existing.status !== 'PENDING') return res.status(400).json({ error: 'Solo se puede iniciar una tarea pendiente.' })

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
    // Reabrir una tarea vinculada destilda su To-Do de L10 / de reunión de proyecto,
    // y reabre la próxima acción de Ventas si la tarea venía de una. Las piezas de
    // Contenido son la excepción deliberada: reabrir la tarea NO retrocede el estado
    // de la pieza (una pieza ya "Esperando aprobación" no debe volver a "Revisión
    // interna" solo porque alguien reabrió su tarea del dashboard).
    await prisma.eOSTodo.updateMany({ where: { taskId }, data: { done: false, completedAt: null } })
    await prisma.projectMeetingTodo.updateMany({ where: { taskId }, data: { done: false, completedAt: null } })
    await prisma.leadAction.updateMany({ where: { taskId }, data: { status: 'pending', doneAt: null, doneById: null } })
    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(handleActiveTaskConflict(err))
  }
}

async function pauseTask(req, res, next) {
  try {
    const userId = req.user.userId
    const taskId = Number(req.params.id)
    const existing = await prisma.task.findUnique({ where: { id: taskId } })
    if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (existing.status !== 'IN_PROGRESS') return res.status(400).json({ error: 'Solo se puede pausar una tarea en curso.' })

    const now = new Date()
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
    if (current.status !== 'PAUSED') return res.status(400).json({ error: 'Solo se puede reanudar una tarea pausada.' })

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
    // Reanudar una tarea vinculada destilda su To-Do de L10 / de reunión de proyecto,
    // y reabre la próxima acción de Ventas si la tarea venía de una. Mismo criterio
    // que en startTask: una pieza de Contenido NO retrocede de estado acá.
    await prisma.eOSTodo.updateMany({ where: { taskId }, data: { done: false, completedAt: null } })
    await prisma.projectMeetingTodo.updateMany({ where: { taskId }, data: { done: false, completedAt: null } })
    await prisma.leadAction.updateMany({ where: { taskId }, data: { status: 'pending', doneAt: null, doneById: null } })
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
    const taskId = Number(req.params.id)
    const existing = await prisma.task.findUnique({ where: { id: taskId } })
    if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (existing.status !== 'IN_PROGRESS') return res.status(400).json({ error: 'Solo se puede completar una tarea en curso.' })

    const now    = new Date()
    const [task] = await prisma.$transaction([
      prisma.task.update({
        where:   { id: taskId, userId },
        data:    { status: 'COMPLETED', completedAt: now, pausedAt: null },
        include: taskInclude,
      }),
      prisma.taskSession.updateMany({ where: { taskId, endedAt: null }, data: { endedAt: now } }),
    ])

    const recipients = await taskLifecycleRecipients(task, userId)
    if (recipients.size > 0) {
      const desc = task.description.length > 60 ? task.description.slice(0, 57) + '...' : task.description
      await prisma.notification.createMany({
        data: Array.from(recipients).map(uid => ({
          userId:      uid,
          actorId:     userId,
          taskId:      task.id,
          projectId:   task.projectId,
          workspaceId,
          type:        'COMPLETED',
          message:     `completó "${desc}"`,
        })),
      })
    }

    // Si la tarea está vinculada a un To-Do (L10 o reunión de proyecto), tildarlo (sync un sentido: tarea → To-Do).
    await prisma.eOSTodo.updateMany({ where: { taskId: task.id }, data: { done: true, completedAt: now } })
    await prisma.projectMeetingTodo.updateMany({ where: { taskId: task.id }, data: { done: true, completedAt: now } })

    // Si la tarea es la de un participante de una reunión de proyecto, la reunión se
    // cierra sola en cuanto TODOS los participantes hayan completado la suya —
    // nadie tiene que entrar a la pestaña de Reuniones a apretar "Finalizar".
    const meetingParticipant = await prisma.projectMeetingParticipant.findUnique({
      where:  { taskId: task.id },
      select: { meetingId: true },
    })
    if (meetingParticipant) await maybeAutoFinishMeeting(meetingParticipant.meetingId)

    // Si viene de una pieza de Contenido, avanzarla — a diferencia de los to-dos de
    // arriba esto NO es un updateMany ciego: hace falta leer el estado ACTUAL de la
    // pieza para saber a qué estado avanza (ADVANCE_ON_TASK_DONE), y dejar el salto
    // registrado en su historial (ContentStatusEvent). Fuera del mapa (ej. una pieza
    // ya aprobada) no pasa nada — completar la tarea no la mueve.
    const linkedPiece = await prisma.contentPiece.findUnique({ where: { taskId: task.id } })
    if (linkedPiece) {
      const toStatus = nextOnTaskDone(linkedPiece.status)
      if (toStatus) {
        await prisma.contentPiece.update({ where: { id: linkedPiece.id }, data: statusSideEffects(toStatus) })
        await logEvent({
          pieceId: linkedPiece.id, workspaceId: linkedPiece.workspaceId,
          action: 'task_completed', fromStatus: linkedPiece.status, toStatus, req,
        })
        const freshPiece = await loadPiece(linkedPiece.id, linkedPiece.projectId, linkedPiece.workspaceId)
        emitTo(`workspace:${linkedPiece.workspaceId}`, 'content:piece:updated', {
          projectId: linkedPiece.projectId, piece: formatPiece(freshPiece),
        })
      }
    }

    // Si viene de una próxima acción de Ventas, resolverla también (sync en ambos
    // sentidos con el botón "Resolver" del lead — ver leads.controller.js resolveAction).
    const linkedAction = await prisma.leadAction.findUnique({
      where: { taskId: task.id },
      select: { id: true, leadId: true, workspaceId: true, title: true, status: true },
    })
    if (linkedAction && linkedAction.status !== 'done') {
      await prisma.leadAction.update({ where: { id: linkedAction.id }, data: { status: 'done', doneAt: now, doneById: userId } })
      try {
        await prisma.leadActivity.create({
          data: {
            workspaceId: linkedAction.workspaceId, leadId: linkedAction.leadId, userId,
            kind: 'event', type: 'next_action_done',
            content: `resolvió la acción: "${linkedAction.title}" (desde su tarea)`,
          },
        })
      } catch (err) { console.error('[ventas] log next_action_done error:', err.message) }
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
    const taskId = Number(req.params.id)
    const existing = await prisma.task.findUnique({ where: { id: taskId } })
    if (!existing || existing.userId !== userId) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (existing.status !== 'IN_PROGRESS') return res.status(400).json({ error: 'Solo se puede bloquear una tarea en curso.' })

    const now    = new Date()
    const [task] = await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId, userId },
        data: { status: 'BLOCKED', blockedReason: reason.trim(), pausedAt: now },
        include: taskInclude,
      }),
      prisma.taskSession.updateMany({ where: { taskId, endedAt: null }, data: { endedAt: now } }),
    ])

    // Destinatarios: miembros del proyecto + seguidores + quien delegó la tarea, igual
    // que al completarla — así el bloqueo llega a quien más lo necesita, no solo al equipo.
    const recipients = await taskLifecycleRecipients(task, userId)
    if (recipients.size > 0) {
      const desc = task.description.length > 60 ? task.description.slice(0, 57) + '...' : task.description
      await prisma.notification.createMany({
        data: Array.from(recipients).map(uid => ({
          userId:      uid,
          actorId:     userId,
          taskId:      task.id,
          projectId:   task.projectId,
          workspaceId,
          type:        'BLOCKED',
          message:     `bloqueó "${desc}": ${reason.trim()}`,
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
    const workspaceId = req.workspace.id
    await assertNoActiveTask(userId, req.workspace?.id)

    const current = await prisma.task.findUnique({ where: { id: Number(req.params.id) } })
    if (!current || current.userId !== userId) {
      return res.status(404).json({ error: 'Tarea no encontrada' })
    }
    if (current.isBacklog) return res.status(400).json({ error: 'Agregá la tarea al día primero para desbloquearla.' })
    if (current.status !== 'BLOCKED') return res.status(400).json({ error: 'Solo se puede desbloquear una tarea bloqueada.' })

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

    // Cierra el loop del BLOCKED: avisa a los mismos destinatarios que se desbloqueó.
    const recipients = await taskLifecycleRecipients(task, userId)
    if (recipients.size > 0) {
      const desc = task.description.length > 60 ? task.description.slice(0, 57) + '...' : task.description
      await prisma.notification.createMany({
        data: Array.from(recipients).map(uid => ({
          userId:      uid,
          actorId:     userId,
          taskId:      task.id,
          projectId:   task.projectId,
          workspaceId,
          type:        'UNBLOCKED',
          message:     `desbloqueó "${desc}"`,
        })),
      })
    }

    res.json(task)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Tarea no encontrada' })
    next(handleActiveTaskConflict(err))
  }
}

async function editTask(req, res, next) {
  try {
    const id = Number(req.params.id)
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const requesterId = req.user.userId
    const { description, projectId, targetUserId, scheduledFor } = req.body
    if (!description?.trim()) return res.status(400).json({ error: 'La descripción es requerida' })

    // Scopear por workspace: evita que un admin/owner edite tareas de otros workspaces vía ID.
    const task = await prisma.task.findFirst({ where: { id, workDay: { workspaceId } } })
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (!isAdmin(req) && task.userId !== requesterId) {
      return res.status(403).json({ error: 'No tenés permiso para editar esta tarea' })
    }

    // Reasignar proyecto/responsable de una tarea ya completada reescribe en silencio
    // las horas históricas de Productividad/Reportes (se leen por userId+projectId).
    // Solo se permite corregir la descripción.
    if (task.status === 'COMPLETED') {
      if ((projectId != null && Number(projectId) !== task.projectId) || (targetUserId != null && Number(targetUserId) !== task.userId)) {
        return res.status(409).json({ error: 'No se puede cambiar el proyecto o el responsable de una tarea completada' })
      }
    }

    const desc = description.trim()
    const data = { description: desc }

    // ── Proyecto ── (debe existir y pertenecer al workspace)
    if (projectId != null && Number(projectId) !== task.projectId) {
      const project = await prisma.project.findFirst({ where: { id: Number(projectId), workspaceId } })
      if (!project) return res.status(400).json({ error: 'Proyecto inválido' })
      data.projectId = Number(projectId)
    }

    // ── Responsable ── (debe ser miembro activo del workspace; se re-engancha al
    // workday de hoy del nuevo responsable, como en la creación, para que la tarea
    // aparezca en su dashboard — las consultas de "hoy" filtran por workDayId).
    if (targetUserId != null && Number(targetUserId) !== task.userId) {
      const newUserId = Number(targetUserId)
      const targetMember = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: newUserId } },
      })
      if (!targetMember || !targetMember.active) {
        return res.status(400).json({ error: 'El usuario no pertenece a este workspace' })
      }
      data.userId = newUserId
      const today = todayString(tz)
      const wdKey = { userId_workspaceId_date: { userId: newUserId, workspaceId, date: today } }
      let workDay = await prisma.workDay.findUnique({ where: wdKey })
      if (!workDay) {
        try {
          workDay = await prisma.workDay.create({ data: { userId: newUserId, workspaceId, date: today } })
        } catch (createErr) {
          if (createErr.code === 'P2002') workDay = await prisma.workDay.findUnique({ where: wdKey })
          else throw createErr
        }
      }
      if (workDay) data.workDayId = workDay.id
    }

    // ── Fecha programada ── (solo para tareas futuras one-off; las recurrentes
    // controlan sus fechas vía la plantilla, no se editan acá).
    if (scheduledFor !== undefined && task.scheduledFor && !task.recurrenceId) {
      const isYMD = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
      const today = todayString(tz)
      if (!isYMD(scheduledFor)) return res.status(400).json({ error: 'Fecha inválida (formato YYYY-MM-DD)' })
      if (scheduledFor <= today) return res.status(400).json({ error: 'La fecha debe ser posterior a hoy.' })
      data.scheduledFor = scheduledFor
    }

    // scope=series en una instancia recurrente: actualiza la plantilla + las instancias
    // futuras no completadas (las completadas conservan su texto histórico). Se propagan
    // descripción y proyecto; responsable/fecha quedan por instancia.
    if (req.query.scope === 'series' && task.recurrenceId) {
      const seriesData = { description: desc, ...(data.projectId != null ? { projectId: data.projectId } : {}) }
      await prisma.$transaction([
        prisma.taskRecurrence.update({ where: { id: task.recurrenceId }, data: seriesData }),
        prisma.task.updateMany({
          where: { recurrenceId: task.recurrenceId, status: { not: 'COMPLETED' } },
          data:  seriesData,
        }),
        prisma.task.update({ where: { id }, data }),
      ])
    } else {
      await prisma.task.update({ where: { id }, data })
    }

    // @menciones nuevas en la descripción editada: solo avisa a quien se agrega de nuevo
    // (si ya estaba mencionado en la versión anterior, no se repite el aviso). Igual que en
    // la creación, se salta si la tarea sigue programada a futuro (no visible todavía).
    const stillFuture = data.scheduledFor !== undefined ? data.scheduledFor : task.scheduledFor
    if (!stillFuture && desc !== task.description && (desc.includes('@') || task.description.includes('@'))) {
      const wsMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId, active: true },
        include: { user: { select: { id: true, name: true } } },
      })
      const users = wsMembers.map(m => m.user)
      const before = resolveMentions(task.description, users, requesterId)
      const after  = resolveMentions(desc, users, requesterId)
      const newlyMentioned = [...after].filter(uid => !before.has(uid))
      if (newlyMentioned.length > 0) {
        const shortDesc = desc.length > 60 ? desc.slice(0, 57) + '...' : desc
        await prisma.notification.createMany({
          data: newlyMentioned.map(uid => ({
            userId:      uid,
            actorId:     requesterId,
            taskId:      id,
            projectId:   data.projectId ?? task.projectId,
            workspaceId,
            type:        'TASK_MENTION',
            message:     `te mencionó en una tarea: "${shortDesc}"`,
          })),
        })
      }
    }

    const updated = await prisma.task.findUnique({ where: { id }, include: taskInclude })
    res.json(updated)
  } catch (err) { next(err) }
}

async function remove(req, res, next) {
  try {
    const id = Number(req.params.id)
    const task = await prisma.task.findFirst({
      where: { id, workDay: { workspaceId: req.workspace.id } },
    })
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })
    // Puede borrar: admin/owner del workspace, el dueño de la tarea, o quien la delegó (creador)
    if (!isAdmin(req) && task.userId !== req.user.userId && task.createdById !== req.user.userId) {
      return res.status(403).json({ error: 'No tenés permiso para eliminar esta tarea' })
    }

    // scope=series en una instancia recurrente: elimina toda la serie. Borra la plantilla
    // (lo que pone recurrenceId=null en las instancias completadas, conservando el historial)
    // y elimina explícitamente las instancias NO completadas (esta + las futuras pendientes).
    if (req.query.scope === 'series' && task.recurrenceId) {
      const recId = task.recurrenceId
      const instances = await prisma.task.findMany({
        where: { recurrenceId: recId, status: { not: 'COMPLETED' } },
        select: { id: true },
      })
      const ids = instances.map(t => t.id)
      await prisma.$transaction([
        prisma.notification.deleteMany({ where: { taskId: { in: ids } } }),
        prisma.task.deleteMany({ where: { id: { in: ids } } }),
        prisma.taskRecurrence.delete({ where: { id: recId } }),
      ])
      return res.json({ ok: true, deletedSeries: true, deletedCount: ids.length })
    }

    // Notification no tiene cascade sobre Task — borrarlas antes para evitar el FK constraint
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { taskId: id } }),
      prisma.task.delete({ where: { id } }),
    ])
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
    // Scopear por workspace: evita editar la duración de tareas de otros workspaces vía ID.
    const task = await prisma.task.findFirst({ where: { id, workDay: { workspaceId: req.workspace.id } } })
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (task.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Solo se puede editar la duración de tareas completadas' })
    }
    if (!isAdmin(req) && task.userId !== req.user.userId) {
      return res.status(403).json({ error: 'No tenés permiso para editar esta tarea' })
    }
    const updated = await prisma.task.update({ where: { id }, data: { minutesOverride: minutes }, include: taskInclude })
    res.json(updated)
  } catch (err) { next(err) }
}

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
      include: {
        project: { select: { id: true, name: true } },
        workDay: { select: { date: true } },
        _count: { select: { comments: true } },
      },
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

async function delegated(req, res, next) {
  try {
    const createdById = req.user.userId
    const workspaceId = req.workspace.id
    const today = todayString(req.workspace.timezone)

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const tasks = await prisma.task.findMany({
      where: {
        createdById,
        userId: { not: createdById },
        dismissedByCreator: false,
        workDay: { workspaceId },
        // Excluir tareas futuras (aún no materializadas para el destinatario)
        AND: [
          { OR: [{ scheduledFor: null }, { scheduledFor: { lte: today } }] },
          { OR: [
            { status: { not: 'COMPLETED' } },
            { status: 'COMPLETED', completedAt: { gte: weekAgo } },
          ] },
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

// ─── SEGUIMIENTO DE TAREAS ───────────────────────────────────────────────────

// Verifica que la tarea exista y sea del workspace actual; el usuario puede seguir
// cualquier tarea que pueda ver (modelo de acceso abierto del workspace).
async function findTaskInWorkspace(taskId, workspaceId) {
  return prisma.task.findFirst({
    where: { id: taskId, workDay: { workspaceId } },
    select: { id: true },
  })
}

async function followTask(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const taskId = Number(req.params.id)

    const task = await findTaskInWorkspace(taskId, workspaceId)
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' })

    await prisma.taskFollow.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId, workspaceId },
      update: {},
    })
    res.json({ following: true })
  } catch (err) { next(err) }
}

async function unfollowTask(req, res, next) {
  try {
    const userId = req.user.userId
    const taskId = Number(req.params.id)
    await prisma.taskFollow.deleteMany({ where: { taskId, userId } })
    res.json({ following: false })
  } catch (err) { next(err) }
}

async function followState(req, res, next) {
  try {
    const userId = req.user.userId
    const taskId = Number(req.params.id)
    const f = await prisma.taskFollow.findUnique({
      where: { taskId_userId: { taskId, userId } },
      select: { id: true },
    })
    res.json({ following: !!f })
  } catch (err) { next(err) }
}

// Tareas que el usuario sigue (las "Seguidas" de la sección Seguimiento).
async function followed(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const today = todayString(req.workspace.timezone)

    const follows = await prisma.taskFollow.findMany({
      where: {
        userId,
        workspaceId,
        task: {
          // Excluir tareas futuras aún no materializadas
          OR: [{ scheduledFor: null }, { scheduledFor: { lte: today } }],
        },
      },
      include: {
        task: {
          include: {
            project: true,
            user: { select: { id: true, name: true, avatar: true } },
            _count: { select: { comments: true } },
            sessions: { select: { startedAt: true, endedAt: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(follows.map(f => f.task))
  } catch (err) { next(err) }
}

async function dismissDelegated(req, res, next) {
  try {
    const createdById = req.user.userId
    const workspaceId = req.workspace.id
    const { status } = req.query  // opcional: filtra por estado

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const where = {
      createdById,
      userId: { not: createdById },
      dismissedByCreator: false,
      workDay: { workspaceId },
      OR: [
        { status: { not: 'COMPLETED' } },
        { status: 'COMPLETED', completedAt: { gte: weekAgo } },
      ],
    }
    if (status) where.status = status

    const { count } = await prisma.task.updateMany({
      where,
      data: { dismissedByCreator: true },
    })

    res.json({ dismissed: count })
  } catch (err) { next(err) }
}

// Quita del dashboard una sola tarea delegada puntual (espejo individual de dismissDelegated).
async function dismissDelegatedOne(req, res, next) {
  try {
    const createdById = req.user.userId
    const taskId = Number(req.params.id)

    const { count } = await prisma.task.updateMany({
      where: { id: taskId, createdById, userId: { not: createdById } },
      data: { dismissedByCreator: true },
    })
    if (count === 0) return res.status(404).json({ error: 'Tarea no encontrada' })
    res.json({ dismissed: true })
  } catch (err) { next(err) }
}

// Deja de seguir en bulk (espejo de dismissDelegated para la pestaña Seguidas).
async function unfollowAll(req, res, next) {
  try {
    const userId = req.user.userId
    const workspaceId = req.workspace.id
    const { status } = req.query  // opcional: filtra por estado

    const where = { userId, workspaceId }
    if (status) where.task = { status }

    const { count } = await prisma.taskFollow.deleteMany({ where })
    res.json({ unfollowed: count })
  } catch (err) { next(err) }
}

module.exports = { create, startTask, pauseTask, resumeTask, completeTask, blockTask, unblockTask, remove, editTask, setDuration, starTask, addToToday, bringToToday, moveToBacklog, completedHistory, delegated, dismissDelegated, dismissDelegatedOne, followTask, unfollowTask, unfollowAll, followState, followed, assertNoActiveTask }
