const { dateStringInTz } = require('../utils/dates')
const { addDaysYMD } = require('../services/recurrence.service')

// Helpers PUROS de los calendarios traídos de afuera (ver modelo ExternalCalendar).
// Acá vive la única decisión difícil de toda la feature: pasar de un instante UTC
// (que es lo que devuelven Google y los ICS) a la hora de pared que usa todo el
// módulo Calendario ("YYYY-MM-DD" + "HH:MM" en la timezone del workspace, mismo
// criterio que WorkDay.date). Se hace UNA vez, al sincronizar, y lo que queda
// cacheado ya está en hora de pared: así las vistas y getBusyBlocks comparan
// strings contra strings, sin aritmética de zona horaria en cada request.

const MAX_TITLE = 300
const DEFAULT_DURATION_MINS = 60
// Un evento más largo que esto casi siempre es un "fuera de la oficina" de varios
// días mal declarado con hora; se recorta para que no tape la grilla entera.
const MAX_DURATION_MINS = 24 * 60

/** Hora de pared ("HH:MM") de un instante en una timezone dada. */
function timeInTz(date, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date)
}

/** Instante UTC → { date: "YYYY-MM-DD", time: "HH:MM" } de pared en `tz`. */
function wallInTz(date, tz) {
  return { date: dateStringInTz(date, tz), time: timeInTz(date, tz) }
}

/**
 * "YYYY-MM-DD" de los componentes LOCALES del Date, sin mirar ninguna timezone.
 * Es para los eventos de día completo de un ICS: node-ical construye el Date de un
 * `DTSTART;VALUE=DATE:20261112` a medianoche de la zona del proceso, así que sus
 * componentes locales son exactamente el día que decía el archivo — mientras que
 * convertirlo a la tz del workspace lo correría un día según dónde corra el server
 * (Railway en UTC vs. una máquina en ART).
 */
