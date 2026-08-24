const prisma = require('../lib/prisma')
const { todayString, DEFAULT_TZ } = require('../utils/dates')
const { createTtlCache } = require('../lib/ttlCache')
const { computeSeoActionItems, PRIORITY_WEIGHT } = require('./seoActionPlan.service')
const { computeObjectives } = require('./marketingObjectives.service')

const ADS_PLATFORM_LABEL = { meta_ads: 'Meta Ads', google_ads: 'Google Ads' }
const ADS_PLATFORM_SUB   = { meta_ads: 'meta-ads', google_ads: 'google-ads' }

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
      source: 'objective', category: 'Objetivos',
      title:  `${o.label}: ${o.actual ?? '—'}${o.unit} vs. meta ${o.target}${o.unit}`,
      detail: `${o.periodLabel} · ${o.pct != null ? `${o.pct}%` : 'sin dato'}`,
      priority: o.status === 'fail' ? 'high' : 'medium',
      taskPrefix: 'Objetivos',
      link: { tab: 'informes' },
    }))
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

/**
 * Backlog único de pendientes accionables de un proyecto: SEO/GEO (Plan de acción ya
 * existente), objetivos atrasados, contenido que requiere atención del equipo, y el
 * último diagnóstico de Ads Advisor guardado (prioridad alta). Todo lectura de datos
 * ya calculados/guardados — sin llamadas a IA ni a APIs externas.
 */
async function computeProjectPendingItems({ projectId, workspaceId, tz = DEFAULT_TZ }) {
  const [seo, objectives, content, ads] = await Promise.all([
    computeSeoActionItems({ projectId, workspaceId }).catch(() => null),
    objectiveItems({ projectId, workspaceId, tz }).catch(() => []),
    contentItems({ projectId, workspaceId }).catch(() => []),
    adsItems({ projectId, workspaceId }).catch(() => []),
  ])
  if (!seo) return null

  const seoItems = seo.items.map(it => ({ ...it, taskPrefix: 'SEO', link: { tab: 'geo-seo', sub: 'plan' } }))
  const items = [...seoItems, ...objectives, ...content, ...ads]
    .sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority])
    .map(({ key, ...rest }, i) => ({ key: `p-${i}`, ...rest }))

  return {
    projectName: seo.projectName,
    items,
    counts: { total: items.length, high: items.filter(i => i.priority === 'high').length },
  }
}

const pendingCache = createTtlCache({ ttlMs: 5 * 60 * 1000, max: 200 })

/**
 * Vista cross-proyecto: cuántos pendientes tiene cada proyecto activo del workspace,
 * para el panel "Hoy" sin proyecto seleccionado. Cacheado 5 min (mismo criterio que
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

module.exports = { computeProjectPendingItems, computeWorkspacePendingSummary }
