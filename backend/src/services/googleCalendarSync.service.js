const axios = require('axios')
const prisma = require('../lib/prisma')
const { getValidAccessToken } = require('./googleCalendarToken.service')
const { timeToMins, minsToTime } = require('./availability.service')
const { addDaysYMD, nextOccurrenceOnOrAfter, parseWeekdays } = require('./recurrence.service')
const { todayString, dateStringInTz } = require('../utils/dates')

// v1 es solo "empujar": crear/actualizar/borrar el evento en el Google Calendar
// del ORGANIZADOR (calendario "primary"), con los demás participantes como
// `attendees` por email — Google les manda la invitación nativa sin que ellos
// necesiten conectar nada acá. Si el organizador no tiene GoogleCalendarConnection
// activa, todas las funciones son no-op silencioso (nunca bloquean la acción real
// sobre el CalendarEvent — mismo criterio log-and-swallow que cacheo de imágenes
// sociales / notificaciones de plataforma). "Traer" eventos/disponibilidad desde
// Google queda para una fase futura.
//
// SERIES RECURRENTES: una serie (CalendarEventRecurrence) se empuja como UN evento
// recurrente con RRULE, no como un evento suelto por ocurrencia. Las ocurrencias de
// BlissTracker se materializan solas cuando alguien mira un rango del Calendario
// (ensureOccurrences), y empujar cada una con sendUpdates=all hacía que Google le
// mandara a cada invitado un mail por fecha — 15 invitaciones en 2 minutos el día
// que alguien abrió diciembre. Ahora: una invitación al crear la serie, y cada
// ocurrencia se VINCULA a su instancia de Google (googleEventId = id de la
// instancia, que no manda nada). Editar/borrar "esta y las siguientes" es un solo
// cambio en el evento recurrente.
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
// Google conectado al crearlo, y lo conectó después), lo crea recién ahora —
// salvo que sea una ocurrencia de una serie: esas viven en el evento recurrente.
async function updateEvent(eventId) {
  try {
    const event = await loadEventForSync(eventId)
    if (!event) return
    if (event.recurrenceId) return updateOccurrence(event)
    if (!event.googleEventId) return pushEvent(eventId)

    const connection = await loadOrganizerConnection(event.organizerId, event.workspaceId)
    if (!connection || connection.status !== 'active') return

    const accessToken = await getValidAccessToken(connection)
    await patchSingle(accessToken, event)
  } catch (err) {
    logSyncError('updateEvent', err)
  }
}

async function patchSingle(accessToken, event) {
  try {
    await axios.patch(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(event.googleEventId)}?sendUpdates=all`,
      buildEventPayload(event, event.workspace.timezone),
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
  } catch (err) {
    // El evento ya no existe del lado de Google (alguien lo borró a mano ahí) —
    // no es un error real, solo desvinculamos para que la próxima edición lo recree.
    if (err.response?.status === 404 || err.response?.status === 410) {
      await prisma.calendarEvent.update({ where: { id: event.id }, data: { googleEventId: null } }).catch(() => {})
      return
    }
    throw err
  }
}

// Recibe el CalendarEvent YA CARGADO (con organizerId/workspaceId/googleEventId
// escalares — alcanza, no hace falta participants) porque se llama justo antes
// de borrarlo de la DB; después de borrado ya no se podría volver a consultar.
// Una ocurrencia de serie sin vincular todavía se busca en el evento recurrente
// (si no, la instancia quedaría viva en Google).
async function deleteEvent(event) {
  try {
    const connection = await loadOrganizerConnection(event.organizerId, event.workspaceId)
    if (!connection || connection.status !== 'active') return
    const accessToken = await getValidAccessToken(connection)

    let googleId = event.googleEventId
    if (!googleId && event.recurrenceId) {
      const rec = await prisma.calendarEventRecurrence.findUnique({
        where: { id: event.recurrenceId }, include: { workspace: { select: { timezone: true } } },
      })
      if (rec?.googleEventId && event.date >= rec.googleStartDate) {
        const map = await findInstances(accessToken, rec.googleEventId, event.date, event.date, rec.workspace.timezone)
        googleId = map.get(event.date) || null
      }
    }
    if (!googleId) return

    await axios.delete(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(googleId)}?sendUpdates=all`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
  } catch (err) {
    if (err.response?.status === 404 || err.response?.status === 410) return
    logSyncError('deleteEvent', err)
  }
}

