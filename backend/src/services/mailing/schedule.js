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
function estimateFinish({ count, dailyLimit, limitForDay = null, usedToday = 0, tz, start, end, now = new Date() }) {
  const today = dateStringInTz(now, tz)
  if (!count || count <= 0) return { days: 0, finishDate: today, todayCapacity: 0 }
  // Con un tope que cambia día a día (calentamiento) se recorre día por día.
  if (limitForDay) return estimateVariable({ count, limitForDay, usedToday, tz, start, end, now, today })
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

function windowStillOpenToday(now, tz, start, end) {
  if (!isHHMM(start) || !isHHMM(end) || start === end) return true
  return inSendWindow(now, tz, start, end) || (toMins(start) < toMins(end) && localMinutes(now, tz) < toMins(start))
}

function estimateVariable({ count, limitForDay, usedToday, tz, start, end, now, today }) {
  const todayCapacity = windowStillOpenToday(now, tz, start, end) ? Math.max(0, limitForDay(0) - usedToday) : 0
  let left = count - todayCapacity
  if (left <= 0) return { days: 1, finishDate: today, todayCapacity }
  let d = 0
  while (left > 0 && d < 365) {
    d++
    left -= Math.max(1, limitForDay(d))
  }
  return { days: d + (todayCapacity > 0 ? 1 : 0), finishDate: addDays(today, d), todayCapacity }
}

// ─── Calentamiento del dominio ───────────────────────────────────────────────
// Un dominio que nunca mandó volumen y de golpe manda miles es lo que más
// desconfianza genera en Gmail/Outlook. Con el calentamiento prendido el tope del
// día arranca en 50 y crece 50% por día (50, 75, 113, 169, 253, 380, 570…) hasta
// alcanzar el tope configurado: ~2 semanas para llegar a 10.000.
const WARMUP_START = 50
const WARMUP_GROWTH = 1.5

function warmupLimit(dayIndex) {
  const d = Math.max(0, Math.floor(dayIndex))
  return Math.round(WARMUP_START * WARMUP_GROWTH ** d)
}

function daysBetweenYmd(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000)
}

/**
 * Tope de HOY para un proyecto: el configurado, recortado por el techo de
 * plataforma (`hardCap`, 0 = sin techo) y, con calentamiento, por la curva del día.
 * @returns {{ limit, warmup: null | { day, limit, done } }}
 */
function effectiveDailyLimit({ dailyLimit, hardCap = 0, warmupEnabled, warmupStartedAt, tz, now = new Date() }) {
  let limit = Math.max(0, dailyLimit || 0)
  if (hardCap > 0) limit = Math.min(limit, hardCap)
  if (!warmupEnabled || !warmupStartedAt) return { limit, warmup: null }
  const day = Math.max(0, daysBetweenYmd(dateStringInTz(new Date(warmupStartedAt), tz), dateStringInTz(now, tz)))
  const w = warmupLimit(day)
  return { limit: Math.min(limit, w), warmup: { day: day + 1, limit: w, done: w >= limit } }
}

module.exports = { isHHMM, inSendWindow, estimateFinish, localMinutes, warmupLimit, effectiveDailyLimit }
