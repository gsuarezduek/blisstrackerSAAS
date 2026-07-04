// Utilidades de meses para informes y objetivos de marketing.
// Los meses se manejan como strings "YYYY-MM".

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const MONTH_NAMES_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

// Rango de fechas (YYYY-MM-DD) del primer y último día de un mes.
function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  const pad     = n => String(n).padStart(2, '0')
  const lastDay = new Date(y, m, 0).getDate()
  return { startDate: `${y}-${pad(m)}-01`, endDate: `${y}-${pad(m)}-${pad(lastDay)}` }
}

// Mes anterior a "YYYY-MM".
function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

// Array de `count` meses terminando en `month` (incluido), en orden ascendente.
function prevMonthsArr(month, count) {
  const months = []
  let cur = month
  for (let i = 0; i < count; i++) {
    months.unshift(cur)
    cur = prevMonthStr(cur)
  }
  return months
}

// Etiqueta legible de un mes: "Abril 2026".
function monthLabel(month) {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

// Meses "YYYY-MM" desde el inicio del período calendario que contiene `month`
// hasta `month` inclusive, en orden ascendente.
//   monthly   → [month]
//   quarterly → desde el 1er mes del trimestre calendario (Q1 ene-mar, …) hasta month
//   annual    → desde "YYYY-01" hasta month
function periodMonths(month, periodicity) {
  const [y, m] = month.split('-').map(Number)
  let startMonth
  if (periodicity === 'quarterly') {
    startMonth = Math.floor((m - 1) / 3) * 3 + 1   // 1,4,7,10
  } else if (periodicity === 'annual') {
    startMonth = 1
  } else {
    return [month] // monthly
  }
  const months = []
  for (let mm = startMonth; mm <= m; mm++) {
    months.push(`${y}-${String(mm).padStart(2, '0')}`)
  }
  return months
}

// Etiqueta del período: "Abril 2026" | "Q2 2026" | "2026".
function periodLabel(month, periodicity) {
  const [y, m] = month.split('-').map(Number)
  if (periodicity === 'quarterly') return `Q${Math.floor((m - 1) / 3) + 1} ${y}`
  if (periodicity === 'annual')    return `${y}`
  return monthLabel(month)
}

// ─── Rango de fechas (informes con período configurable) ──────────────────────
// Los rangos se manejan como strings "YYYY-MM-DD" para evitar drift de timezone.

// Parsea "YYYY-MM-DD" → { y, m, d } (números).
function parseYmd(str) {
  const [y, m, d] = String(str).split('-').map(Number)
  return { y, m, d }
}

// Último día (número) del mes de una fecha "YYYY-MM".
function lastDayOfMonth(y, m) {
  return new Date(y, m, 0).getDate()
}

// Lista de meses "YYYY-MM" que toca el rango [start, end] (inclusive), ascendente.
function monthsInRange(start, end) {
  const a = parseYmd(start)
  const b = parseYmd(end)
  const months = []
  let y = a.y, m = a.m
  while (y < b.y || (y === b.y && m <= b.m)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    if (m === 12) { m = 1; y++ } else { m++ }
  }
  return months
}

// ¿El rango cubre exactamente UN mes calendario completo? (1° al último día del mismo mes)
function isWholeSingleMonth(start, end) {
  const a = parseYmd(start)
  const b = parseYmd(end)
  return a.y === b.y && a.m === b.m && a.d === 1 && b.d === lastDayOfMonth(b.y, b.m)
}

// ¿El rango cubre uno o más meses calendario COMPLETOS? (arranca el 1° y termina el último día)
function isWholeMonths(start, end) {
  const a = parseYmd(start)
  const b = parseYmd(end)
  return a.d === 1 && b.d === lastDayOfMonth(b.y, b.m)
}

// Etiqueta legible de un rango de datos:
//   mes completo          → "Junio 2026"
//   varios meses completos → "Abril–Junio 2026"  (o "Dic 2025–Feb 2026" si cruza año)
//   parcial (mismo mes)   → "1–29 Jun 2026"
//   parcial (multi-mes)   → "10 Abr – 29 Jun 2026"
function rangeLabel(start, end) {
  const a = parseYmd(start)
  const b = parseYmd(end)

  if (isWholeSingleMonth(start, end)) return monthLabel(`${a.y}-${String(a.m).padStart(2, '0')}`)

  if (isWholeMonths(start, end)) {
    if (a.y === b.y) return `${MONTH_NAMES[a.m - 1]}–${MONTH_NAMES[b.m - 1]} ${a.y}`
    return `${MONTH_NAMES_SHORT[a.m - 1]} ${a.y}–${MONTH_NAMES_SHORT[b.m - 1]} ${b.y}`
  }

  // Parcial
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTH_NAMES_SHORT[a.m - 1]} ${a.y}`
  const left  = a.y === b.y ? `${a.d} ${MONTH_NAMES_SHORT[a.m - 1]}` : `${a.d} ${MONTH_NAMES_SHORT[a.m - 1]} ${a.y}`
  const right = `${b.d} ${MONTH_NAMES_SHORT[b.m - 1]} ${b.y}`
  return `${left} – ${right}`
}

// Etiqueta "DD/MM/AAAA" de una fecha "YYYY-MM-DD".
function dmy(str) {
  const { y, m, d } = parseYmd(str)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

// "Datos del DD/MM/AAAA al DD/MM/AAAA".
function rangeDataLabel(start, end) {
  return `Datos del ${dmy(start)} al ${dmy(end)}`
}

module.exports = {
  MONTH_NAMES,
  MONTH_NAMES_SHORT,
  monthBounds,
  prevMonthStr,
  prevMonthsArr,
  monthLabel,
  periodMonths,
  periodLabel,
  parseYmd,
  lastDayOfMonth,
  monthsInRange,
  isWholeSingleMonth,
  isWholeMonths,
  rangeLabel,
  rangeDataLabel,
  dmy,
}