// ─── Series recurrentes ──────────────────────────────────────────────────────

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

// Offset (ms) de `tz` en el instante dado: hora de pared leída como UTC − instante.
function tzOffsetMs(instant, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant).map(p => [p.type, p.value]))
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return asUtc - instant.getTime()
}

/** Hora de pared ("YYYY-MM-DD" + "HH:MM") en `tz` → instante UTC. */
function wallToUtc(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const naive = Date.UTC(y, m - 1, d, hh, mm)
  // Dos pasadas: la segunda corrige si el offset cambia entre la estimación y el
  // instante real (cambio de horario de verano).
  let t = naive - tzOffsetMs(new Date(naive), tz)
  t = naive - tzOffsetMs(new Date(t), tz)
  return new Date(t)
}

// "YYYYMMDDTHHMMSSZ" — el formato UTC que RFC 5545 exige para UNTIL.
function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// "BYMONTHDAY=31" en RRULE SALTEA los meses cortos, pero nuestras series caen el
// último día del mes (nextOccurrenceOnOrAfter hace Math.min con los días del mes).
// "El último de los días 28..31 que exista ese mes" reproduce eso.
function monthDayRule(dom) {
  if (dom <= 28) return `BYMONTHDAY=${dom}`
  const days = []
  for (let d = 28; d <= dom; d++) days.push(d)
  return `BYMONTHDAY=${days.join(',')};BYSETPOS=-1`
}

/**
 * Líneas `recurrence` de Google (RRULE + EXDATE) de una serie. Puro, para tests.
 * `untilDate` (inclusive) acota además del endDate de la serie — es como se corta
 * un evento recurrente en "esta y las siguientes".
 */
function buildRecurrenceRule(rec, { tz, startDate, untilDate = null, exceptionDates = [] }) {
  let freq
  if (rec.frequency === 'daily') {
    freq = 'FREQ=DAILY'
  } else if (rec.frequency === 'weekly') {
    const days = parseWeekdays(rec)
    freq = `FREQ=WEEKLY;BYDAY=${days.map(d => BYDAY[d]).join(',')}`
  } else if (rec.frequency === 'monthly') {
    const dom = rec.dayOfMonth || Number(rec.startDate.slice(8, 10))
    freq = `FREQ=MONTHLY;${monthDayRule(dom)}`
  } else if (rec.frequency === 'annual') {
    const month = rec.month || Number(rec.startDate.slice(5, 7))
    const dom = rec.dayOfMonth || Number(rec.startDate.slice(8, 10))
    freq = `FREQ=YEARLY;BYMONTH=${month};${monthDayRule(dom)}`
  } else {
    return null
  }

  const until = [rec.endDate, untilDate].filter(Boolean).sort()[0]
  if (until) {
    // Fin del día `until` en la tz del workspace, en UTC.
    const endOfDay = new Date(wallToUtc(addDaysYMD(until, 1), '00:00', tz).getTime() - 1000)
    freq += `;UNTIL=${utcStamp(endOfDay)}`
  }

  const lines = [`RRULE:${freq}`]
  const exdates = exceptionDates
    .filter(d => d >= startDate && (!until || d <= until))
    .sort()
    .map(d => `${d.replace(/-/g, '')}T${rec.startTime.replace(':', '')}00`)
  if (exdates.length) lines.push(`EXDATE;TZID=${tz}:${exdates.join(',')}`)
  return lines
}

// Las operaciones de una misma serie se encolan: ensureOccurrences materializa
// varias ocurrencias seguidas y cada una dispara su sync en paralelo — sin esto,
// todas verían "la serie no tiene evento en Google" y crearían uno cada una.
// En memoria del proceso, mismo criterio que los locks de los crons (una instancia).
const seriesQueues = new Map()
function withSeriesLock(recId, fn) {
  const prev = seriesQueues.get(recId) || Promise.resolve()
  const run = prev.catch(() => {}).then(fn)
  const tail = run.catch(() => {})
  seriesQueues.set(recId, tail)
  tail.then(() => { if (seriesQueues.get(recId) === tail) seriesQueues.delete(recId) })
  return run
}

function isInstanceOf(googleId, masterId) {
  return !!googleId && !!masterId && (googleId === masterId || googleId.startsWith(`${masterId}_`))
}

