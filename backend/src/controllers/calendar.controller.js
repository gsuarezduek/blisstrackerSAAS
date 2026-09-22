const prisma = require('../lib/prisma')
const { emitTo } = require('../lib/socket')
const { canWrite } = require('../lib/projectAccess')
const { todayString } = require('../utils/dates')
const { getBusyBlocks, findCommonFreeSlots, DEFAULT_TASK_BLOCK_MINS } = require('../services/availability.service')
const { startMeetingParticipants } = require('../lib/projectMeetingLifecycle')
const { createTaskForParticipant, syncTaskFields, removeTaskIfPending } = require('../lib/calendarEventTasks')
const googleCalendarSync = require('../services/googleCalendarSync.service')
const {
  DATE_RE, TIME_RE, MIN_DURATION_MINS, MAX_DURATION_MINS, TITLE_MAX, MEET_LINK_MAX,
  parseUserIds, formatEvent, formatRecurrence, EVENT_INCLUDE, loadEvent,
  notifyInvitees, notifyOne, filterActiveMembers,
} = require('../lib/calendarEvents')
const {
  ensureOccurrences, materializeOccurrence, firstOccurrenceDate, buildRecurrenceParams, addDaysYMD,
} = require('../services/calendarEventRecurrence.service')

// Rango máximo que se puede pedir de una sola vez (protege contra generar/
// notificar de más si alguien pide un rango absurdo — las vistas reales piden
// como mucho un mes).
const MAX_RANGE_DAYS = 370

