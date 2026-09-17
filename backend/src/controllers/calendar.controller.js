const prisma = require('../lib/prisma')
const { emitTo } = require('../lib/socket')
const { canWrite } = require('../lib/projectAccess')
const { todayString } = require('../utils/dates')
const { getBusyBlocks, findCommonFreeSlots, DEFAULT_TASK_BLOCK_MINS } = require('../services/availability.service')
const { startMeetingParticipants } = require('../lib/projectMeetingLifecycle')

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const MIN_DURATION_MINS = 5
const MAX_DURATION_MINS = 8 * 60
const TITLE_MAX = 200
const MEET_LINK_MAX = 500

function parseUserIds(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(',')
  return [...new Set(list.map(Number).filter(n => Number.isInteger(n) && n > 0))]
}

// ─── Formatting ────────────────────────────────────────────────────────────

function formatParticipant(p) {
  return {
    userId:      p.userId,
    status:      p.status,
    respondedAt: p.respondedAt,
    user: p.user ? { id: p.user.id, name: p.user.name, avatar: p.user.avatar } : undefined,
  }
}

// Estado derivado (no persistido, ver CalendarEvent en schema.prisma): "confirmed"
// solo si TODOS aceptaron, "pending" si hay al menos un pending, "partial" si algún
// invitado rechazó pero el resto ya aceptó.
function confirmationStatus(participants) {
  if (participants.some(p => p.status === 'pending')) return 'pending'
  if (participants.some(p => p.status === 'declined')) return 'partial'
  return 'confirmed'
}

function formatEvent(e) {
  return {
    id:            e.id,
    title:         e.title,
    date:          e.date,
    startTime:     e.startTime,
    durationMins:  e.durationMins,
    projectId:     e.projectId,
    project:       e.project ? { id: e.project.id, name: e.project.name } : null,
    meetLink:      e.meetLink,
    notes:         e.notes,
    organizerId:   e.organizerId,
    organizer:     e.organizer ? { id: e.organizer.id, name: e.organizer.name, avatar: e.organizer.avatar } : undefined,
    realMeetingId: e.realMeetingId,
    confirmationStatus: confirmationStatus(e.participants || []),
    participants:  (e.participants || []).map(formatParticipant),
    createdAt:     e.createdAt,
    updatedAt:     e.updatedAt,
  }
}

const EVENT_INCLUDE = {
  organizer:    { select: { id: true, name: true, avatar: true } },
  project:      { select: { id: true, name: true } },
  participants: { include: { user: { select: { id: true, name: true, avatar: true } } }, orderBy: { createdAt: 'asc' } },
}

async function loadEvent(id, workspaceId) {
  return prisma.calendarEvent.findFirst({ where: { id: Number(id), workspaceId }, include: EVENT_INCLUDE })
}

function isParticipantOrOrganizer(event, userId) {
  return event.organizerId === userId || event.participants.some(p => p.userId === userId)
}

async function notifyInvitees(event, inviteeIds, actorId) {
  if (!inviteeIds.length) return
  await prisma.notification.createMany({
    data: inviteeIds.map(userId => ({
      userId, actorId, workspaceId: event.workspaceId, calendarEventId: event.id,
      type:    'CALENDAR_INVITE',
      message: `te invitó a "${event.title}" el ${event.date} a las ${event.startTime}`,
    })),
  })
  for (const userId of inviteeIds) {
    emitTo(`user:${userId}`, 'notification:new', { type: 'CALENDAR_INVITE', calendarEventId: event.id })
  }
}

async function notifyOne(event, targetUserId, actorId, message) {
  await prisma.notification.create({
    data: { userId: targetUserId, actorId, workspaceId: event.workspaceId, calendarEventId: event.id, type: 'CALENDAR_RESPONSE', message },
  })
  emitTo(`user:${targetUserId}`, 'notification:new', { type: 'CALENDAR_RESPONSE', calendarEventId: event.id })
}

// Solo miembros activos del workspace pueden ser invitados/quedarse como participantes.
async function filterActiveMembers(workspaceId, userIds) {
  if (!userIds.length) return []
  const rows = await prisma.workspaceMember.findMany({
    where:  { workspaceId, userId: { in: userIds }, active: true },
    select: { userId: true },
  })
  return rows.map(r => r.userId)
}

// ─── GET /api/calendar/events?from=&to= ────────────────────────────────────
// Eventos donde el usuario actual es organizador o participante (no se listan
// eventos ajenos — ver getAvailability para "disponibilidad" sin contenido).
async function listEvents(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const { from, to } = req.query
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) return res.status(400).json({ error: 'from/to inválidos (YYYY-MM-DD)' })

    const events = await prisma.calendarEvent.findMany({
      where: {
        workspaceId,
        date: { gte: from, lte: to },
        OR: [{ organizerId: userId }, { participants: { some: { userId } } }],
      },
      include: EVENT_INCLUDE,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    })
    res.json(events.map(formatEvent))
  } catch (err) { next(err) }
}