function loadSeries(recId) {
  return prisma.calendarEventRecurrence.findUnique({
    where:   { id: recId },
    include: { workspace: { select: { timezone: true } } },
  })
}

async function seriesPayload(rec, startDate, tz) {
  const ids = JSON.parse(rec.participantIds || '[]').filter(id => id !== rec.organizerId)
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
    : []
  const exceptions = await prisma.calendarEventException.findMany({ where: { recurrenceId: rec.id }, select: { date: true } })
  const payload = buildEventPayload({
    title: rec.title, notes: rec.notes, meetLink: rec.meetLink,
    date: startDate, startTime: rec.startTime, durationMins: rec.durationMins,
    organizerId: rec.organizerId,
    participants: users.map(u => ({ userId: u.id, user: u })),
  }, tz)
  payload.recurrence = buildRecurrenceRule(rec, { tz, startDate, exceptionDates: exceptions.map(e => e.date) })
  return payload
}

/** Instancias del evento recurrente entre dos fechas (inclusive) → Map(date → id). */
async function findInstances(accessToken, masterId, from, to, tz) {
  const map = new Map()
  let pageToken
  do {
    const { data } = await axios.get(
      `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(masterId)}/instances`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          timeMin: wallToUtc(from, '00:00', tz).toISOString(),
          timeMax: wallToUtc(addDaysYMD(to, 1), '00:00', tz).toISOString(),
          maxResults: 2500, pageToken,
        },
      },
    )
    for (const inst of data.items || []) {
      const original = inst.originalStartTime?.dateTime || inst.start?.dateTime
      if (!original) continue
      const date = dateStringInTz(new Date(original), tz)
      if (date) map.set(date, inst.id)
    }
    pageToken = data.nextPageToken
  } while (pageToken)
  return map
}

// Vincula las ocurrencias ya materializadas (desde `fromDate`) a sus instancias de
// Google. No manda nada: solo guarda ids, para poder editar/borrar una ocurrencia
// suelta después y para que no vuelvan como "externas" (ownPushedGoogleIds).
async function linkOccurrences(rec, accessToken, { fromDate, onlyDate = null, force = false }) {
  const where = { recurrenceId: rec.id, date: onlyDate ? onlyDate : { gte: fromDate } }
  const occurrences = await prisma.calendarEvent.findMany({ where, select: { id: true, date: true, googleEventId: true } })
  const pending = force ? occurrences : occurrences.filter(o => !isInstanceOf(o.googleEventId, rec.googleEventId))
  if (!pending.length) return
  const dates = pending.map(o => o.date).sort()
  const map = await findInstances(accessToken, rec.googleEventId, dates[0], dates[dates.length - 1], rec.workspace.timezone)
  for (const occ of pending) {
    const id = map.get(occ.date)
    if (id && id !== occ.googleEventId) {
      await prisma.calendarEvent.update({ where: { id: occ.id }, data: { googleEventId: id } })
    }
  }
}

// Crea el evento recurrente en Google desde `startDate` (una sola invitación).
async function createMaster(rec, accessToken, startDate) {
  const tz = rec.workspace.timezone
  const payload = await seriesPayload(rec, startDate, tz)
  if (!payload.recurrence) return null
  const { data } = await axios.post(
    `${CAL_BASE}/calendars/primary/events?sendUpdates=all`,
    payload,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  await prisma.calendarEventRecurrence.update({
    where: { id: rec.id }, data: { googleEventId: data.id, googleStartDate: startDate },
  })
  const fresh = { ...rec, googleEventId: data.id, googleStartDate: startDate }
  await linkOccurrences(fresh, accessToken, { fromDate: startDate })
  return fresh
}

/**
 * Si la serie todavía no tiene evento en Google, lo crea. Arranca en la primera
 * ocurrencia que sea (a) de hoy en adelante — empujar reuniones pasadas no sirve
 * y mandaría invitaciones viejas — y (b) posterior a la última ocurrencia que se
 * haya empujado SUELTA (series creadas antes de este cambio), para no duplicarlas.
 */
async function ensureMaster(rec, accessToken) {
  if (rec.googleEventId) return rec
  const tz = rec.workspace.timezone
  // nextOccurrenceOnOrAfter no mira startDate: sin este piso, una serie que arranca
  // el miércoles que viene empezaría en Google el miércoles de esta semana.
  let fromDate = [todayString(tz), rec.startDate].sort()[1]
  const lastLoose = await prisma.calendarEvent.findFirst({
    where:   { recurrenceId: rec.id, googleEventId: { not: null } },
    orderBy: { date: 'desc' },
    select:  { date: true },
  })
  if (lastLoose && lastLoose.date >= fromDate) fromDate = addDaysYMD(lastLoose.date, 1)
  if (!rec.active) return null
  const startDate = nextOccurrenceOnOrAfter(rec, fromDate)
  if (!startDate) return null
  return createMaster(rec, accessToken, startDate)
}

async function syncOccurrenceLocked(eventId) {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { id: true, date: true, recurrenceId: true, organizerId: true, workspaceId: true, googleEventId: true },
  })
  if (!event?.recurrenceId) return null
  const connection = await loadOrganizerConnection(event.organizerId, event.workspaceId)
  if (!connection || connection.status !== 'active') return null
  const accessToken = await getValidAccessToken(connection)

  let rec = await loadSeries(event.recurrenceId)
  if (!rec) return null
  rec = await ensureMaster(rec, accessToken)
  if (rec && event.date >= rec.googleStartDate && !isInstanceOf(event.googleEventId, rec.googleEventId)) {
    await linkOccurrences(rec, accessToken, { onlyDate: event.date })
  }
  return { accessToken }
}

