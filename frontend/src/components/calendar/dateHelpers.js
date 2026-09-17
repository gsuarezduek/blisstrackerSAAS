// Helpers de fecha puros para el módulo Calendario (strings "YYYY-MM-DD", sin
// componente de hora — mismo criterio que el resto del repo, ver
// ContentCalendarView/dateHelpers y recurrence.service.js del backend).

export function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shiftDay(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + deltaDays)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// Lunes de la semana que contiene dateStr.
export function mondayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7 // 0=lunes … 6=domingo
  return shiftDay(dateStr, -dow)
}

export function weekDates(dateStr) {
  const monday = mondayOf(dateStr)
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i))
}

const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function weekdayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7
  return `${WEEKDAY_SHORT[dow]} ${d}`
}

// "YYYY-MM" → "septiembre 2026"
export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

export function weekRangeLabel(dateStr) {
  const dates = weekDates(dateStr)
  const [fy, fm, fd] = dates[0].split('-').map(Number)
  const [ly, lm, ld] = dates[6].split('-').map(Number)
  if (fy === ly && fm === lm) return `${fd}–${ld} / ${String(fm).padStart(2, '0')} / ${fy}`
  return `${fd}/${String(fm).padStart(2, '0')} – ${ld}/${String(lm).padStart(2, '0')} / ${ly}`
}