function rangeTooWide(from, to) {
  return (new Date(to) - new Date(from)) / 86400000 > MAX_RANGE_DAYS
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
    if (rangeTooWide(from, to)) return res.status(400).json({ error: 'Rango de fechas demasiado amplio' })

    await ensureOccurrences({ workspaceId, from, to, tz: req.workspace.timezone })

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
// Alimenta la vista semanal / el filtro multi-persona. Un `calendar_event`
// (reunión) es visible con su título/proyecto para cualquier miembro del
// workspace, sea o no organizador/participante — mismo criterio "equipo =
// etiqueta, no barrera" que ya rige proyectos/tareas: cualquiera puede ver qué
// reunión ocupa el hueco de otra persona y abrir su detalle (participantes,
// proyecto, link) desde ahí. Una tarea (`kind:'task'`) sigue siendo personal —
// solo se revela con título en la propia columna del requester.
async function getAvailability(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const requesterId = req.user.userId
    const userIds = parseUserIds(req.query.userIds)
    const { from, to } = req.query
    if (!userIds.length) return res.status(400).json({ error: 'userIds requerido' })
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) return res.status(400).json({ error: 'from/to inválidos (YYYY-MM-DD)' })
    if (rangeTooWide(from, to)) return res.status(400).json({ error: 'Rango de fechas demasiado amplio' })

    // Corre también acá (no solo en listEvents): esta y listEvents se piden en
    // paralelo desde el frontend, así que ninguna puede asumir que la otra ya
    // materializó las ocurrencias del rango (ensureOccurrences es idempotente).
    await ensureOccurrences({ workspaceId, from, to, tz: req.workspace.timezone })

    const busy = await getBusyBlocks({ workspaceId, userIds, fromDate: from, toDate: to })

    const sanitized = {}
    for (const [uid, state] of Object.entries(busy)) {
      const isSelf = Number(uid) === requesterId
      sanitized[uid] = {
        workStart:  state.workStart,
        workEnd:    state.workEnd,
        fullDayOff: [...state.fullDayOff],
        blocks: state.blocks.map((b) => {
          const revealed = isSelf || b.kind === 'calendar_event'
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

// Valida los campos comunes a un evento suelto o a la plantilla de una serie.
// Devuelve { title, durationMins, meetLink, notes } o lanza { status, error }.
function validateEventFields(body) {
  const { title, meetLink, notes } = body
  if (typeof title !== 'string' || !title.trim()) throw { status: 400, error: 'Falta el título' }
  const durationMins = Number(body.durationMins) || 30
  if (!Number.isInteger(durationMins) || durationMins < MIN_DURATION_MINS || durationMins > MAX_DURATION_MINS) {
    throw { status: 400, error: 'Duración inválida' }
  }
  return {
    title: title.trim().slice(0, TITLE_MAX),
    durationMins,
    meetLink: typeof meetLink === 'string' && meetLink.trim() ? meetLink.trim().slice(0, MEET_LINK_MAX) : null,
    notes:    typeof notes === 'string' && notes.trim() ? notes.trim() : null,
  }
}

// ─── POST /api/calendar/events ──────────────────────────────────────────────
// Con `recurrence` en el body: crea una CalendarEventRecurrence (serie) en vez
// de un evento suelto — ver calendarEventRecurrence.service.js. `date` actúa
// como la primera ocurrencia posible (startDate de la serie); para
// monthly/annual el día (y mes) se derivan de esa fecha, no de un picker aparte.
async function createEvent(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const organizerId = req.user.userId
    const { date, startTime, participantIds } = req.body

    let fields
    try { fields = validateEventFields(req.body) } catch (e) { return res.status(e.status).json({ error: e.error }) }
    if (!DATE_RE.test(date || '')) return res.status(400).json({ error: 'Fecha inválida' })
    if (!TIME_RE.test(startTime || '')) return res.status(400).json({ error: 'Hora inválida' })

    // Proyecto obligatorio: sin él no hay dónde crear la Task "reserva" que aparece
    // en el dashboard de cada participante que acepte (ver lib/calendarEventTasks.js).
    if (req.body.projectId == null) return res.status(400).json({ error: 'Elegí un proyecto para la reunión' })
    const project = await prisma.project.findFirst({ where: { id: Number(req.body.projectId), workspaceId }, select: { id: true } })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    const projectId = project.id

    const requestedIds = parseUserIds(participantIds).filter(id => id !== organizerId)
    const inviteeIds = await filterActiveMembers(workspaceId, requestedIds)

    // ── Serie recurrente ───────────────────────────────────────────────────
    if (req.body.recurrence) {
      const { frequency, weekdays, endDate } = req.body.recurrence
      if (!['daily', 'weekly', 'monthly', 'annual'].includes(frequency)) return res.status(400).json({ error: 'Frecuencia inválida' })
      if (endDate !== undefined && endDate !== null && endDate !== '') {
        if (!DATE_RE.test(endDate)) return res.status(400).json({ error: 'Fecha de fin inválida' })
        if (endDate < date) return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la primera ocurrencia' })
      }
      const params = buildRecurrenceParams({ frequency, weekdays, startDate: date })

      const rec = await prisma.calendarEventRecurrence.create({
        data: {
          workspaceId, organizerId, projectId,
          title: fields.title, meetLink: fields.meetLink, notes: fields.notes,
          startTime, durationMins: fields.durationMins,
          participantIds: JSON.stringify(inviteeIds),
          frequency,
          weekdays:   params.weekdays,
          dayOfMonth: params.dayOfMonth,
          month:      params.month,
          startDate:  date,
          endDate:    endDate || null,
        },
      })

      const firstDate = firstOccurrenceDate(rec)
      const firstEvent = firstDate ? await materializeOccurrence(rec, firstDate, req.workspace.timezone) : null
      return res.status(201).json({ recurrence: formatRecurrence(rec), event: firstEvent ? formatEvent(firstEvent) : null })
    }

    // ── Evento suelto ──────────────────────────────────────────────────────
    const event = await prisma.calendarEvent.create({
      data: {
        workspaceId, organizerId, projectId,
        title: fields.title, date, startTime, durationMins: fields.durationMins,
        meetLink: fields.meetLink, notes: fields.notes,
        participants: {
          create: [
            { workspaceId, userId: organizerId, status: 'accepted', respondedAt: new Date() },
            ...inviteeIds.map(userId => ({ workspaceId, userId, status: 'pending' })),
          ],
        },
      },
      include: EVENT_INCLUDE,
    })

    // El organizador ya queda "accepted" desde la creación — le aparece la tarea
    // "reserva" de una. Los invitados la reciben recién al aceptar (ver respondEvent).
    const organizerParticipant = event.participants.find(p => p.userId === organizerId)
    if (organizerParticipant) {
      await createTaskForParticipant(event, organizerParticipant, { tz: req.workspace.timezone })
    }

    await notifyInvitees(event, inviteeIds, organizerId)
    const fresh = await loadEvent(event.id, workspaceId)
    emitTo(`workspace:${workspaceId}`, 'calendar:event:created', { event: formatEvent(fresh) })
    // Best-effort: si el organizador tiene Google Calendar conectado, crea el
    // evento espejo (no bloquea la respuesta ni falla la creación si Google falla).
    setImmediate(() => googleCalendarSync.pushEvent(event.id).catch(() => {}))
    res.status(201).json(formatEvent(fresh))
  } catch (err) { next(err) }
}

// ─── GET /api/calendar/events/:id ───────────────────────────────────────────
// Cualquier miembro activo del workspace puede ver el detalle completo de
// cualquier reunión (participantes, proyecto, link, notas), sea o no
// organizador/invitado — mismo criterio que getAvailability arriba. Las
// acciones (editar/responder/cancelar) siguen restringidas más abajo en cada
// endpoint puntual; acá solo se lee.
async function getEvent(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const event = await loadEvent(req.params.id, workspaceId)
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' })
    res.json(formatEvent(event))
  } catch (err) { next(err) }
}

// ─── PATCH /api/calendar/events/:id ─────────────────────────────────────────
// Solo el organizador, y solo mientras no se haya iniciado la reunión real
// (realMeetingId null). Si cambia fecha/hora/duración, la aceptación de los
// invitados era para otro horario — se resetean a "pending" y se re-notifica.
// `?scope=series`, solo para ocurrencias de una serie recurrente, aplica los
// cambios a la plantilla + a todas las ocurrencias futuras sin empezar (estilo
// Google Calendar "este evento y los siguientes") — ver updateEventSeries.
async function updateEvent(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const organizerId = req.user.userId
    const existing = await loadEvent(req.params.id, workspaceId)
    if (!existing) return res.status(404).json({ error: 'Evento no encontrado' })
    if (existing.organizerId !== organizerId) return res.status(403).json({ error: 'Solo el organizador puede editar el evento' })
    if (existing.realMeetingId) return res.status(409).json({ error: 'La reunión ya se inició, no se puede editar' })

    if (req.query.scope === 'series' && existing.recurrenceId) {
      return updateEventSeries(req, res, next, existing)
    }

    const { title, date, startTime, meetLink, notes, participantIds } = req.body
    const data = {}
    let scheduleChanged = false

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Título inválido' })
      data.title = title.trim().slice(0, TITLE_MAX)
    }
    if (date !== undefined) {
      if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Fecha inválida' })
      // La fecha es la identidad de la ocurrencia dentro de su serie (ver
      // @@unique([recurrenceId, date])) — moverla individualmente no está
      // soportado: hay que cancelar esta ocurrencia y crear una suelta, o editar
      // "esta y las siguientes" si lo que cambió es el horario de toda la serie.
      if (existing.recurrenceId && date !== existing.date) {
        return res.status(400).json({ error: 'No se puede mover una ocurrencia de una serie a otro día. Cancelala y creá una reunión suelta, o editá "esta y las siguientes" si cambió el horario de toda la serie.' })
      }
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
      // Proyecto obligatorio (ver createEvent) — no se puede desasociar por edición.
      if (req.body.projectId === null) return res.status(400).json({ error: 'La reunión necesita un proyecto' })
      const p = await prisma.project.findFirst({ where: { id: Number(req.body.projectId), workspaceId }, select: { id: true } })
      if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
      data.projectId = p.id
    }
    if (meetLink !== undefined) data.meetLink = typeof meetLink === 'string' && meetLink.trim() ? meetLink.trim().slice(0, MEET_LINK_MAX) : null
    if (notes !== undefined) data.notes = typeof notes === 'string' && notes.trim() ? notes.trim() : null

    await prisma.calendarEvent.update({ where: { id: existing.id }, data })
    let current = await loadEvent(existing.id, workspaceId)

    if (Array.isArray(participantIds)) {
      const requestedIds = parseUserIds(participantIds).filter(id => id !== existing.organizerId)
      const currentIds = new Set(current.participants.filter(p => p.userId !== existing.organizerId).map(p => p.userId))
      const activeRequested = await filterActiveMembers(workspaceId, requestedIds)
      const newIds = new Set(activeRequested)

      const toRemove = [...currentIds].filter(id => !newIds.has(id))
      const toAdd    = [...newIds].filter(id => !currentIds.has(id))

      if (toRemove.length) {
        // Ya no está invitado: si había aceptado y tenía la tarea "reserva" sin
        // empezar, se la sacamos antes de borrar su fila de participante.
        const removed = current.participants.filter(p => toRemove.includes(p.userId))
        for (const p of removed) await removeTaskIfPending(p)
        await prisma.calendarEventParticipant.deleteMany({ where: { eventId: existing.id, userId: { in: toRemove } } })
      }
      if (toAdd.length) {
        await prisma.calendarEventParticipant.createMany({
          data: toAdd.map(userId => ({ eventId: existing.id, workspaceId, userId, status: 'pending' })),
          skipDuplicates: true,
        })
        current = await loadEvent(existing.id, workspaceId)
        await notifyInvitees(current, toAdd, organizerId)
      }
      current = await loadEvent(existing.id, workspaceId)
    }

    if (scheduleChanged) {
      const invitees = current.participants.filter(p => p.userId !== existing.organizerId)
      if (invitees.length) {
        // La aceptación era para el horario viejo — se resetea a pending y se les
        // saca la tarea "reserva" (si no la habían empezado); la recuperan al
        // volver a aceptar, ya con la fecha/hora nueva.
        for (const p of invitees) await removeTaskIfPending(p)
        await prisma.calendarEventParticipant.updateMany({
          where: { eventId: existing.id, userId: { in: invitees.map(p => p.userId) } },
          data:  { status: 'pending', respondedAt: null },
        })
        current = await loadEvent(existing.id, workspaceId)
        await notifyInvitees(current, invitees.map(p => p.userId), organizerId)
      }
    }

    // El organizador queda "accepted" durante toda la edición (no se resetea) — si
    // cambió algo que afecta a su tarea "reserva", la sincronizamos directamente.
    const organizerFieldsChanged = ['title', 'date', 'startTime', 'durationMins', 'projectId'].some(k => data[k] !== undefined)
    if (organizerFieldsChanged) {
      const organizerParticipant = current.participants.find(p => p.userId === existing.organizerId)
      if (organizerParticipant) await syncTaskFields(organizerParticipant, current, { tz: req.workspace.timezone })
    }

    const fresh = await loadEvent(existing.id, workspaceId)
    emitTo(`workspace:${workspaceId}`, 'calendar:event:updated', { event: formatEvent(fresh) })
    setImmediate(() => googleCalendarSync.updateEvent(existing.id).catch(() => {}))
    res.json(formatEvent(fresh))
  } catch (err) { next(err) }
}

// "Esta reunión y las siguientes": edita la plantilla de la serie (título/
// horario/duración/proyecto/link/notas/participantes — NO el patrón de
// repetición ni el día) + reaplica esos cambios a las ocurrencias futuras que ya
// estaban materializadas y todavía no arrancaron. Las ocurrencias pasadas o ya
// iniciadas quedan intactas.
async function updateEventSeries(req, res, next, existing) {
  try {
    const workspaceId = req.workspace.id
    const organizerId = req.user.userId
    const rec = await prisma.calendarEventRecurrence.findFirst({ where: { id: existing.recurrenceId, workspaceId } })
    if (!rec) return res.status(404).json({ error: 'Serie no encontrada' })
    if (rec.organizerId !== organizerId) return res.status(403).json({ error: 'Solo el organizador puede editar la serie' })

    const { title, startTime, meetLink, notes, participantIds } = req.body
    const data = {}
    let scheduleChanged = false

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Título inválido' })
      data.title = title.trim().slice(0, TITLE_MAX)
    }
    if (startTime !== undefined) {
      if (!TIME_RE.test(startTime)) return res.status(400).json({ error: 'Hora inválida' })
      if (startTime !== rec.startTime) scheduleChanged = true
      data.startTime = startTime
    }
    if (req.body.durationMins !== undefined) {
      const durationMins = Number(req.body.durationMins)
      if (!Number.isInteger(durationMins) || durationMins < MIN_DURATION_MINS || durationMins > MAX_DURATION_MINS) {
        return res.status(400).json({ error: 'Duración inválida' })
      }
      if (durationMins !== rec.durationMins) scheduleChanged = true
      data.durationMins = durationMins
    }
    if (req.body.projectId !== undefined) {
      if (req.body.projectId === null) return res.status(400).json({ error: 'La reunión necesita un proyecto' })
      const p = await prisma.project.findFirst({ where: { id: Number(req.body.projectId), workspaceId }, select: { id: true } })
      if (!p) return res.status(404).json({ error: 'Proyecto no encontrado' })
      data.projectId = p.id
    }
    if (meetLink !== undefined) data.meetLink = typeof meetLink === 'string' && meetLink.trim() ? meetLink.trim().slice(0, MEET_LINK_MAX) : null
    if (notes !== undefined) data.notes = typeof notes === 'string' && notes.trim() ? notes.trim() : null

    let newInviteeIds = null
    let participantsChanged = false
    if (Array.isArray(participantIds)) {
      const requested = parseUserIds(participantIds).filter(id => id !== rec.organizerId)
      newInviteeIds = await filterActiveMembers(workspaceId, requested)
      data.participantIds = JSON.stringify(newInviteeIds)
      participantsChanged = true
    }

    await prisma.calendarEventRecurrence.update({ where: { id: rec.id }, data })

    // Ocurrencias futuras (incluida la que el usuario editó) ya materializadas,
    // sin empezar — se actualizan directo con los mismos campos.
    const futureOccurrences = await prisma.calendarEvent.findMany({
      where: { recurrenceId: rec.id, date: { gte: existing.date }, realMeetingId: null },
      select: { id: true },
    })

    const occFields = {}
    if (data.title !== undefined) occFields.title = data.title
    if (data.startTime !== undefined) occFields.startTime = data.startTime
    if (data.durationMins !== undefined) occFields.durationMins = data.durationMins
    if (data.projectId !== undefined) occFields.projectId = data.projectId
    if (data.meetLink !== undefined) occFields.meetLink = data.meetLink
    if (data.notes !== undefined) occFields.notes = data.notes

    for (const { id: occId } of futureOccurrences) {
      if (Object.keys(occFields).length) await prisma.calendarEvent.update({ where: { id: occId }, data: occFields })
      let current = await loadEvent(occId, workspaceId)

      if (participantsChanged) {
        const currentIds = new Set(current.participants.filter(p => p.userId !== rec.organizerId).map(p => p.userId))
        const newIds = new Set(newInviteeIds)
        const toRemove = [...currentIds].filter(id => !newIds.has(id))
        const toAdd    = [...newIds].filter(id => !currentIds.has(id))
        if (toRemove.length) {
          const removed = current.participants.filter(p => toRemove.includes(p.userId))
          for (const p of removed) await removeTaskIfPending(p)
          await prisma.calendarEventParticipant.deleteMany({ where: { eventId: occId, userId: { in: toRemove } } })
        }
        if (toAdd.length) {
          await prisma.calendarEventParticipant.createMany({
            data: toAdd.map(userId => ({ eventId: occId, workspaceId, userId, status: 'pending' })),
            skipDuplicates: true,
          })
          current = await loadEvent(occId, workspaceId)
          await notifyInvitees(current, toAdd, organizerId)
        }
        current = await loadEvent(occId, workspaceId)
      }

      if (scheduleChanged) {
        const invitees = current.participants.filter(p => p.userId !== rec.organizerId)
        if (invitees.length) {
          for (const p of invitees) await removeTaskIfPending(p)
          await prisma.calendarEventParticipant.updateMany({
            where: { eventId: occId, userId: { in: invitees.map(p => p.userId) } },
            data:  { status: 'pending', respondedAt: null },
          })
          current = await loadEvent(occId, workspaceId)
          await notifyInvitees(current, invitees.map(p => p.userId), organizerId)
        }
      }

      const organizerFieldsChanged = Object.keys(occFields).length > 0 || participantsChanged
      if (organizerFieldsChanged) {
        const organizerParticipant = current.participants.find(p => p.userId === rec.organizerId)
        if (organizerParticipant) await syncTaskFields(organizerParticipant, current, { tz: req.workspace.timezone })
      }

      const fresh = await loadEvent(occId, workspaceId)
      emitTo(`workspace:${workspaceId}`, 'calendar:event:updated', { event: formatEvent(fresh) })
      setImmediate(() => googleCalendarSync.updateEvent(occId).catch(() => {}))
    }

    const freshRec = await prisma.calendarEventRecurrence.findUnique({ where: { id: rec.id } })
    const freshExisting = await loadEvent(existing.id, workspaceId)
    res.json({ recurrence: formatRecurrence(freshRec), event: formatEvent(freshExisting) })
  } catch (err) { next(err) }
}

