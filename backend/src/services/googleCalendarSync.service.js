const axios = require('axios')
const prisma = require('../lib/prisma')
const { getValidAccessToken } = require('./googleCalendarToken.service')
const { timeToMins, minsToTime } = require('./availability.service')
const { addDaysYMD } = require('./recurrence.service')

// v1 es solo "empujar": crear/actualizar/borrar el evento en el Google Calendar
// del ORGANIZADOR (calendario "primary"), con los demás participantes como
// `attendees` por email — Google les manda la invitación nativa sin que ellos
// necesiten conectar nada acá. Si el organizador no tiene GoogleCalendarConnection
// activa, todas las funciones son no-op silencioso (nunca bloquean la acción real
// sobre el CalendarEvent — mismo criterio log-and-swallow que cacheo de imágenes
// sociales / notificaciones de plataforma). "Traer" eventos/disponibilidad desde
// Google queda para una fase futura.
const CAL_BASE = 'https://www.googleapis.com/calendar/v3'

function endDateTime(date, startTime, durationMins) {
  const totalMins = timeToMins(startTime) + durationMins
  const dayOffset = Math.floor(totalMins / 1440)
  const endTime = minsToTime(totalMins % 1440)
  const endDate = dayOffset > 0 ? addDaysYMD(date, dayOffset) : date
  return { endDate, endTime }
}

// dateTime sin offset ("2026-09-21T14:00:00") + timeZone IANA aparte — Google
// Calendar interpreta el dateTime como hora local de esa zona, sin que tengamos
// que hacer aritmética de UTC nosotros (mismo espíritu que el resto del repo:
// fechas/horas de calendario como strings de pared, no como instantes UTC).
function buildEventPayload(event, timezone) {
  const { endDate, endTime } = endDateTime(event.date, event.startTime, event.durationMins)
  const descParts = []
  if (event.notes) descParts.push(event.notes)
  if (event.meetLink) descParts.push(`Meet: ${event.meetLink}`)
  const attendees = (event.participants || [])
    .filter(p => p.userId !== event.organizerId && p.user?.email)
    .map(p => ({ email: p.user.email }))

  return {
    summary:     event.title,
    description: descParts.length ? descParts.join('\n\n') : undefined,
    location:    event.meetLink || undefined,
    start: { dateTime: `${event.date}T${event.startTime}:00`, timeZone: timezone },
    end:   { dateTime: `${endDate}T${endTime}:00`, timeZone: timezone },
    attendees,
  }
}

function loadOrganizerConnection(organizerId, workspaceId) {
  return prisma.googleCalendarConnection.findUnique({
    where: { userId_workspaceId: { userId: organizerId, workspaceId } },
  })
}

function loadEventForSync(eventId) {
  return prisma.calendarEvent.findUnique({
    where:   { id: eventId },
    include: {
      workspace:    { select: { timezone: true } },
      participants: { include: { user: { select: { id: true, email: true } } } },
    },
  })
}

function logSyncError(action, err) {
  console.error(`[GoogleCalendarSync] ${action} falló:`, err.response?.data?.error?.message || err.message)
}

// Crea el evento en Google Calendar y guarda el id devuelto en googleEventId.
async function pushEvent(eventId) {
  try {
    const event = await loadEventForSync(eventId)
    if (!event) return
    const connection = await loadOrganizerConnection(event.organizerId, event.workspaceId)
    if (!connection || connection.status !== 'active') return

    const accessToken = await getValidAccessToken(connection)
    const payload = buildEventPayload(event, event.workspace.timezone)

    const { data } = await axios.post(
      `${CAL_BASE}/calendars/primary/events?sendUpdates=all`,
      payload,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    await prisma.calendarEvent.update({ where: { id: event.id }, data: { googleEventId: data.id } })
  } catch (err) {
    logSyncError('pushEvent', err)
  }
}

// Actualiza el evento espejado. Si todavía no existe (el organizador no tenía
// Google conectado al crearlo, y lo conectó después), lo crea recién ahora.
async function updateEvent(eventId) {
  try {
    const event = await loadEventForSync(eventId)
    if (!event) return
    if (!event.googleEventId) return pushEvent(eventId)

    const connection = await loadOrganizerConnection(event.organizerId, event.workspaceId)
    if (!connection || connection.status !== 'active') return

    const accessToken = await getValidAccessToken(connection)
    const payload = buildEventPayload(event, event.workspace.timezone)

    await axios.patch(
      `${CAL_BASE}/calendars/primary/events/${event.googleEventId}?sendUpdates=all`,
      payload,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
  } catch (err) {
    // El evento ya no existe del lado de Google (alguien lo borró a mano ahí) —
    // no es un error real, solo desvinculamos para que la próxima edición lo recree.
    if (err.response?.status === 404 || err.response?.status === 410) {
      await prisma.calendarEvent.update({ where: { id: eventId }, data: { googleEventId: null } }).catch(() => {})
      return
    }
    logSyncError('updateEvent', err)
  }
}

// Recibe el CalendarEvent YA CARGADO (con organizerId/workspaceId/googleEventId
// escalares — alcanza, no hace falta participants) porque se llama justo antes
// de borrarlo de la DB; después de borrado ya no se podría volver a consultar.
async function deleteEvent(event) {
  try {
    if (!event.googleEventId) return
    const connection = await loadOrganizerConnection(event.organizerId, event.workspaceId)
    if (!connection || connection.status !== 'active') return

    const accessToken = await getValidAccessToken(connection)
    await axios.delete(
      `${CAL_BASE}/calendars/primary/events/${event.googleEventId}?sendUpdates=all`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
  } catch (err) {
    if (err.response?.status === 404 || err.response?.status === 410) return
    logSyncError('deleteEvent', err)
  }
}

module.exports = {
  pushEvent, updateEvent, deleteEvent,
  // helpers puros, exportados para tests (mismo criterio que recurrence.service.js)
  endDateTime, buildEventPayload,
}
