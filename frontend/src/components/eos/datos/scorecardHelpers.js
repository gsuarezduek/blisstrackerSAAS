// Helpers puros (sin JSX) del Scorecard EOS — períodos (ISO week + meses),
// formato de valores y metas. Compartidos por DatosTab y todos los
// subcomponentes en components/eos/datos/.

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers de períodos (ISO week + meses)
// ═══════════════════════════════════════════════════════════════════════════════

export function getISOWeek(date) {
  // Reinterpretar el Date como UTC del mismo día calendario (componentes UTC).
  // Si el Date ya estaba en UTC, no hay cambio; si vino con componentes locales,
  // se normaliza al día que el usuario "ve" sin desfase de huso horario.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return [d.getUTCFullYear(), week]
}

/** Todas las ISO weeks que pertenecen al año ISO dado (52 o 53 semanas) */
export function yearWeekPeriods(year) {
  const periods = []
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dow4 = jan4.getUTCDay() || 7
  let d = new Date(Date.UTC(year, 0, 4 - dow4 + 1)) // Lunes de W01
  while (true) {
    const [isoYear, isoWeek] = getISOWeek(d)
    if (isoYear !== year) break
    periods.push(`${isoYear}-W${String(isoWeek).padStart(2, '0')}`)
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return periods
}

/** Los 12 meses del año calendario dado */
export function yearMonthPeriods(year) {
  return Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, '0')}`
  )
}

export const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
export const MONTH_LONG  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
export const WEEK_MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

export function weekLabel(period) {
  return 'S' + parseInt(period.split('-W')[1], 10)
}

export function weekRange(period) {
  const [y, ws] = period.split('-W')
  const year = parseInt(y), week = parseInt(ws)
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dow4 = jan4.getUTCDay() || 7
  const mon  = new Date(Date.UTC(year, 0, 4 - dow4 + 1 + (week - 1) * 7))
  const sun  = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
  return { mon, sun }
}

export function weekTooltip(period) {
  const { mon, sun } = weekRange(period)
  const fmt = d => `${d.getUTCDate()} ${WEEK_MONTHS[d.getUTCMonth()]}`
  return `${fmt(mon)} – ${fmt(sun)}`
}

export function monthLabel(period) {
  return MONTH_SHORT[parseInt(period.split('-')[1], 10) - 1]
}

export function monthTooltip(period) {
  const [year, m] = period.split('-')
  return `${MONTH_LONG[parseInt(m, 10) - 1]} ${year}`
}

export function todayWeekPeriod() {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function todayMonthPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function shiftWeekPeriod(period, delta) {
  const { mon } = weekRange(period)
  const d = new Date(mon)
  d.setUTCDate(d.getUTCDate() + delta * 7)
  const [y, w] = getISOWeek(d)
  return `${y}-W${String(w).padStart(2, '0')}`
}

export function shiftMonthPeriod(period, delta) {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const TODAY_WEEK       = todayWeekPeriod()
export const TODAY_MONTH      = todayMonthPeriod()
export const TODAY_WEEK_YEAR  = parseInt(TODAY_WEEK.split('-W')[0])
export const TODAY_MONTH_YEAR = parseInt(TODAY_MONTH.split('-')[0])

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers de formato de valores y metas
// ═══════════════════════════════════════════════════════════════════════════════

export function formatVal(v) {
  if (v === null || v === undefined) return ''
  const n = Number(v)
  if (Number.isInteger(n)) return String(n)
  return String(parseFloat(n.toFixed(2)))
}

/**
 * Determina si un valor alcanza la meta según la dirección.
 * lowerIsBetter=false (default): mejor cuando value >= goal (ej: leads, ventas).
 * lowerIsBetter=true: mejor cuando value <= goal (ej: tardanzas, errores).
 * Devuelve 'on' (verde), 'off' (rojo) o null (sin meta / sin valor).
 */
export function goalStatus(value, goal, lowerIsBetter) {
  if (goal == null || value == null || isNaN(value)) return null
  const onTrack = lowerIsBetter ? value <= goal : value >= goal
  return onTrack ? 'on' : 'off'
}

/** Formatea valor con unidad. `$` va antes; el resto va después. */
export function formatWithUnit(v, unit) {
  if (v === null || v === undefined) return ''
  const formatted = formatVal(v)
  if (!unit) return formatted
  if (unit === '$') return `$${formatted}`
  return `${formatted} ${unit}`
}

/** Meta con su comparador según la dirección: "≥ 10 leads" o "≤ 5 días". */
export function goalDisplay(metric) {
  if (metric.goal == null) return ''
  const cmp = metric.lowerIsBetter ? '≤' : '≥'
  return `${cmp} ${formatWithUnit(metric.goal, metric.unit)}`
}

/**
 * Valor de una métrica en un período. Las automáticas (autoKey) lo leen de
 * `autoData` (calculado por el backend); las manuales, de `entriesMap`.
 */
export function metricValueAt(metric, period, entriesMap, autoData) {
  if (metric.autoKey) return autoData?.[metric.autoKey]?.[period]?.value ?? null
  return entriesMap[metric.id]?.[period] ?? null
}

/** Detalle (top 3) de una métrica automática en un período. */
export function metricDetailAt(metric, period, autoData) {
  if (!metric.autoKey) return null
  return autoData?.[metric.autoKey]?.[period] ?? null
}