// ─── DELETE /api/calendar/events/:id ────────────────────────────────────────
// `?scope=series`, solo para ocurrencias de una serie, cancela esta ocurrencia y
// todas las siguientes ya materializadas (sin empezar) + termina la serie en
// este punto (no vuelve a generar ocurrencias desde esta fecha en adelante).
// Sin scope (o `?scope=this`), cancela solo esta ocurrencia y, si es parte de
// una serie, deja una excepción para que no se vuelva a materializar sola.
async function deleteEvent(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const organizerId = req.user.userId
    const existing = await loadEvent(req.params.id, workspaceId)
    if (!existing) return res.status(404).json({ error: 'Evento no encontrado' })
    if (existing.organizerId !== organizerId) return res.status(403).json({ error: 'Solo el organizador puede cancelar el evento' })
    if (existing.realMeetingId) return res.status(409).json({ error: 'La reunión ya se inició, cancelala desde el proyecto' })

    if (req.query.scope === 'series' && existing.recurrenceId) {
      return deleteEventSeries(req, res, next, existing)
    }

    const invitees = existing.participants.filter(p => p.userId !== organizerId)
    // Cancelar la reunión saca las tareas "reserva" que no se hayan empezado —
    // el cascade de CalendarEvent → CalendarEventParticipant no toca la Task en sí
    // (queda huérfana bloqueando el calendario para siempre si no se limpia acá).
    for (const p of existing.participants) await removeTaskIfPending(p)
    await prisma.calendarEvent.delete({ where: { id: existing.id } })
    if (existing.recurrenceId) {
      await prisma.calendarEventException.upsert({
        where:  { recurrenceId_date: { recurrenceId: existing.recurrenceId, date: existing.date } },
        create: { recurrenceId: existing.recurrenceId, date: existing.date },
        update: {},
      })
    }
    // `existing` ya tiene googleEventId/organizerId/workspaceId (se borró de la DB,
    // no se puede volver a consultar) — deleteEvent solo lee esos escalares.
    setImmediate(() => googleCalendarSync.deleteEvent(existing).catch(() => {}))

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

async function deleteEventSeries(req, res, next, existing) {
  try {
    const workspaceId = req.workspace.id
    const organizerId = req.user.userId
    const rec = await prisma.calendarEventRecurrence.findFirst({ where: { id: existing.recurrenceId, workspaceId } })
    if (!rec) return res.status(404).json({ error: 'Serie no encontrada' })
    if (rec.organizerId !== organizerId) return res.status(403).json({ error: 'Solo el organizador puede cancelar la serie' })

    const futureOccurrences = await prisma.calendarEvent.findMany({
      where: { recurrenceId: rec.id, date: { gte: existing.date }, realMeetingId: null },
      include: EVENT_INCLUDE,
    })

    for (const occ of futureOccurrences) {
      const invitees = occ.participants.filter(p => p.userId !== organizerId)
      for (const p of occ.participants) await removeTaskIfPending(p)
      await prisma.calendarEvent.delete({ where: { id: occ.id } })
      setImmediate(() => googleCalendarSync.deleteEvent(occ).catch(() => {}))
      for (const p of invitees) {
        await prisma.notification.create({
          data: {
            userId: p.userId, actorId: organizerId, workspaceId,
            type:    'CALENDAR_RESPONSE',
            message: `canceló la reunión "${occ.title}" del ${occ.date} a las ${occ.startTime}`,
          },
        })
        emitTo(`user:${p.userId}`, 'notification:new', { type: 'CALENDAR_RESPONSE' })
      }
      emitTo(`workspace:${workspaceId}`, 'calendar:event:deleted', { id: occ.id })
    }

    // Termina la serie en este punto: si esta era la primera ocurrencia posible,
    // la serie completa se desactiva; si no, se corta el día anterior (así lo ya
    // ocurrido queda intacto, pero no se vuelve a generar nada desde acá).
    if (existing.date <= rec.startDate) {
      await prisma.calendarEventRecurrence.update({ where: { id: rec.id }, data: { active: false } })
    } else {
      await prisma.calendarEventRecurrence.update({ where: { id: rec.id }, data: { endDate: addDaysYMD(existing.date, -1) } })
    }

    res.json({ ok: true, seriesEnded: true })
  } catch (err) { next(err) }
}

// ─── POST /api/calendar/events/:id/respond ──────────────────────────────────
// Aceptar una ocurrencia de una serie recurrente acepta automáticamente TODA la
// serie (ver respondEventAcceptSeries) — no hay que confirmar semana por semana
// una reunión fija. Rechazar/cancelar, en cambio, sigue siendo por ocurrencia
// salvo que se pida `?scope=series` (mismo estilo Google Calendar que editar/
// borrar): "solo esta" vs "esta y las siguientes".
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

    if (existing.recurrenceId && status === 'accepted') {
      return respondEventAcceptSeries(req, res, next, existing)
    }
    if (existing.recurrenceId && req.query.scope === 'series') {
      return respondEventDeclineSeries(req, res, next, existing)
    }

    await prisma.calendarEventParticipant.update({
      where: { id: participant.id },
      data:  { status, respondedAt: new Date() },
    })

    // Aceptar crea la Task "reserva" en el dashboard (aparece hoy o como futura,
    // según la fecha del evento); rechazar la saca si todavía no se había empezado.
    if (status === 'accepted') {
      await createTaskForParticipant(existing, participant, { tz: req.workspace.timezone })
    } else {
      await removeTaskIfPending(participant)
    }

    const verb = status === 'accepted' ? 'aceptó' : 'rechazó'
    await notifyOne(existing, existing.organizerId, userId, `${verb} tu invitación a "${existing.title}"`)

    const fresh = await loadEvent(existing.id, workspaceId)
    emitTo(`workspace:${workspaceId}`, 'calendar:event:responded', { event: formatEvent(fresh) })
    res.json(formatEvent(fresh))
  } catch (err) { next(err) }
}

