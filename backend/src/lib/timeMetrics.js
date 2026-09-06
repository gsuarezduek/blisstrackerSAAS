// Helpers de tiempo y métricas de tareas, compartidos entre el servicio de
// memoria de insights y el controller de productividad del admin.

const { monthBounds, prevMonthStr } = require('./monthUtils')
const { DEFAULT_TZ } = require('../utils/dates')

// Offset UTC para una timezone, p.ej. "-03:00" o "+05:30".
function tzOffsetStr(tz) {
  const now   = new Date()
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const utc   = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  const diffMins = Math.round((local - utc) / 60000)
  const sign  = diffMins >= 0 ? '+' : '-'
  const abs   = Math.abs(diffMins)
  const h     = Math.floor(abs / 60).toString().padStart(2, '0')
  const m     = (abs % 60).toString().padStart(2, '0')
  return `${sign}${h}:${m}`
}

// Lunes (YYYY-MM-DD) de hace n semanas, en la timezone dada.
function getNWeeksAgoMonday(n, tz) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const [y, m, d] = todayStr.split('-').map(Number)
  const today = new Date(y, m - 1, d)
  const dow = today.getDay()
  const daysToMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysToMonday - n * 7)
  return monday.toISOString().slice(0, 10)
}

// Suma n días (puede ser negativo) a una fecha YYYY-MM-DD. Devuelve YYYY-MM-DD.
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Cantidad de días hábiles (lunes a viernes) entre dos fechas YYYY-MM-DD, inclusive.
function businessDaysBetween(startStr, endStr) {
  if (!startStr || !endStr || startStr > endStr) return 0
  let count = 0
  const end = new Date(endStr + 'T00:00:00Z')
  for (let d = new Date(startStr + 'T00:00:00Z'); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

// Cantidad de días entre dos fechas YYYY-MM-DD, ambas inclusive.
function daysBetweenInclusive(fromStr, toStr) {
  return Math.round((new Date(toStr + 'T00:00:00Z') - new Date(fromStr + 'T00:00:00Z')) / 86400000) + 1
}

// Período de comparación de productividad, en la timezone dada.
//   'current'  → mes en curso (1 → AYER) vs los MISMOS días del mes anterior (ventanas de igual
//                largo, para que los números absolutos sean comparables y no parezca que "trabajó
//                menos" por estar el mes a medias). Ej: hoy 13/jun → 1–12/jun vs 1–12/may.
//   'previous' → mes anterior completo vs ante-anterior completo.
//   'custom'   → rango libre `{ from, to }` (YYYY-MM-DD, validado por el caller), comparado
//                contra el período inmediatamente anterior de igual duración. Cubre tanto "un
//                mes específico de hace tiempo" como rangos de varios meses (trimestre, etc.).
// El día de HOY nunca se incluye en 'current' ni en 'custom' (se recorta a ayer): mientras el día
// está en curso, "horas disponibles" ya contaría la jornada completa pero "horas registradas" solo
// tareas ya completadas, dando una comparación engañosa que se corrige sola de un día para el otro
// en vez de tener que ir subiendo en tiempo real. Único caso límite: si no hay ningún día cerrado
// en el rango (el 1° del mes, o un rango de un solo día que es hoy), se acepta ese día tal cual.
// Devuelve fechas YYYY-MM-DD: { mode, curStart, curEnd, prevStart, prevEnd, lengthMatched }.
// El rango de consulta es [prevStart, curEnd]; el bucketing usa las dos ventanas explícitas.
function getProductivityPeriod(mode, tz, opts = {}) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const yesterday = addDays(todayStr, -1)
  const curMonth = todayStr.slice(0, 7) // YYYY-MM

  if (mode === 'custom') {
    const { from } = opts
    const to = opts.to > yesterday ? (yesterday < from ? from : yesterday) : opts.to
    const days = daysBetweenInclusive(from, to)
    const prevEnd   = addDays(from, -1)
    const prevStart = addDays(prevEnd, -(days - 1))
    return { mode: 'custom', curStart: from, curEnd: to, prevStart, prevEnd, lengthMatched: true }
  }

  if (mode === 'previous') {
    const analyzed = prevMonthStr(curMonth)        // mes "actual" del análisis = mes anterior completo
    const prior    = prevMonthStr(analyzed)
    const cur  = monthBounds(analyzed)
    const prev = monthBounds(prior)
    return { mode: 'previous', curStart: cur.startDate, curEnd: cur.endDate, prevStart: prev.startDate, prevEnd: prev.endDate, lengthMatched: false }
  }

  const prevMonth = prevMonthStr(curMonth)
  const cur  = monthBounds(curMonth)
  const prev = monthBounds(prevMonth)
  // curEnd = ayer, salvo el 1° del mes (no hay "ayer" dentro del mismo mes → se acepta ese día).
  const curEnd = yesterday >= cur.startDate ? yesterday : cur.startDate
  // Ventana previa del mismo largo: 1° → mismo día del mes anterior (clamp al último día del mes previo).
  const dayOfMonth  = Number(curEnd.slice(8, 10))
  const prevLastDay = Number(prev.endDate.slice(8, 10))
  const clampedDay  = Math.min(dayOfMonth, prevLastDay)
  const prevEnd     = `${prevMonth}-${String(clampedDay).padStart(2, '0')}`
  return { mode: 'current', curStart: cur.startDate, curEnd, prevStart: prev.startDate, prevEnd, lengthMatched: true }
}

// Fecha (YYYY-MM-DD) de hace n días, en la timezone dada.
function daysAgo(n, tz) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const [y, m, d] = todayStr.split('-').map(Number)
  const date = new Date(y, m - 1, d - n)
  return date.toISOString().slice(0, 10)
}

