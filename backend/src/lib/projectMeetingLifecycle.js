const prisma = require('./prisma')
const { todayString } = require('../utils/dates')
const { SYSTEM_TYPES, postProjectSystemMessage } = require('./chatSystemMessage')

// "45 min" o "1h 20min" — para el mensaje de sistema del chat al cerrar una reunión.
function durationLabel(mins) {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

const meetingTypePhrase = (t) => (t === 'client' ? 'con el cliente' : 'interna')
const typeLabel = (t) => (t === 'client' ? 'Reunión con cliente' : 'Reunión de equipo')

// WorkDay de hoy del usuario (crear si falta — mismo patrón que tasks.create).
async function ensureWorkDay(userId, workspaceId, today) {
  const wdKey = { userId_workspaceId_date: { userId, workspaceId, date: today } }
  let workDay = await prisma.workDay.findUnique({ where: wdKey })
  if (!workDay) {
    try {
      workDay = await prisma.workDay.create({ data: { userId, workspaceId, date: today } })
    } catch (e) {
      if (e.code === 'P2002') workDay = await prisma.workDay.findUnique({ where: wdKey })
      else throw e
    }
  }
  return workDay
}

// Crea la Task en el dashboard del responsable de un to-do y la vincula. No valida
// nada (el caller ya se aseguró de que el to-do tiene dueño, no tiene tarea todavía,
// y el dueño es miembro activo del workspace). `requesterId` null = acción del
// sistema (cierre automático de la reunión), sin actor humano.
async function createDashboardTaskForTodo(todo, { projectId, workspaceId, tz, requesterId = null }) {
  const today = todayString(tz)
  const workDay = await ensureWorkDay(todo.ownerId, workspaceId, today)
  const task = await prisma.task.create({
    data: {
      description: todo.title,
      projectId,
      userId:      todo.ownerId,
      workDayId:   workDay.id,
      createdById: requesterId && requesterId !== todo.ownerId ? requesterId : null,
    },
  })
  await prisma.projectMeetingTodo.update({ where: { id: todo.id }, data: { taskId: task.id } })
  if (requesterId !== todo.ownerId) {
    const desc = todo.title.length > 60 ? todo.title.slice(0, 57) + '...' : todo.title
    await prisma.notification.create({
      data: {
        userId:      todo.ownerId,
        actorId:     requesterId,
        taskId:      task.id,
        projectId,
        workspaceId,
        type:        'TASK_MENTION',
        message:     `tenés una nueva tarea de una reunión: "${desc}"`,
      },
    })
  }
  return task
}

// Al cerrar una reunión, cualquier to-do con responsable que todavía no tenga tarea
// vinculada pasa automáticamente al dashboard de esa persona — sin esto, quedaría
// esperando a que alguien apriete un botón para enviarlo. Best-effort: un to-do con
// problemas (dueño desactivado, etc.) no debe frenar el cierre de la reunión.
async function sendOwnedTodosToDashboard(meeting) {
  const pending = (meeting.todos || []).filter(t => t.ownerId && !t.taskId)
  if (!pending.length) return

  const [workspace, activeMembers] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: meeting.workspaceId }, select: { timezone: true } }),
    prisma.workspaceMember.findMany({
      where:  { workspaceId: meeting.workspaceId, userId: { in: [...new Set(pending.map(t => t.ownerId))] }, active: true },
      select: { userId: true },
    }),
  ])
  const activeIds = new Set(activeMembers.map(m => m.userId))
  const tz = workspace?.timezone

  for (const todo of pending) {
    if (!activeIds.has(todo.ownerId)) continue
    try {
      await createDashboardTaskForTodo(todo, { projectId: meeting.projectId, workspaceId: meeting.workspaceId, tz, requesterId: null })
    } catch (e) {
      console.error('sendOwnedTodosToDashboard: no se pudo enviar el to-do', todo.id, e)
    }
  }
}

