// Reglas de ritmo de envío, puras (sin DB) para poder testearlas: ventana horaria
// en la tz del workspace y estimación de cuántos días tarda una campaña según el
// tope diario.
const { dateStringInTz } = require('../../utils/dates')

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function isHHMM(v) {
  return typeof v === 'string' && HHMM_RE.test(v)
}

function toMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Minutos desde la medianoche, en la hora de pared de `tz`. */
function localMinutes(date, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const h = Number(parts.find(p => p.type === 'hour').value)
  const m = Number(parts.find(p => p.type === 'minute').value)
  return h * 60 + m
}

/**
 * ¿`date` cae dentro de la ventana? Inicio inclusivo, fin exclusivo. Una ventana
 * que cruza la medianoche (22:00–06:00) se respeta; inicio == fin = todo el día.
 */
function inSendWindow(date, tz, start, end) {
  if (!isHHMM(start) || !isHHMM(end) || start === end) return true
  const now = localMinutes(date, tz)
  const s = toMins(start)
  const e = toMins(end)
  return s < e ? now >= s && now < e : now >= s || now < e
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Cuántos días de envío necesita una campaña de `count` destinatarios.
 * Hoy cuenta solo si todavía no cerró la ventana, y con lo que queda del tope de
 * hoy (otras campañas del mismo proyecto ya pudieron gastarlo).
 *
 * @returns {{ days, finishDate, todayCapacity }}  finishDate = YYYY-MM-DD en la tz
 */
function estimateFinish({ count, dailyLimit, usedToday = 0, tz, start, end, now = new Date() }) {
  const today = dateStringInTz(now, tz)
  if (!count || count <= 0) return { days: 0, finishDate: today, todayCapacity: 0 }
  const limit = Math.max(1, dailyLimit || 1)
  const windowOpen = !isHHMM(start) || !isHHMM(end) || start === end
    ? true
    : inSendWindow(now, tz, start, end) || (toMins(start) < toMins(end) && localMinutes(now, tz) < toMins(start))
  const todayCapacity = windowOpen ? Math.max(0, limit - usedToday) : 0
  if (count <= todayCapacity) return { days: 1, finishDate: today, todayCapacity }
  const extraDays = Math.ceil((count - todayCapacity) / limit)
  const days = (todayCapacity > 0 ? 1 : 0) + extraDays
  return { days, finishDate: addDays(today, extraDays), todayCapacity }
}

module.exports = { isHHMM, inSendWindow, estimateFinish, localMinutes }