/**
 * Una ocurrencia recién materializada: la primera de la serie crea el evento
 * recurrente en Google (UNA invitación); las demás solo se vinculan a su instancia.
 * Nunca empuja una ocurrencia como evento suelto.
 */
async function syncOccurrence(eventId) {
  try {
    const event = await prisma.calendarEvent.findUnique({ where: { id: eventId }, select: { recurrenceId: true } })
    if (!event?.recurrenceId) return
    await withSeriesLock(event.recurrenceId, () => syncOccurrenceLocked(eventId))
  } catch (err) {
    logSyncError('syncOccurrence', err)
  }
}

// "Solo esta reunión" editada: se le aplica el cambio a SU instancia (un mail,
// el de esa fecha, que es lo que corresponde a una edición explícita).
async function updateOccurrence(event) {
  await withSeriesLock(event.recurrenceId, async () => {
    const ctx = await syncOccurrenceLocked(event.id)
    if (!ctx) return
    const fresh = await loadEventForSync(event.id)
    if (fresh?.googleEventId) await patchSingle(ctx.accessToken, fresh)
  })
}

// Ocurrencias empujadas SUELTAS (antes de existir el evento recurrente) desde una
// fecha: se siguen tocando una por una — no hay forma de pasarlas al recurrente
// sin mandar una cancelación por cada una.
async function looseOccurrencesFrom(rec, fromDate) {
  const rows = await prisma.calendarEvent.findMany({
    where: { recurrenceId: rec.id, date: { gte: fromDate }, realMeetingId: null, googleEventId: { not: null } },
    select: { id: true, googleEventId: true },
  })
  return rows.filter(r => !isInstanceOf(r.googleEventId, rec.googleEventId))
}

/**
 * "Esta reunión y las siguientes" editada. Llamar UNA vez, después de que el
 * controller actualizó la plantilla. Desde el arranque del evento recurrente → se
 * edita ese evento (un mail). Desde una fecha posterior → se corta el evento viejo
 * el día anterior y se crea otro desde esa fecha, igual que hace Google.
 */
