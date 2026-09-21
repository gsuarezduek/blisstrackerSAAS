const prisma = require('./prisma')
const { todayString } = require('../utils/dates')
const { ensureWorkDay } = require('./projectMeetingLifecycle')

// Task "reserva" del dashboard vinculada a un CalendarEventParticipant (ver
// CalendarEventParticipant.taskId en schema.prisma). Se crea al ACEPTAR la
// invitación (el organizador queda "accepted" desde que crea el evento, así que
// la suya se crea ahí mismo) y se borra si el participante rechaza, el evento se
// cancela/reprograma, o arranca la reunión real — pero NUNCA si ya la empezó o
// completó (misma regla que ProjectMeetingTodo/EOSTodo: una tarea en curso no se toca).

// Crea la Task de un participante que acaba de aceptar, si todavía no tiene una.
// Requiere `event.projectId` (obligatorio desde ScheduleEventModal/createEvent) —
// sin proyecto no hay dónde crear la Task, así que no hace nada.
async function createTaskForParticipant(event, participant, { tz }) {
  if (participant.taskId || !event.projectId) return null
  const today = todayString(tz)
  const workDay = await ensureWorkDay(participant.userId, event.workspaceId, today)
  const task = await prisma.task.create({
    data: {
      description:  event.title,
      projectId:    event.projectId,
      userId:       participant.userId,
      workDayId:    workDay.id,
      createdById:  event.organizerId !== participant.userId ? event.organizerId : null,
      scheduledFor: event.date > today ? event.date : null,
      scheduledTime: event.startTime,
      scheduledDurationMins: event.durationMins,
    },
  })
  await prisma.calendarEventParticipant.update({ where: { id: participant.id }, data: { taskId: task.id } })
  return task
}

// Sincroniza descripción/fecha/hora de la Task ya vinculada de un participante que
// NO tuvo que volver a aceptar (típicamente el organizador) tras editar el evento —
// solo si sigue PENDING; si ya la inició/completó se deja como quedó.
async function syncTaskFields(participant, event, { tz }) {
  if (!participant.taskId) return
  const task = await prisma.task.findUnique({ where: { id: participant.taskId }, select: { id: true, status: true } })
  if (!task || task.status !== 'PENDING') return
  const today = todayString(tz)
  await prisma.task.update({
    where: { id: task.id },
    data: {
      description:   event.title,
      projectId:     event.projectId,
      scheduledFor:  event.date > today ? event.date : null,
      scheduledTime: event.startTime,
      scheduledDurationMins: event.durationMins,
    },
  })
}

// Borra la Task vinculada de un participante SOLO si sigue PENDING (no tocar si ya
// la empezó/completó). Usado al rechazar, al cancelar el evento, al reprogramarlo
// (resetea aceptaciones a pending) o al reemplazarla por la tarea real de "Iniciar
// reunión". `Notification` no cascadea sobre Task — se borran antes (mismo patrón
// que tasks/lifecycle.controller.js#remove).
async function removeTaskIfPending(participant) {
  if (!participant.taskId) return
  const task = await prisma.task.findUnique({ where: { id: participant.taskId }, select: { id: true, status: true } })
  if (!task || task.status !== 'PENDING') return
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { taskId: task.id } }),
    prisma.task.delete({ where: { id: task.id } }),
  ])
}

module.exports = { createTaskForParticipant, syncTaskFields, removeTaskIfPending }