// Aceptar UNA ocurrencia de una serie recurrente acepta automáticamente todas
// las demás: actualiza las ya materializadas (pasadas o futuras, sin arrancar)
// y guarda la preferencia en la plantilla (`autoAcceptUserIds`) para que las que
// se materialicen más adelante nazcan ya aceptadas para este participante — ver
// materializeOccurrence en calendarEventRecurrence.service.js.
async function respondEventAcceptSeries(req, res, next, existing) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const tz = req.workspace.timezone

    const rec = await prisma.calendarEventRecurrence.findFirst({ where: { id: existing.recurrenceId, workspaceId } })
    if (!rec) return res.status(404).json({ error: 'Serie no encontrada' })

    const autoAccept = new Set(JSON.parse(rec.autoAcceptUserIds || '[]'))
    if (!autoAccept.has(userId)) {
      autoAccept.add(userId)
      await prisma.calendarEventRecurrence.update({
        where: { id: rec.id },
        data:  { autoAcceptUserIds: JSON.stringify([...autoAccept]) },
      })
    }

    const occurrences = await prisma.calendarEvent.findMany({
      where: { recurrenceId: rec.id, realMeetingId: null, participants: { some: { userId } } },
      select: { id: true },
    })

    for (const { id: occId } of occurrences) {
      const occ = await loadEvent(occId, workspaceId)
      const p = occ.participants.find(pp => pp.userId === userId)
      if (!p || p.status === 'accepted') continue
      await prisma.calendarEventParticipant.update({ where: { id: p.id }, data: { status: 'accepted', respondedAt: new Date() } })
      const freshOcc = await loadEvent(occId, workspaceId)
      const freshP = freshOcc.participants.find(pp => pp.userId === userId)
      await createTaskForParticipant(freshOcc, freshP, { tz })
      emitTo(`workspace:${workspaceId}`, 'calendar:event:responded', { event: formatEvent(freshOcc) })
    }

    await notifyOne(existing, existing.organizerId, userId, `aceptó tu invitación a "${existing.title}" (y todas las siguientes de la serie)`)

    const fresh = await loadEvent(existing.id, workspaceId)
    res.json(formatEvent(fresh))
  } catch (err) { next(err) }
}

