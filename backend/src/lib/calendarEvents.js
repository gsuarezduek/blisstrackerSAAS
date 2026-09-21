const prisma = require('./prisma')
const { emitTo } = require('./socket')

// Helpers/constantes compartidos entre calendar.controller.js y
// calendarEventRecurrence.service.js (series recurrentes) — extraídos para que
// generar una ocurrencia materializada use exactamente el mismo formato/reglas
// de notificación que crear un evento suelto desde el controller.

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

function formatParticipant(p) {
  return {
    userId:      p.userId,
    status:      p.status,
    respondedAt: p.respondedAt,
    taskId:      p.taskId,
    user: p.user ? { id: p.user.id, name: p.user.name, avatar: p.user.avatar } : undefined,
  }
}

// Estado derivado (no persistido): "confirmed" solo si TODOS aceptaron, "pending"
// si hay al menos un pending, "partial" si algún invitado rechazó pero el resto ya aceptó.
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
    recurrenceId:  e.recurrenceId,
    confirmationStatus: confirmationStatus(e.participants || []),
    participants:  (e.participants || []).map(formatParticipant),
    createdAt:     e.createdAt,
    updatedAt:     e.updatedAt,
  }
}

function formatRecurrence(rec) {
  return {
    id:           rec.id,
    title:        rec.title,
    projectId:    rec.projectId,
    startTime:    rec.startTime,
    durationMins: rec.durationMins,
    meetLink:     rec.meetLink,
    notes:        rec.notes,
    participantIds: JSON.parse(rec.participantIds || '[]'),
    autoAcceptUserIds: JSON.parse(rec.autoAcceptUserIds || '[]'),
    frequency:    rec.frequency,
    weekdays:     JSON.parse(rec.weekdays || '[]'),
    dayOfMonth:   rec.dayOfMonth,
    month:        rec.month,
    startDate:    rec.startDate,
    endDate:      rec.endDate,
    active:       rec.active,
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

module.exports = {
  DATE_RE, TIME_RE, MIN_DURATION_MINS, MAX_DURATION_MINS, TITLE_MAX, MEET_LINK_MAX,
  parseUserIds, formatParticipant, confirmationStatus, formatEvent, formatRecurrence,
  EVENT_INCLUDE, loadEvent, isParticipantOrOrganizer,
  notifyInvitees, notifyOne, filterActiveMembers,
}
