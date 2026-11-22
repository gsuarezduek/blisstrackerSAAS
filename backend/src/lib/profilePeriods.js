// Períodos de una ficha (día / semana / mes) anclados a una fecha, en la timezone del
// workspace. Nacieron dentro de users.controller.js para el perfil de una persona y se
// extrajeron cuando la ficha del AGENTE pasó a necesitar exactamente lo mismo: si cada
// ficha derivara sus propios límites, "esta semana" podría significar dos cosas según
// a quién estés mirando.

const { tzOffsetStr } = require('./timeMetrics')

// Filtro Prisma { gte, lte } para un intervalo de días [startStr, endStr] (YYYY-MM-DD), en la TZ dada.
function utcRange(startStr, endStr, tz) {
  const off = tzOffsetStr(tz) // ej "-03:00"
  return {
    gte: new Date(`${startStr}T00:00:00.000${off}`),
    lte: new Date(`${endStr}T23:59:59.999${off}`),
  }
}

// Lunes (YYYY-MM-DD) de la semana que contiene `dateStr`.
function mondayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = dt.getUTCDay()
  const daysToMonday = dow === 0 ? 6 : dow - 1
  dt.setUTCDate(dt.getUTCDate() - daysToMonday)
  return dt.toISOString().slice(0, 10)
}

// Suma n días a una fecha YYYY-MM-DD (n puede ser negativo).
function shiftDay(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

// Hoy (YYYY-MM-DD) en la TZ del workspace.
function todayIn(tz) {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

// Límites [startStr, endStr] del período pedido, anclado a `date`. Es la lógica que
// getUserCompleted tenía inline; la ficha del agente la usa igual.
function periodBounds(period, date) {
  if (period === 'week') {
    const startStr = mondayOf(date)
    return { startStr, endStr: shiftDay(startStr, 6) }
  }
  if (period === 'month') {
    const [y, m] = date.split('-').map(Number)
    return { startStr: `${date.slice(0, 7)}-01`, endStr: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) }
  }
  return { startStr: date, endStr: date }
}

// Normaliza los query params `?period=&date=` de una ficha.
function readPeriodQuery(query, todayStr) {
  const period = ['day', 'week', 'month'].includes(query?.period) ? query.period : 'day'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query?.date || '') ? query.date : todayStr
  return { period, date }
}

module.exports = { utcRange, mondayOf, shiftDay, todayIn, periodBounds, readPeriodQuery }