// Arranca el cronómetro de una reunión YA CARGADA (con `participants` incluidos —
// cada uno con `id`/`userId` escalares). Valida que ningún participante tenga ya una
// tarea IN_PROGRESS, crea una Task IN_PROGRESS + TaskSession por participante (su
// tiempo cuenta para `meeting.projectId`), vincula `participant.taskId`, y setea
// `meeting.startedAt`. Lanza errores TIPADOS (`err.status`) en vez de responder HTTP
// directo — así la puede reusar tanto projectMeetings.controller.js#startMeeting como
// calendar.controller.js#startMeetingFromEvent (POST /calendar/events/:id/start-meeting)
// sin duplicar la lógica ni el busy-check.
async function startMeetingParticipants(meeting, participants, { requesterId, workspaceId, tz }) {
  const participantIds = participants.map(p => p.userId)

  // Bloqueo: nadie del grupo puede tener una tarea en curso al iniciar.
  if (participantIds.length) {
    const busy = await prisma.task.findMany({
      where:   { userId: { in: participantIds }, status: 'IN_PROGRESS' },
      include: { user: { select: { name: true } } },
    })
    if (busy.length) {
      const names = [...new Set(busy.map(b => b.user.name))].join(', ')
      throw Object.assign(new Error(
        `No se puede iniciar: ${names} ${busy.length > 1 ? 'tienen' : 'tiene'} una tarea en curso. Debe pausarla o completarla primero.`
      ), { status: 409 })
    }
  }

  const now   = new Date()
  const today = todayString(tz)

  // Workdays por participante (idempotente — no es sensible dejarla creada aunque la
  // transacción de abajo falle).
  const workDays = {}
  for (const p of participants) {
    const wd = await ensureWorkDay(p.userId, workspaceId, today)
    if (wd) workDays[p.userId] = wd
  }

  // Todo o nada: si algún participante ya tiene una tarea en curso (condición de
  // carrera con el busy-check de arriba), se revierte todo lo creado en este loop en
  // vez de dejar tareas "fantasma" para los participantes anteriores.
  try {
    await prisma.$transaction(async (tx) => {
      for (const p of participants) {
        const workDay = workDays[p.userId]
        if (!workDay) continue
        const task = await tx.task.create({
          data: {
            description: typeLabel(meeting.type),
            projectId:   meeting.projectId,
            userId:      p.userId,
            workDayId:   workDay.id,
            status:      'IN_PROGRESS',
            startedAt:   now,
            createdById: p.userId !== requesterId ? requesterId : null,
          },
        })
        await tx.taskSession.create({ data: { taskId: task.id, startedAt: now } })
        await tx.projectMeetingParticipant.update({ where: { id: p.id }, data: { taskId: task.id } })
      }
      await tx.projectMeeting.update({
        where: { id: meeting.id },
        data:  { startedAt: now, endedAt: null, durationMins: null },
      })
    })
  } catch (e) {
    if (e.code === 'P2002') {
      throw Object.assign(new Error('Uno de los participantes acaba de iniciar otra tarea. Reintentá.'), { status: 409 })
    }
    throw e
  }
}

// Cierra una reunión YA CARGADA (con `participants` y `todos` incluidos, cada
// participante con `taskId`/`task.status`). No valida permisos ni pertenencia al
// workspace — eso lo hace el caller HTTP antes de llamarla. `actorName` presente =
// cierre manual (botón "Finalizar"); ausente = auto-cierre al completar todos los
// participantes su tarea.
async function closeMeeting(meeting, { actorName = null } = {}) {
  const now = new Date()
  const durationMins = Math.max(0, Math.round((now.getTime() - new Date(meeting.startedAt).getTime()) / 60000))

  // Completar las tareas de los participantes que sigan en curso (cerrar su sesión).
  const taskIds = meeting.participants.map(p => p.taskId).filter(Boolean)
  if (taskIds.length) {
    await prisma.taskSession.updateMany({ where: { taskId: { in: taskIds }, endedAt: null }, data: { endedAt: now } })
    await prisma.task.updateMany({
      where: { id: { in: taskIds }, status: 'IN_PROGRESS' },
      data:  { status: 'COMPLETED', completedAt: now, pausedAt: null },
    })
  }

  await prisma.projectMeeting.update({ where: { id: meeting.id }, data: { endedAt: now, durationMins } })

  await sendOwnedTodosToDashboard(meeting)

  const lead = actorName ? `${actorName} cerró la reunión` : 'Se cerró automáticamente la reunión'
  const titlePart = meeting.title ? ` "${meeting.title}"` : ''
  const n = meeting.participants.length
  setImmediate(() => {
    postProjectSystemMessage(
      meeting.projectId, meeting.workspaceId, SYSTEM_TYPES.MEETING_HELD,
      `🗓️ ${lead} ${meetingTypePhrase(meeting.type)}${titlePart} — ${durationLabel(durationMins)}, ${n} participante${n === 1 ? '' : 's'}.`
    ).catch(() => {})
  })

  return { endedAt: now, durationMins }
}

// Si la reunión está corriendo y TODOS los participantes con tarea vinculada ya la
// tienen COMPLETED (o no llegaron a tener taskId), la cierra sola — nadie tiene que
// entrar a la pestaña de Reuniones a apretar "Finalizar" a mano.
async function maybeAutoFinishMeeting(meetingId) {
  const meeting = await prisma.projectMeeting.findUnique({
    where: { id: meetingId },
    include: { participants: { include: { task: { select: { status: true } } } }, todos: true },
  })
  if (!meeting || !meeting.startedAt || meeting.endedAt || meeting.participants.length === 0) return
  const allDone = meeting.participants.every(p => !p.taskId || p.task?.status === 'COMPLETED')
  if (allDone) await closeMeeting(meeting)
}

module.exports = {
  durationLabel, meetingTypePhrase, typeLabel, closeMeeting, maybeAutoFinishMeeting,
  ensureWorkDay, createDashboardTaskForTodo, startMeetingParticipants,
}
