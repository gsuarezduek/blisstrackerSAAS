const prisma = require('../lib/prisma')
const { todayString, DEFAULT_TZ } = require('../utils/dates')
const { createTtlCache } = require('../lib/ttlCache')
const { computeSeoActionItems, PRIORITY_WEIGHT } = require('./seoActionPlan.service')
const { computeObjectives } = require('./marketingObjectives.service')
const { prevMonthStr, monthLabel } = require('../lib/monthUtils')
const { MARKETING_SECTION_IDS } = require('../lib/marketingSections')

const ADS_PLATFORM_LABEL = { meta_ads: 'Meta Ads', google_ads: 'Google Ads' }
const ADS_PLATFORM_SUB   = { meta_ads: 'meta-ads', google_ads: 'google-ads' }
const RRSS_PLATFORM_LABEL = { instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', facebook: 'Facebook', youtube: 'YouTube' }

// Bucket de "Prioridades" (id de NAV de Marketing) al que pertenece cada item, para
// agrupar y limitar a top-3 por sección. `content` no mapea a ninguna de las 6
// secciones toggleables — vive en su propio bucket "contenido", siempre visible.
const SECTION_BY_SOURCE = {
  geo: 'geo-seo', cannibal: 'geo-seo', keywords: 'geo-seo',
  pagespeed: 'web',
  ads_advisor: 'anuncios',
  rrss_advisor: 'rrss',
  report: 'informes',
}
const SECTION_BY_OBJ_CATEGORY = { web: 'web', seo: 'geo-seo', rrss: 'rrss', ads: 'anuncios' }
const SECTION_LABELS = {
  'geo-seo': '🤖 GEO / SEO', web: '🌐 Web', rrss: '📱 RRSS', anuncios: '📣 Anuncios', informes: '📊 Informes',
}
const CONTENIDO_LABEL = '🗓️ Contenido'

function sectionOf(it) {
  if (it.source === 'content') return 'contenido'
  if (it.source === 'objective') return SECTION_BY_OBJ_CATEGORY[it.objCategory] ?? 'informes'
  return SECTION_BY_SOURCE[it.source] ?? 'informes'
}

// Identidad de un hallazgo para "ignorar": título normalizado. Para fuentes
// determinísticas (cannibal/pagespeed/keywords/content/objective) el título embebe un
// dato real (query, nombre de pieza, label) y es 100% estable entre recálculos. Para
// geo/ads_advisor es texto libre de IA — sobrevive solo si la redacción no cambia entre
// corridas (limitación conocida y documentada, no resuelta acá).
function normalizeTitle(title) {
  return String(title || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function daysAgo(date) {
  if (!date) return null
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000))
}

// Objetivos atrasados (fail/partial) del mes en curso → hallazgos del panel.
async function objectiveItems({ projectId, workspaceId, tz }) {
  const dataMonth = todayString(tz).slice(0, 7)
  const results = await computeObjectives({ projectId, workspaceId, dataMonth })
  return results
    .filter(o => o.status === 'fail' || o.status === 'partial')
    .map(o => ({
      source: 'objective', category: 'Objetivos', objCategory: o.category,
      title:  `${o.label}: ${o.actual ?? '—'}${o.unit} vs. meta ${o.target}${o.unit}`,
      detail: `${o.periodLabel} · ${o.pct != null ? `${o.pct}%` : 'sin dato'}`,
      priority: o.status === 'fail' ? 'high' : 'medium',
      taskPrefix: 'Objetivos',
      link: { tab: 'informes' },
    }))
}

// El informe del mes calendario anterior todavía no fue generado → recordatorio para
// el bucket "Informes" de Prioridades (única fuente hoy para esa sección).
async function reportItems({ projectId, workspaceId, tz }) {
  const month = todayString(tz).slice(0, 7)
  const prevMonth = prevMonthStr(month)
  const report = await prisma.monthlyReport.findUnique({
    where:  { projectId_month: { projectId, month: prevMonth } },
    select: { enabledSections: true, dataCache: true, analysis: true },
  })
  const isGenerated = !!report && (report.enabledSections != null || report.dataCache != null || report.analysis != null)
  if (isGenerated) return []
  return [{
    source: 'report', category: 'Informes',
    title:  `Generar el informe de ${monthLabel(prevMonth)}`,
    detail: 'El informe del mes anterior todavía no fue generado — el cliente no tiene visibilidad de los resultados recientes.',
    priority: 'medium',
    taskPrefix: 'Informes',
    link: { tab: 'informes' },
  }]
}

// Piezas de Contenido que requieren atención del equipo (cambios pedidos) o
// seguimiento (esperando aprobación del cliente hace rato).
async function contentItems({ projectId, workspaceId }) {
  const pieces = await prisma.contentPiece.findMany({
    where:  { projectId, workspaceId, status: { in: ['cambios', 'aprobacion'] } },
    select: { id: true, title: true, status: true, submittedAt: true, changesRequestedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })
  return pieces.map(p => {
    const isCambios = p.status === 'cambios'
    const since = daysAgo(isCambios ? p.changesRequestedAt : p.submittedAt)
    const sinceTxt = since == null ? '' : since === 0 ? ' (hoy)' : ` (hace ${since} día${since === 1 ? '' : 's'})`
    return {
      source: 'content', category: 'Contenido',
      title:  isCambios
        ? `Corregir "${p.title}" — el cliente pidió cambios`
        : `Seguimiento: "${p.title}" espera aprobación del cliente`,
      detail: isCambios
        ? `Pedido de cambios${sinceTxt}. Ajustá y volvé a enviar a aprobación.`
        : `Sin respuesta del cliente${sinceTxt}.`,
      priority: isCambios ? 'high' : 'medium',
      taskPrefix: 'Contenido',
      href: `/contenido?projectId=${projectId}&piece=${p.id}`,
    }
  })
}

// Último diagnóstico guardado del Ads Advisor (solo prioridad alta) por plataforma.
async function adsItems({ projectId, workspaceId }) {
  const rows = await prisma.adsAdvisorResult.findMany({ where: { projectId, workspaceId } })
  const items = []
  for (const row of rows) {
    let diagnostico = []
    try { diagnostico = JSON.parse(row.diagnostico) } catch {}
    const label = ADS_PLATFORM_LABEL[row.platform] ?? row.platform
    diagnostico
      .filter(d => d.prioridad === 'alta')
      .forEach(d => items.push({
        source: 'ads_advisor', category: label,
        title:  d.titulo,
        detail: d.detalle,
        priority: 'high',
        taskPrefix: label,
        link: { tab: 'anuncios', sub: ADS_PLATFORM_SUB[row.platform] },
      }))
  }
  return items
}

// Último diagnóstico guardado del RRSS Advisor (solo prioridad alta) por red social.
async function rrssItems({ projectId, workspaceId }) {
  const rows = await prisma.rrssAdvisorResult.findMany({ where: { projectId, workspaceId } })
  const items = []
  for (const row of rows) {
    let diagnostico = []
    try { diagnostico = JSON.parse(row.diagnostico) } catch {}
    const label = RRSS_PLATFORM_LABEL[row.platform] ?? row.platform
    diagnostico
      .filter(d => d.prioridad === 'alta')
      .forEach(d => items.push({
        source: 'rrss_advisor', category: label,
        title:  d.titulo,
        detail: d.detalle,
        priority: 'high',
        taskPrefix: label,
        link: { tab: 'rrss', sub: row.platform },
      }))
  }
  return items
}

/**
 * Backlog único de pendientes accionables de un proyecto: SEO/GEO (Plan de acción ya
 * existente), objetivos atrasados, contenido que requiere atención del equipo, el
 * último diagnóstico de Ads Advisor y de RRSS Advisor guardados (prioridad alta), e
 * informe del mes anterior sin generar. Todo lectura de datos ya calculados/guardados
 * — sin llamadas a IA ni a APIs externas en el momento. Además de la lista plana
 * `items` (para seleccionar/crear tareas en masa e ignorar), devuelve `groups`: los
 * mismos items agrupados por sección de NAV y recortados a top-3, para el panel
 * "Prioridades". Los items cuya sección esté deshabilitada
 * (`Workspace.marketingDisabledSections`) se excluyen por completo (excepto
 * Contenido, que no es una de las 6 secciones toggleables).
 */
async function computeProjectPendingItems({ projectId, workspaceId, tz = DEFAULT_TZ }) {
  const [seo, objectives, content, ads, rrss, reports, dismissed, workspace] = await Promise.all([
    computeSeoActionItems({ projectId, workspaceId }).catch(() => null),
    objectiveItems({ projectId, workspaceId, tz }).catch(() => []),
    contentItems({ projectId, workspaceId }).catch(() => []),
    adsItems({ projectId, workspaceId }).catch(() => []),
    rrssItems({ projectId, workspaceId }).catch(() => []),
    reportItems({ projectId, workspaceId, tz }).catch(() => []),
    prisma.dismissedFinding.findMany({ where: { projectId, workspaceId }, select: { source: true, signature: true } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { marketingDisabledSections: true } }),
  ])
  if (!seo) return null

  const disabledSections = JSON.parse(workspace?.marketingDisabledSections || '[]')
  const dismissedSet = new Set(dismissed.map(d => `${d.source}:${d.signature}`))

  const seoItems = seo.items.map(it => ({ ...it, taskPrefix: 'SEO', link: { tab: 'geo-seo', sub: 'plan' } }))
  const allItems = [...seoItems, ...objectives, ...content, ...ads, ...rrss, ...reports].map(it => ({ ...it, section: sectionOf(it) }))

  const items = allItems
    .filter(it => it.section === 'contenido' || !disabledSections.includes(it.section))
    .filter(it => !dismissedSet.has(`${it.source}:${normalizeTitle(it.title)}`))
    .sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority])
    .map(({ key, ...rest }, i) => ({ key: `p-${i}`, ...rest }))

  const groups = MARKETING_SECTION_IDS
    .filter(id => id !== 'hoy' && !disabledSections.includes(id))
    .map(id => {
      const all = items.filter(it => it.section === id)
      return { id, label: SECTION_LABELS[id], items: all.slice(0, 3), moreCount: Math.max(0, all.length - 3), total: all.length }
    })
  const contenidoAll = items.filter(it => it.section === 'contenido')
  if (contenidoAll.length > 0) {
    groups.push({ id: 'contenido', label: CONTENIDO_LABEL, items: contenidoAll.slice(0, 3), moreCount: Math.max(0, contenidoAll.length - 3), total: contenidoAll.length })
  }

  return {
    projectName: seo.projectName,
    items,
    groups,
    counts: { total: items.length, high: items.filter(i => i.priority === 'high').length },
    dismissedCount: dismissed.length,
  }
}

