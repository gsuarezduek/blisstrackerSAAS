const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key) {
  const [y, m] = key.split('-')
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`
}

// Primer y último día del mes como "YYYY-MM-DD", el formato de los filtros de fecha.
export function monthRange(key) {
  const [y, m] = key.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${key}-01`, to: `${key}-${String(lastDay).padStart(2, '0')}` }
}

// Meses del selector de período: del mes actual hacia atrás hasta el primer
// mes con datos (`firstMonth`, "YYYY-MM" o null si todavía no hay nada),
// como mucho `max`. Ofrecer 24 meses vacíos era ruido; para ir más atrás
// están "Todas las fechas" y "Fecha personalizada".
export const MAX_MONTHS_IN_SELECT = 12

export function selectableMonths(firstMonth, current = currentMonthKey(), max = MAX_MONTHS_IN_SELECT) {
  const months = [current]
  let m = current
  while (months.length < max && firstMonth && shiftMonth(m, -1) >= firstMonth) {
    m = shiftMonth(m, -1)
    months.push(m)
  }
  return months
}