async function updateSeries(recId, fromDate) {
  try {
    await withSeriesLock(recId, async () => {
      let rec = await loadSeries(recId)
      if (!rec) return
      const connection = await loadOrganizerConnection(rec.organizerId, rec.workspaceId)
      if (!connection || connection.status !== 'active') return
      const accessToken = await getValidAccessToken(connection)
      const tz = rec.workspace.timezone

      for (const loose of await looseOccurrencesFrom(rec, fromDate)) {
        const ev = await loadEventForSync(loose.id)
        if (ev) await patchSingle(accessToken, ev).catch(err => logSyncError('updateSeries (suelta)', err))
      }

      if (!rec.googleEventId) { await ensureMaster(rec, accessToken); return }

      if (fromDate <= rec.googleStartDate) {
        const payload = await seriesPayload(rec, rec.googleStartDate, tz)
        try {
          await axios.patch(
            `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(rec.googleEventId)}?sendUpdates=all`,
            payload,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          )
        } catch (err) {
          if (err.response?.status !== 404 && err.response?.status !== 410) throw err
          // Lo borraron a mano en Google: se desvincula y se vuelve a crear.
          await prisma.calendarEventRecurrence.update({ where: { id: rec.id }, data: { googleEventId: null, googleStartDate: null } })
          await prisma.calendarEvent.updateMany({
            where: { recurrenceId: rec.id, googleEventId: { startsWith: `${rec.googleEventId}_` } },
            data:  { googleEventId: null },
          })
          await ensureMaster({ ...rec, googleEventId: null, googleStartDate: null }, accessToken)
          return
        }
        // Cambiar la hora cambia los ids de las instancias: se re-vinculan todas.
        await linkOccurrences(rec, accessToken, { fromDate: rec.googleStartDate, force: true })
        return
      }

      // Split: el evento viejo termina el día anterior, uno nuevo arranca acá.
      const oldRules = buildRecurrenceRule(rec, {
        tz, startDate: rec.googleStartDate, untilDate: addDaysYMD(fromDate, -1),
        exceptionDates: (await prisma.calendarEventException.findMany({ where: { recurrenceId: rec.id }, select: { date: true } })).map(e => e.date),
      })
      await axios.patch(
        `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(rec.googleEventId)}?sendUpdates=all`,
        { recurrence: oldRules },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ).catch(err => { if (err.response?.status !== 404 && err.response?.status !== 410) throw err })
      const startDate = nextOccurrenceOnOrAfter(rec, fromDate)
      if (!startDate) return
      rec = { ...rec, googleEventId: null, googleStartDate: null }
      await createMaster(rec, accessToken, startDate)
    })
  } catch (err) {
    logSyncError('updateSeries', err)
  }
}

/**
 * "Cancelar esta reunión y las siguientes". Recibe la serie y las ocurrencias YA
 * CARGADAS (el controller las borra de la DB antes). Un solo cambio en el evento
 * recurrente: se borra entero si se cancela desde su arranque, o se le pone UNTIL.
 */
async function endSeries(rec, fromDate, deletedOccurrences = []) {
  try {
    await withSeriesLock(rec.id, async () => {
      const connection = await loadOrganizerConnection(rec.organizerId, rec.workspaceId)
      if (!connection || connection.status !== 'active') return
      const accessToken = await getValidAccessToken(connection)
      const headers = { Authorization: `Bearer ${accessToken}` }
      const ignoreGone = err => { if (err.response?.status !== 404 && err.response?.status !== 410) throw err }

      for (const occ of deletedOccurrences) {
        if (!occ.googleEventId || isInstanceOf(occ.googleEventId, rec.googleEventId)) continue
        await axios.delete(`${CAL_BASE}/calendars/primary/events/${encodeURIComponent(occ.googleEventId)}?sendUpdates=all`, { headers })
          .catch(ignoreGone).catch(err => logSyncError('endSeries (suelta)', err))
      }

      if (!rec.googleEventId) return
      if (fromDate <= rec.googleStartDate) {
        await axios.delete(`${CAL_BASE}/calendars/primary/events/${encodeURIComponent(rec.googleEventId)}?sendUpdates=all`, { headers })
          .catch(ignoreGone)
        await prisma.calendarEventRecurrence.update({ where: { id: rec.id }, data: { googleEventId: null, googleStartDate: null } })
        return
      }
      const tz = (await prisma.workspace.findUnique({ where: { id: rec.workspaceId }, select: { timezone: true } }))?.timezone
      const exceptions = await prisma.calendarEventException.findMany({ where: { recurrenceId: rec.id }, select: { date: true } })
      const rules = buildRecurrenceRule(rec, {
        tz, startDate: rec.googleStartDate, untilDate: addDaysYMD(fromDate, -1),
        exceptionDates: exceptions.map(e => e.date),
      })
      await axios.patch(
        `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(rec.googleEventId)}?sendUpdates=all`,
        { recurrence: rules }, { headers },
      ).catch(ignoreGone)
    })
  } catch (err) {
    logSyncError('endSeries', err)
  }
}

module.exports = {
  pushEvent, updateEvent, deleteEvent,
  syncOccurrence, updateSeries, endSeries,
  // helpers puros, exportados para tests (mismo criterio que recurrence.service.js)
  endDateTime, buildEventPayload, buildRecurrenceRule, wallToUtc, isInstanceOf,
}