// Rechazar "esta y las siguientes" de una serie: además de esta ocurrencia,
// declina las futuras ya materializadas (sin arrancar) y saca al participante de
// `autoAcceptUserIds` — si había aceptado toda la serie, las ocurrencias que se
// materialicen de ahora en más vuelven a nacer "pending" para él/ella.
async function respondEventDeclineSeries(req, res, next, existing) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId

    const rec = await prisma.calendarEventRecurrence.findFirst({ where: { id: existing.recurrenceId, workspaceId } })
    if (!rec) return res.status(404).json({ error: 'Serie no encontrada' })

    const autoAccept = new Set(JSON.parse(rec.autoAcceptUserIds || '[]'))
    if (autoAccept.has(userId)) {
      autoAccept.delete(userId)
      await prisma.calendarEventRecurrence.update({
        where: { id: rec.id },
        data:  { autoAcceptUserIds: JSON.stringify([...autoAccept]) },
      })
    }

    const occurrences = await prisma.calendarEvent.findMany({
      where: { recurrenceId: rec.id, date: { gte: existing.date }, realMeetingId: null, participants: { some: { userId } } },
      select: { id: true },
    })

    for (const { id: occId } of occurrences) {
      const occ = await loadEvent(occId, workspaceId)
      const p = occ.participants.find(pp => pp.userId === userId)
      if (!p) continue
      await prisma.calendarEventParticipant.update({ where: { id: p.id }, data: { status: 'declined', respondedAt: new Date() } })
      await removeTaskIfPending(p)
      const freshOcc = await loadEvent(occId, workspaceId)
      emitTo(`workspace:${workspaceId}`, 'calendar:event:responded', { event: formatEvent(freshOcc) })
    }

    await notifyOne(existing, existing.organizerId, userId, `rechazó tu invitación a "${existing.title}" (y las siguientes de la serie)`)

    const fresh = await loadEvent(existing.id, workspaceId)
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

    // La reunión real ya les creó su propia Task IN_PROGRESS (ProjectMeetingParticipant.taskId)
    // — la tarea "reserva" que tenían por haber aceptado la invitación queda de más.
    const accepted = existing.participants.filter(p => acceptedUserIds.includes(p.userId))
    for (const p of accepted) await removeTaskIfPending(p)

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