// ─── GET /api/calendar/availability?userIds=&from=&to= ─────────────────────
// Alimenta la vista semanal / el filtro multi-persona. No expone título/proyecto
// de eventos ajenos a quien no es organizador/participante de ese evento puntual
// — solo franjas ocupadas/tentativas, para poder comparar disponibilidad sin
// filtrar el contenido de reuniones de terceros. Una tarea (`kind:'task'`) es
// siempre de una sola persona, así que solo se revela en la propia columna del
// requester; un `calendar_event` puede compartirse — se revela en CUALQUIER
// columna si el requester es organizador/participante de ESE evento puntual
// (no solo en su propia columna), para que comparar disponibilidad con un
// invitado no le esconda el título de la reunión que ambos comparten.
async function getAvailability(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const requesterId = req.user.userId
    const userIds = parseUserIds(req.query.userIds)
    const { from, to } = req.query
    if (!userIds.length) return res.status(400).json({ error: 'userIds requerido' })
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) return res.status(400).json({ error: 'from/to inválidos (YYYY-MM-DD)' })

    const busy = await getBusyBlocks({ workspaceId, userIds, fromDate: from, toDate: to })

    const myEventIds = new Set(
      (await prisma.calendarEventParticipant.findMany({
        where:  { userId: requesterId, event: { workspaceId, date: { gte: from, lte: to } } },
        select: { eventId: true },
      })).map(p => p.eventId)
    )

    const sanitized = {}
    for (const [uid, state] of Object.entries(busy)) {
      const isSelf = Number(uid) === requesterId
      sanitized[uid] = {
        workStart:  state.workStart,
        workEnd:    state.workEnd,
        fullDayOff: [...state.fullDayOff],
        blocks: state.blocks.map((b) => {
          const revealed = isSelf || (b.kind === 'calendar_event' && myEventIds.has(b.refId))
          return revealed ? b : { date: b.date, start: b.start, end: b.end, kind: b.kind, tentative: b.tentative }
        }),
      }
    }
    res.json(sanitized)
  } catch (err) { next(err) }
}

// ─── POST /api/calendar/availability/common-free-slots ─────────────────────
async function commonFreeSlots(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userIds = parseUserIds(req.body.userIds)
    const { date } = req.body
    if (!userIds.length) return res.status(400).json({ error: 'userIds requerido' })
    if (!DATE_RE.test(date || '')) return res.status(400).json({ error: 'Fecha inválida' })
    const durationMins = Number.isInteger(Number(req.body.durationMins)) && req.body.durationMins > 0
      ? Number(req.body.durationMins)
      : DEFAULT_TASK_BLOCK_MINS

    const slots = await findCommonFreeSlots({ workspaceId, userIds, date, durationMins })
    res.json({ slots })
  } catch (err) { next(err) }
}

// ─── POST /api/calendar/events ──────────────────────────────────────────────
async function createEvent(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const organizerId = req.user.userId
    const { title, date, startTime, meetLink, notes, participantIds } = req.body

    if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Falta el título' })
    if (!DATE_RE.test(date || '')) return res.status(400).json({ error: 'Fecha inválida' })
    if (!TIME_RE.test(startTime || '')) return res.status(400).json({ error: 'Hora inválida' })
    const durationMins = Number(req.body.durationMins) || 30
    if (!Number.isInteger(durationMins) || durationMins < MIN_DURATION_MINS || durationMins > MAX_DURATION_MINS) {
      return res.status(400).json({ error: 'Duración inválida' })
    }

    let projectId = null
    if (req.body.projectId != null) {
      const p = await prisma.project.findFirst({ where: { id: Number(req.body.projectId), workspaceId }, select: { id: true } })
      if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
      projectId = p.id
    }

    const requestedIds = parseUserIds(participantIds).filter(id => id !== organizerId)
    const inviteeIds = await filterActiveMembers(workspaceId, requestedIds)

    const event = await prisma.calendarEvent.create({
      data: {
        workspaceId, organizerId, projectId,
        title:     title.trim().slice(0, TITLE_MAX),
        date,
        startTime,
        durationMins,
        meetLink: typeof meetLink === 'string' && meetLink.trim() ? meetLink.trim().slice(0, MEET_LINK_MAX) : null,
        notes:    typeof notes === 'string' && notes.trim() ? notes.trim() : null,
        participants: {
          create: [
            { workspaceId, userId: organizerId, status: 'accepted', respondedAt: new Date() },
            ...inviteeIds.map(userId => ({ workspaceId, userId, status: 'pending' })),
          ],
        },
      },
      include: EVENT_INCLUDE,
    })

    await notifyInvitees(event, inviteeIds, organizerId)
    emitTo(`workspace:${workspaceId}`, 'calendar:event:created', { event: formatEvent(event) })
    res.status(201).json(formatEvent(event))
  } catch (err) { next(err) }
}

