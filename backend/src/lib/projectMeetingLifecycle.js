const prisma = require('./prisma')
const { SYSTEM_TYPES, postProjectSystemMessage } = require('./chatSystemMessage')

// "45 min" o "1h 20min" — para el mensaje de sistema del chat al cerrar una reunión.
function durationLabel(mins) {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

const meetingTypePhrase = (t) => (t === 'client' ? 'con el cliente' : 'interna')

// Cierra una reunión YA CARGADA (con `participants` incluido, cada uno con `taskId`
// y `task.status`). No valida permisos ni pertenencia al workspace — eso lo hace
// el caller HTTP antes de llamarla. `actorName` presente = cierre manual (botón
// "Finalizar"); ausente = auto-cierre al completar todos los participantes su tarea.
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
    include: { participants: { include: { task: { select: { status: true } } } } },
  })
  if (!meeting || !meeting.startedAt || meeting.endedAt || meeting.participants.length === 0) return
  const allDone = meeting.participants.every(p => !p.taskId || p.task?.status === 'COMPLETED')
  if (allDone) await closeMeeting(meeting)
}

module.exports = { durationLabel, meetingTypePhrase, closeMeeting, maybeAutoFinishMeeting }