// Filtra por completedAt usando el timezone del workspace. Devuelve un objeto
// { gte?, lte? } listo para usar en un where de Prisma sobre un campo DateTime.
function buildCompletedAtWhere(from, to, tz = DEFAULT_TZ) {
  // Obtener el offset UTC para la timezone dada (aproximación para ART y similares)
  const testDate = new Date(`${from}T12:00:00Z`)
  const localStr = testDate.toLocaleDateString('en-CA', { timeZone: tz })
  const offsetMs = new Date(`${localStr}T12:00:00Z`) - testDate
  const offsetH  = -Math.round(offsetMs / 3600000)
  const sign     = offsetH <= 0 ? '+' : '-'
  const pad      = String(Math.abs(offsetH)).padStart(2, '0')
  const tzStr    = `${sign}${pad}:00`

  const range = {}
  if (from) range.gte = new Date(`${from}T00:00:00${tzStr}`)
  if (to)   range.lte = new Date(`${to}T23:59:59${tzStr}`)
  return range
}

// Mes "YYYY-MM" de una fecha, en la timezone dada.
function monthStringInTz(date, tz = DEFAULT_TZ) {
  return new Date(date).toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7)
}

// Minutos activos reales de una tarea completada: descuenta pausas, tope 8h.
function taskMins(t) {
  if (t.minutesOverride != null) return t.minutesOverride
  if (t.startedAt && t.completedAt) {
    const raw = Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000)
    return Math.min(480, Math.max(0, raw - (t.pausedMinutes || 0)))
  }
  return 0
}

function fmtMins(m) {
  const h = Math.floor(m / 60)
  const min = m % 60
  return h > 0 ? `${h}h${min > 0 ? min + 'm' : ''}` : `${min}m`
}

module.exports = {
  tzOffsetStr, getNWeeksAgoMonday, getProductivityPeriod, daysAgo, taskMins, fmtMins,
  addDays, businessDaysBetween, buildCompletedAtWhere, monthStringInTz, daysBetweenInclusive,
}