// ─── GET /api/calendar/events/:id ───────────────────────────────────────────
async function getEvent(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const event = await loadEvent(req.params.id, workspaceId)
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' })
    if (!isParticipantOrOrganizer(event, req.user.userId)) return res.status(403).json({ error: 'No tenés acceso a este evento' })
    res.json(formatEvent(event))
  } catch (err) { next(err) }
}

// ─── PATCH /api/calendar/events/:id ─────────────────────────────────────────
// Solo el organizador, y solo mientras no se haya iniciado la reunión real
// (realMeetingId null). Si cambia fecha/hora/duración, la aceptación de los
// invitados era para otro horario — se resetean a "pending" y se re-notifica.
async function updateEvent(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const organizerId = req.user.userId
    const existing = await loadEvent(req.params.id, workspaceId)
    if (!existing) return res.status(404).json({ error: 'Evento no encontrado' })
    if (existing.organizerId !== organizerId) return res.status(403).json({ error: 'Solo el organizador puede editar el evento' })
    if (existing.realMeetingId) return res.status(409).json({ error: 'La reunión ya se inició, no se puede editar' })

    const { title, date, startTime, meetLink, notes, participantIds } = req.body
    const data = {}
    let scheduleChanged = false

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Título inválido' })
      data.title = title.trim().slice(0, TITLE_MAX)
    }
    if (date !== undefined) {
      if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Fecha inválida' })
      if (date !== existing.date) scheduleChanged = true
      data.date = date
    }
    if (startTime !== undefined) {
      if (!TIME_RE.test(startTime)) return res.status(400).json({ error: 'Hora inválida' })
      if (startTime !== existing.startTime) scheduleChanged = true
      data.startTime = startTime
    }
    if (req.body.durationMins !== undefined) {
      const durationMins = Number(req.body.durationMins)
      if (!Number.isInteger(durationMins) || durationMins < MIN_DURATION_MINS || durationMins > MAX_DURATION_MINS) {
        return res.status(400).json({ error: 'Duración inválida' })
      }
      if (durationMins !== existing.durationMins) scheduleChanged = true
      data.durationMins = durationMins
    }
    if (req.body.projectId !== undefined) {
      if (req.body.projectId === null) {
        data.projectId = null
      } else {
        const p = await prisma.project.findFirst({ where: { id: Number(req.body.projectId), workspaceId }, select: { id: true } })
        if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
        data.projectId = p.id
      }
    }
    if (meetLink !== undefined) data.meetLink = typeof meetLink === 'string' && meetLink.trim() ? meetLink.trim().slice(0, MEET_LINK_MAX) : null
    if (notes !== undefined) data.notes = typeof notes === 'string' && notes.trim() ? notes.trim() : null

    await prisma.calendarEvent.update({ where: { id: existing.id }, data })

    if (Array.isArray(participantIds)) {
      const requestedIds = parseUserIds(participantIds).filter(id => id !== existing.organizerId)
      const currentIds = new Set(existing.participants.filter(p => p.userId !== existing.organizerId).map(p => p.userId))
      const activeRequested = await filterActiveMembers(workspaceId, requestedIds)
      const newIds = new Set(activeRequested)

      const toRemove = [...currentIds].filter(id => !newIds.has(id))
      const toAdd    = [...newIds].filter(id => !currentIds.has(id))

      if (toRemove.length) {
        await prisma.calendarEventParticipant.deleteMany({ where: { eventId: existing.id, userId: { in: toRemove } } })
      }
      if (toAdd.length) {
        await prisma.calendarEventParticipant.createMany({
          data: toAdd.map(userId => ({ eventId: existing.id, workspaceId, userId, status: 'pending' })),
          skipDuplicates: true,
        })
        const fresh = await loadEvent(existing.id, workspaceId)
        await notifyInvitees(fresh, toAdd, organizerId)
      }
    }

    if (scheduleChanged) {
      const inviteeIds = existing.participants.filter(p => p.userId !== existing.organizerId).map(p => p.userId)
      if (inviteeIds.length) {
        await prisma.calendarEventParticipant.updateMany({
          where: { eventId: existing.id, userId: { in: inviteeIds } },
          data:  { status: 'pending', respondedAt: null },
        })
        const fresh = await loadEvent(existing.id, workspaceId)
        await notifyInvitees(fresh, inviteeIds, organizerId)
      }
    }

    const fresh = await loadEvent(existing.id, workspaceId)
    emitTo(`workspace:${workspaceId}`, 'calendar:event:updated', { event: formatEvent(fresh) })
    res.json(formatEvent(fresh))
  } catch (err) { next(err) }
}