function ymdLocal(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function diffMinutes(start, end) {
  if (!(start instanceof Date) || !(end instanceof Date)) return null
  const mins = Math.round((end.getTime() - start.getTime()) / 60000)
  return Number.isFinite(mins) ? mins : null
}

/** Días entre dos "YYYY-MM-DD" (b - a). */
function diffDaysYMD(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

function clampDuration(mins) {
  if (!Number.isFinite(mins) || mins <= 0) return DEFAULT_DURATION_MINS
  return Math.min(mins, MAX_DURATION_MINS)
}

function cleanTitle(raw, fallback = 'Ocupado') {
  const t = String(raw ?? '').replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, MAX_TITLE) : fallback
}

// ─── Google Calendar (API) ────────────────────────────────────────────────────

// eventType de Google que NO son citas: "workingLocation" es el cartelito de
// "trabajo desde casa" (ocupa todo el día y no es nada que haya que respetar) y
// "birthday" son los cumpleaños del contacto. Si entraran, la grilla quedaría
// cubierta de bloques que no son reuniones.
const SKIP_EVENT_TYPES = new Set(['workingLocation', 'birthday'])

/**
 * Evento de `events.list` (con singleEvents=true) → fila de ExternalCalendarEvent,
 * o null si no corresponde traerlo. Devuelve el shape sin ids de FK — los pone el
 * servicio de sync.
 */
function mapGoogleEvent(ev, tz) {
  if (!ev || !ev.id) return null
  if (ev.status === 'cancelled') return null
  if (SKIP_EVENT_TYPES.has(ev.eventType)) return null

  // Lo que yo rechacé no se trae: no lo quiero ver ni que me tape un hueco.
  const self = (ev.attendees || []).find(a => a.self)
  if (self?.responseStatus === 'declined') return null

  const allDay = !!ev.start?.date && !ev.start?.dateTime
  let date, endDate, startTime = null, durationMins = null

  if (allDay) {
    date = ev.start.date
    // `end.date` de Google es EXCLUSIVO (un evento de un día termina "mañana").
    endDate = ev.end?.date ? addDaysYMD(ev.end.date, -1) : date
    if (diffDaysYMD(date, endDate) < 0) endDate = date
  } else {
    const startAt = new Date(ev.start.dateTime)
    const endAt = ev.end?.dateTime ? new Date(ev.end.dateTime) : null
    if (Number.isNaN(startAt.getTime())) return null
    const wall = wallInTz(startAt, tz)
    date = wall.date
    startTime = wall.time
    durationMins = clampDuration(diffMinutes(startAt, endAt))
    endDate = dateStringInTz(new Date(startAt.getTime() + durationMins * 60000), tz)
    if (diffDaysYMD(date, endDate) < 0) endDate = date
  }

  return {
    externalId: ev.id,
    title: cleanTitle(ev.summary),
    date, endDate, startTime, durationMins, allDay,
    // Un día completo no ocupa una franja (un cumpleaños o un viaje no son "estoy
    // en reunión de 9 a 10"), y "Mostrar como libre" es exactamente eso.
    busy: !allDay && ev.transparency !== 'transparent',
    location: ev.location ? String(ev.location).slice(0, 500) : null,
    url: ev.htmlLink || null,
  }
}

// ─── ICS (una URL iCal pegada a mano) ─────────────────────────────────────────

/**
 * Normaliza la URL de un calendario iCal: acepta `webcal://` (el esquema con el que
 * Google/Apple ofrecen "suscribirse") y exige http(s) con pinta de .ics. No valida
 * que sea alcanzable ni que no apunte a la red interna — eso es `assertPublicUrl`,
 * que corre en el servicio antes de cada fetch.
 */
function normalizeIcsUrl(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) throw new Error('Pegá la URL del calendario')
  const withScheme = trimmed.replace(/^webcal:\/\//i, 'https://')
  let url
  try { url = new URL(withScheme) } catch { throw new Error('Esa no es una URL válida') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('La URL tiene que empezar con https:// o webcal://')
  }
  return url.toString()
}

/** Set con los días de pared de las EXDATE de un VEVENT (node-ical las da duplicadas). */
function exdateDays(ev) {
  const days = new Set()
  for (const value of Object.values(ev.exdate || {})) {
    if (value instanceof Date) days.add(value.dateOnly ? ymdLocal(value) : ymdLocal(value))
  }
  for (const key of Object.keys(ev.exdate || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) days.add(key)
  }
  return days
}

/**
 * VEVENT de node-ical → filas (una por ocurrencia dentro de [from, to]).
 *
 * Las ocurrencias de una serie heredan la **hora de pared y la duración del primer
 * evento**, y de la expansión de la RRULE se usa solo en qué día cae cada una. Es
 * a propósito: rrule.js razona en instantes UTC, así que una serie "todos los lunes
 * a las 9" que cruza un cambio de horario de verano devolvería las 8 o las 10. Para
 * quien mira su calendario, la hora es la que puso, no el instante.
 */
function mapIcsEvent(ev, { tz, from, to }) {
  if (!ev || ev.type !== 'VEVENT') return []
  if (String(ev.status || '').toUpperCase() === 'CANCELLED') return []
  if (!(ev.start instanceof Date) || Number.isNaN(ev.start.getTime())) return []

  const uid = ev.uid || `${ev.summary || 'evento'}-${ev.start.toISOString()}`
  const allDay = ev.start.dateOnly === true
  const transparent = String(ev.transparency || '').toUpperCase() === 'TRANSPARENT'
  const title = cleanTitle(ev.summary)
  const location = ev.location ? String(ev.location).slice(0, 500) : null
  const url = typeof ev.url === 'string' && ev.url ? ev.url : null

  // Forma del primer evento: la que heredan todas las ocurrencias.
  const base = allDay
    ? { startTime: null, durationMins: null, spanDays: Math.max(0, diffDaysYMD(ymdLocal(ev.start), ymdLocal(ev.end || ev.start)) - 1) }
    : (() => {
        const wall = wallInTz(ev.start, tz)
        const durationMins = clampDuration(diffMinutes(ev.start, ev.end))
        const spanDays = Math.max(0, diffDaysYMD(wall.date, dateStringInTz(new Date(ev.start.getTime() + durationMins * 60000), tz)))
        return { startTime: wall.time, durationMins, spanDays }
      })()

  const firstDay = allDay ? ymdLocal(ev.start) : wallInTz(ev.start, tz).date

  const row = (day, idSuffix) => ({
    externalId: idSuffix ? `${uid}#${idSuffix}` : uid,
    title, date: day, endDate: addDaysYMD(day, base.spanDays),
    startTime: base.startTime, durationMins: base.durationMins, allDay,
    busy: !allDay && !transparent,
    location, url,
  })

  if (!ev.rrule) {
    // Fuera del rango pedido no se guarda nada (el cache es por ventana).
    if (base.spanDays === 0 && (firstDay < from || firstDay > to)) return []
    if (addDaysYMD(firstDay, base.spanDays) < from || firstDay > to) return []
    return [row(firstDay, null)]
  }

  const skip = exdateDays(ev)
  // Un día de margen a cada lado: una ocurrencia que arranca el día anterior y
  // cruza la medianoche todavía cae dentro del rango que mira el usuario.
  const windowStart = new Date(`${addDaysYMD(from, -1)}T00:00:00Z`)
  const windowEnd = new Date(`${addDaysYMD(to, 1)}T23:59:59Z`)
  let occurrences = []
  try { occurrences = ev.rrule.between(windowStart, windowEnd, true) || [] } catch { return [] }

  const rows = []
  const seen = new Set()
  for (const occ of occurrences) {
    if (!(occ instanceof Date) || Number.isNaN(occ.getTime())) continue
    const day = allDay ? ymdLocal(occ) : dateStringInTz(occ, tz)
    if (skip.has(day) || seen.has(day)) continue
    if (addDaysYMD(day, base.spanDays) < from || day > to) continue
    seen.add(day)
    rows.push(row(day, day))
  }
  return rows
}

module.exports = {
  MAX_TITLE, DEFAULT_DURATION_MINS, MAX_DURATION_MINS,
  timeInTz, wallInTz, ymdLocal, diffMinutes, diffDaysYMD, clampDuration, cleanTitle,
  mapGoogleEvent, normalizeIcsUrl, mapIcsEvent, exdateDays,
}
