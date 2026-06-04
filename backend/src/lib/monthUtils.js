// Utilidades de meses para informes y objetivos de marketing.
// Los meses se manejan como strings "YYYY-MM".

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
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

module.exports = {
  MONTH_NAMES,
  monthBounds,
  prevMonthStr,
  prevMonthsArr,
  monthLabel,
  periodMonths,
  periodLabel,
}
