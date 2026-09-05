const { monthBounds, prevMonthStr, rangeLabel, rangeDataLabel } = require('../../lib/monthUtils')

// Resuelve el período de datos de un informe.
//   - Con periodStart/End explícitos → ese rango (fechas "YYYY-MM-DD").
//   - Sin ellos (legacy/default)      → el mes calendario anterior completo a `month`.
function resolveReportPeriod(month, periodStart, periodEnd) {
  const toYmd = (v) => {
    if (!v) return null
    if (typeof v === 'string') return v.slice(0, 10)
    return new Date(v).toISOString().slice(0, 10) // DateTime → YYYY-MM-DD
  }
  const s = toYmd(periodStart)
  const e = toYmd(periodEnd)
  if (s && e) return { start: s, end: e }
  const { startDate, endDate } = monthBounds(prevMonthStr(month))
  return { start: startDate, end: endDate }
}

// Metadata del período para el frontend (label + rango legible + meses cubiertos).
function buildPeriodMeta(period, monthsCovered, multiMonth) {
  return {
    start:      period.start,
    end:        period.end,
    label:      rangeLabel(period.start, period.end),      // "Junio 2026" | "Abril–Junio 2026" | "1–29 Jun 2026"
    dataLabel:  rangeDataLabel(period.start, period.end),  // "Datos del 01/06/2026 al 30/06/2026"
    months:     monthsCovered,
    multiMonth,
  }
}

function geoBand(score) {
  if (score >= 86) return 'Excelente'
  if (score >= 68) return 'Bueno'
  if (score >= 36) return 'Base'
  return 'Crítico'
}

function pct(curr, prev) {
  if (prev == null || prev === 0) return null
  return parseFloat(((curr - prev) / prev * 100).toFixed(1))
}

module.exports = { resolveReportPeriod, buildPeriodMeta, geoBand, pct }
