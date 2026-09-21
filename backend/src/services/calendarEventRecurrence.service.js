const prisma = require('../lib/prisma')
const { emitTo } = require('../lib/socket')
const { nextOccurrenceOnOrAfter, addDaysYMD, buildRecurrenceParams } = require('./recurrence.service')
const { EVENT_INCLUDE, formatEvent, notifyInvitees, filterActiveMembers } = require('../lib/calendarEvents')
const { createTaskForParticipant } = require('../lib/calendarEventTasks')
const googleCalendarSync = require('./googleCalendarSync.service')

// Serie de reuniones recurrentes de Calendario (CalendarEventRecurrence): cada
// ocurrencia visible es una fila real de CalendarEvent (con sus propios
// participantes/aceptaciones/Task "reserva" — ver calendarEventTasks.js), igual
// que un evento suelto. Se materializan de forma perezosa cuando el rango pedido
// (semana/mes) las necesita — mismo espíritu que recurrence.service.js con las
// tareas recurrentes, pero acá impulsado por el rango de fechas que se está
// mirando (no por "una por adelantado") porque el calendario pagina por rango,
// no por "hoy". Reusa las funciones de fecha puras de recurrence.service.js:
// son genéricas (no dependen de Task).

// Todas las fechas de ocurrencia de `rec` dentro de [from, to] (inclusive).
function occurrenceDatesInRange(rec, from, to) {
  const dates = []
  const lower = rec.startDate > from ? rec.startDate : from
  const upper = rec.endDate && rec.endDate < to ? rec.endDate : to
  if (lower > upper) return dates
  let cursor = nextOccurrenceOnOrAfter(rec, lower)
  while (cursor && cursor <= upper) {
    dates.push(cursor)
    cursor = nextOccurrenceOnOrAfter(rec, addDaysYMD(cursor, 1))
  }
  return dates
}

// Crea la ocurrencia (CalendarEvent + participantes) de `rec` para `date` — mismo
// criterio de creación que calendar.controller.js#createEvent: el organizador
// queda "accepted" de una (con su Task "reserva" ya creada), los demás "pending"
// y notificados.
async function materializeOccurrence(rec, date, tz) {
  const requestedIds = JSON.parse(rec.participantIds || '[]').filter(id => id !== rec.organizerId)
  const inviteeIds = await filterActiveMembers(rec.workspaceId, requestedIds)
  // Participantes que ya aceptaron "toda la serie" (ver respondEventAcceptSeries
  // en calendar.controller.js) — sus ocurrencias nuevas nacen ya aceptadas, sin
  // tener que confirmar semana por semana.
  const autoAccept = new Set(JSON.parse(rec.autoAcceptUserIds || '[]'))
  const now = new Date()

  let event
  try {
    event = await prisma.calendarEvent.create({
      data: {
        workspaceId: rec.workspaceId, organizerId: rec.organizerId, projectId: rec.projectId,
        title: rec.title, date, startTime: rec.startTime, durationMins: rec.durationMins,
        meetLink: rec.meetLink, notes: rec.notes, recurrenceId: rec.id,
        participants: {
          create: [
            { workspaceId: rec.workspaceId, userId: rec.organizerId, status: 'accepted', respondedAt: new Date() },
            ...inviteeIds.map(userId => ({
              workspaceId: rec.workspaceId, userId,
              status: autoAccept.has(userId) ? 'accepted' : 'pending',
              respondedAt: autoAccept.has(userId) ? now : null,
            })),
          ],
        },
      },
      include: EVENT_INCLUDE,
    })
  } catch (err) {
    // Condición de carrera: dos requests (ej. listEvents + getAvailability, en
    // paralelo) intentan materializar la misma ocurrencia — el
    // @@unique([recurrenceId, date]) la rechaza, devolvemos la que ya existe.
    if (err.code === 'P2002') {
      return prisma.calendarEvent.findFirst({ where: { recurrenceId: rec.id, date }, include: EVENT_INCLUDE })
    }
    throw err
  }

  const organizerParticipant = event.participants.find(p => p.userId === rec.organizerId)
  if (organizerParticipant) await createTaskForParticipant(event, organizerParticipant, { tz })

  // Los que auto-aceptaron ya tienen su lugar reservado — se les crea la Task
  // "reserva" directo, sin invitación (no hace falta que respondan nada).
  const autoAcceptedInvitees = event.participants.filter(p => p.userId !== rec.organizerId && autoAccept.has(p.userId))
  for (const p of autoAcceptedInvitees) await createTaskForParticipant(event, p, { tz })

  const pendingInviteeIds = inviteeIds.filter(id => !autoAccept.has(id))
  await notifyInvitees(event, pendingInviteeIds, rec.organizerId)
  emitTo(`workspace:${rec.workspaceId}`, 'calendar:event:created', { event: formatEvent(event) })
  setImmediate(() => googleCalendarSync.pushEvent(event.id).catch(() => {}))
  return event
}

// Genera (si faltan) las ocurrencias de todas las series activas del workspace
// dentro de [from, to]. Se llama al principio de listEvents/getAvailability —
// idempotente, seguro de llamar en paralelo (ver P2002 arriba).
async function ensureOccurrences({ workspaceId, from, to, tz }) {
  const recs = await prisma.calendarEventRecurrence.findMany({
    where: {
      workspaceId, active: true, startDate: { lte: to },
      OR: [{ endDate: null }, { endDate: { gte: from } }],
    },
  })
  if (!recs.length) return

  for (const rec of recs) {
    const dates = occurrenceDatesInRange(rec, from, to)
    if (!dates.length) continue

    const [existing, exceptions] = await Promise.all([
      prisma.calendarEvent.findMany({ where: { recurrenceId: rec.id, date: { in: dates } }, select: { date: true } }),
      prisma.calendarEventException.findMany({ where: { recurrenceId: rec.id, date: { in: dates } }, select: { date: true } }),
    ])
    const skip = new Set([...existing.map(e => e.date), ...exceptions.map(e => e.date)])
    const toCreate = dates.filter(d => !skip.has(d))
    for (const date of toCreate) await materializeOccurrence(rec, date, tz)
  }
}

// Primera ocurrencia de una serie recién creada (para devolverla ya mismo en la
// respuesta del POST, sin esperar a que una vista la pida por rango).
function firstOccurrenceDate(rec) {
  return nextOccurrenceOnOrAfter(rec, rec.startDate)
}

module.exports = {
  occurrenceDatesInRange, materializeOccurrence, ensureOccurrences, firstOccurrenceDate,
  buildRecurrenceParams, nextOccurrenceOnOrAfter, addDaysYMD,
}