// ─── DELETE /api/calendar/events/:id ────────────────────────────────────────
async function deleteEvent(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const organizerId = req.user.userId
    const existing = await loadEvent(req.params.id, workspaceId)
    if (!existing) return res.status(404).json({ error: 'Evento no encontrado' })
    if (existing.organizerId !== organizerId) return res.status(403).json({ error: 'Solo el organizador puede cancelar el evento' })
    if (existing.realMeetingId) return res.status(409).json({ error: 'La reunión ya se inició, cancelala desde el proyecto' })

    const invitees = existing.participants.filter(p => p.userId !== organizerId)
    await prisma.calendarEvent.delete({ where: { id: existing.id } })

    for (const p of invitees) {
      await prisma.notification.create({
        data: {
          userId: p.userId, actorId: organizerId, workspaceId,
          type:    'CALENDAR_RESPONSE',
          message: `canceló la reunión "${existing.title}" del ${existing.date} a las ${existing.startTime}`,
        },
      })
      emitTo(`user:${p.userId}`, 'notification:new', { type: 'CALENDAR_RESPONSE' })
    }
    emitTo(`workspace:${workspaceId}`, 'calendar:event:deleted', { id: existing.id })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ─── POST /api/calendar/events/:id/respond ──────────────────────────────────
async function respondEvent(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const { status } = req.body
    if (!['accepted', 'declined'].includes(status)) return res.status(400).json({ error: 'status inválido' })

    const existing = await loadEvent(req.params.id, workspaceId)
    if (!existing) return res.status(404).json({ error: 'Evento no encontrado' })
    if (existing.realMeetingId) return res.status(409).json({ error: 'La reunión ya se inició' })
    if (existing.organizerId === userId) return res.status(400).json({ error: 'El organizador ya está confirmado' })

    const participant = existing.participants.find(p => p.userId === userId)
    if (!participant) return res.status(403).json({ error: 'No fuiste invitado a este evento' })

    await prisma.calendarEventParticipant.update({
      where: { id: participant.id },
      data:  { status, respondedAt: new Date() },
    })

    const verb = status === 'accepted' ? 'aceptó' : 'rechazó'
    await notifyOne(existing, existing.organizerId, userId, `${verb} tu invitación a "${existing.title}"`)

    const fresh = await loadEvent(existing.id, workspaceId)
    emitTo(`workspace:${workspaceId}`, 'calendar:event:responded', { event: formatEvent(fresh) })
    res.json(formatEvent(fresh))
  } catch (err) { next(err) }
}

// ─── POST /api/calendar/events/:id/start-meeting ────────────────────────────
// Conecta con el sistema de reuniones existente: crea la ProjectMeeting real +
// un ProjectMeetingParticipant por cada invitado que ACEPTÓ (los pending/declined
// no se llevan), y reusa startMeetingParticipants (mismo busy-check y transacción
// que projectMeetings.controller.js#startMeeting, sin reescribirla).
async function startMeetingFromEvent(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const requesterId = req.user.userId

    const existing = await loadEvent(req.params.id, workspaceId)
    if (!existing) return res.status(404).json({ error: 'Evento no encontrado' })
    if (!existing.projectId) return res.status(400).json({ error: 'Este evento no tiene un proyecto asociado' })
    if (existing.realMeetingId) return res.status(409).json({ error: 'La reunión ya fue iniciada' })
    if (!(await canWrite(req, existing.projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const acceptedUserIds = existing.participants.filter(p => p.status === 'accepted').map(p => p.userId)
    if (!acceptedUserIds.length) return res.status(400).json({ error: 'No hay participantes que hayan aceptado la invitación' })

    const meeting = await prisma.projectMeeting.create({
      data: { projectId: existing.projectId, workspaceId, date: todayString(tz), type: 'internal', title: existing.title },
    })
    await prisma.projectMeetingParticipant.createMany({
      data: acceptedUserIds.map(userId => ({ meetingId: meeting.id, workspaceId, userId })),
      skipDuplicates: true,
    })
    const participants = await prisma.projectMeetingParticipant.findMany({ where: { meetingId: meeting.id } })

    try {
      await startMeetingParticipants(meeting, participants, { requesterId, workspaceId, tz })
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message })
      throw e
    }

    await prisma.calendarEvent.update({ where: { id: existing.id }, data: { realMeetingId: meeting.id } })

    const freshEvent = await loadEvent(existing.id, workspaceId)
    emitTo(`workspace:${workspaceId}`, 'calendar:event:updated', { event: formatEvent(freshEvent) })
    res.json({ event: formatEvent(freshEvent), meetingId: meeting.id })
  } catch (err) { next(err) }
}

module.exports = {
  listEvents, getAvailability, commonFreeSlots,
  createEvent, getEvent, updateEvent, deleteEvent,
  respondEvent, startMeetingFromEvent,
}