const pendingCache = createTtlCache({ ttlMs: 5 * 60 * 1000, max: 200 })

/**
 * Vista cross-proyecto: cuántos pendientes tiene cada proyecto activo del workspace,
 * para el panel "Prioridades" sin proyecto seleccionado. Cacheado 5 min (mismo criterio que
 * health-score) porque recorre todos los proyectos del workspace en cada carga.
 */
async function computeWorkspacePendingSummary({ workspaceId, tz = DEFAULT_TZ }) {
  return pendingCache.through(`pending:${workspaceId}`, async () => {
    const projects = await prisma.project.findMany({
      where:  { workspaceId, active: true },
      select: { id: true, name: true },
    })
    const results = await Promise.all(projects.map(async p => {
      const pending = await computeProjectPendingItems({ projectId: p.id, workspaceId, tz }).catch(() => null)
      if (!pending) return null
      return { projectId: p.id, projectName: p.name, total: pending.counts.total, high: pending.counts.high }
    }))
    return results
      .filter(r => r && r.total > 0)
      .sort((a, b) => b.high - a.high || b.total - a.total)
  })
}

function invalidateWorkspacePending(workspaceId) {
  pendingCache.del(`pending:${workspaceId}`)
}

/**
 * Ignora un hallazgo del panel "Prioridades" (por proyecto+fuente+título normalizado).
 * Idempotente: ignorarlo dos veces no falla ni duplica fila.
 */
async function dismissFinding({ workspaceId, projectId, source, title, userId }) {
  const signature = normalizeTitle(title)
  await prisma.dismissedFinding.upsert({
    where:  { projectId_source_signature: { projectId, source, signature } },
    update: {},
    create: { workspaceId, projectId, source, signature, title, dismissedById: userId ?? null },
  })
  invalidateWorkspacePending(workspaceId)
}

async function listDismissedFindings({ workspaceId, projectId }) {
  return prisma.dismissedFinding.findMany({
    where:   { projectId, workspaceId },
    orderBy: { dismissedAt: 'desc' },
    select:  { id: true, source: true, title: true, dismissedAt: true },
  })
}

async function undismissFinding({ workspaceId, projectId, id }) {
  const { count } = await prisma.dismissedFinding.deleteMany({ where: { id, projectId, workspaceId } })
  if (count > 0) invalidateWorkspacePending(workspaceId)
  return count > 0
}

module.exports = {
  computeProjectPendingItems, computeWorkspacePendingSummary,
  dismissFinding, listDismissedFindings, undismissFinding,
}
