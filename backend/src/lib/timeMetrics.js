// Helpers de tiempo y métricas de tareas, compartidos entre el servicio de
// memoria de insights y el controller de productividad del admin.

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

// Fecha (YYYY-MM-DD) de hace n días, en la timezone dada.
function daysAgo(n, tz) {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const [y, m, d] = todayStr.split('-').map(Number)
  const date = new Date(y, m - 1, d - n)
  return date.toISOString().slice(0, 10)
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

module.exports = { tzOffsetStr, getNWeeksAgoMonday, daysAgo, taskMins, fmtMins }
