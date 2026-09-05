const prisma = require('../../lib/prisma')
const { prevMonthStr, monthBounds, rangeLabel } = require('../../lib/monthUtils')
const { DEFAULT_TZ } = require('../../utils/dates')

// Filtro Prisma para informes "generados" (no placeholders vacíos)
const GENERATED_WHERE = {
  OR: [
    { enabledSections: { not: null } },
    { dataCache:       { not: null } },
    { analysis:        { not: null } },
  ],
}

// ─── Período de un informe ──────────────────────────────────────────────────────
// Resuelve el rango de datos (YYYY-MM-DD). Legacy (sin periodStart) → mes completo anterior.
function reportPeriod(report) {
  if (report.periodStart && report.periodEnd) {
    return {
      start: new Date(report.periodStart).toISOString().slice(0, 10),
      end:   new Date(report.periodEnd).toISOString().slice(0, 10),
    }
  }
  const { startDate, endDate } = monthBounds(prevMonthStr(report.month))
  return { start: startDate, end: endDate }
}

function reportLabel(report) {
  const p = reportPeriod(report)
  return rangeLabel(p.start, p.end)
}

// Claves de sección válidas para `enabledSections` (deben coincidir con las del servicio/ReportViewer)
const SECTION_KEYS = [
  'objectives', 'analytics', 'performance', 'geo', 'seo', 'keywords',
  'instagram', 'tiktok', 'youtube', 'linkedin', 'facebook', 'metaAds', 'googleAds', 'competitors', 'tasks',
]

// Normaliza un array de claves de sección recibido del cliente (filtra inválidas)
function sanitizeSections(arr) {
  if (!Array.isArray(arr)) return null
  const clean = arr.filter(k => SECTION_KEYS.includes(k))
  return clean
}

function safeParseArr(str) {
  try { const v = JSON.parse(str); return Array.isArray(v) ? v : null } catch { return null }
}

function safeParseObj(str) {
  try { return JSON.parse(str || '{}') } catch { return {} }
}

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Carga los briefs del proyecto (para contextualizar el análisis IA).
async function loadBriefs(projectId) {
  try {
    const rows = await prisma.projectBrief.findMany({
      where:  { projectId },
      select: { type: true, answers: true },
    })
    return rows.map(r => ({ type: r.type, answers: r.answers || {} }))
  } catch {
    return null
  }
}

// Resumen del feedback del cliente sobre un informe (para la vista admin).
async function loadFeedbackSummary(reportId) {
  const items = await prisma.reportFeedback.findMany({
    where:   { reportId },
    orderBy: { createdAt: 'desc' },
    select:  { id: true, name: true, rating: true, comment: true, createdAt: true },
  })
  const count = items.length
  const avg   = count ? parseFloat((items.reduce((s, i) => s + i.rating, 0) / count).toFixed(1)) : null
  return { count, avg, items }
}

module.exports = {
  GENERATED_WHERE,
  SECTION_KEYS,
  reportPeriod,
  reportLabel,
  sanitizeSections,
  safeParseArr,
  safeParseObj,
  currentMonthStr,
  loadBriefs,
  loadFeedbackSummary,
}
