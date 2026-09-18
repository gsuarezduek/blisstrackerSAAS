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

// Firma del informe: nombre + foto + rol de quién lo generó/regeneró por última vez
// (MonthlyReport.generatedById). Se muestra tanto en la vista interna como en el link
// público y el portal de cliente — el avatar se sirve desde un endpoint público
// (/api/avatars/img/:filename), así que no hay problema en exponerlo sin auth.
// null si el informe nunca se generó (placeholder recién creado) o el usuario ya no existe.
async function loadSignature(generatedById, workspaceId) {
  if (!generatedById) return null
  const [user, member] = await Promise.all([
    prisma.user.findUnique({ where: { id: generatedById }, select: { name: true, avatar: true } }),
    prisma.workspaceMember.findUnique({
      where:  { workspaceId_userId: { workspaceId, userId: generatedById } },
      select: { teamRole: true },
    }),
  ])
  if (!user) return null

  let role = null
  if (member?.teamRole) {
    const userRole = await prisma.userRole.findUnique({
      where:  { workspaceId_name: { workspaceId, name: member.teamRole } },
      select: { label: true },
    })
    role = userRole?.label || member.teamRole
  }

  return { name: user.name, avatar: user.avatar, role }
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
  loadSignature,
}
