const prisma = require('../lib/prisma')
const { DEFAULT_TZ } = require('../utils/dates')

const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 }

function normSeverity(sev) {
  const s = String(sev || '').toLowerCase()
  if (['critical', 'critico', 'crítico', 'alta', 'high', 'error'].includes(s)) return 'high'
  if (['warning', 'media', 'medium', 'warn'].includes(s))                       return 'medium'
  return 'low'
}

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Extrae términos significativos (>3 chars) de textos del brief, para matchear títulos
function extractTerms(texts) {
  const set = new Set()
  for (const t of texts) {
    if (!t || typeof t !== 'string') continue
    for (const raw of t.split(/[\n,;]+/)) {
      const term = raw.trim().toLowerCase()
      if (term.length > 3) set.add(term)
    }
  }
  return [...set]
}

/**
 * Agrega los diagnósticos ya guardados (GEO, canibalización, PageSpeed, keywords) en
 * un backlog priorizado. Determinístico, sin IA, sin persistir — extraído de
 * seoOpportunities.controller.js `getActionPlan` para reusarlo también desde el panel
 * cross-área "Hoy" (marketingPending.service.js). Devuelve `null` si el proyecto no
 * existe en el workspace.
 */
async function computeSeoActionItems({ projectId, workspaceId }) {
  const month = currentMonthStr()

  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true, name: true } })
  if (!project) return null

  const [geoAudit, cannibal, psMobile, psDesktop, kwRankings, brief] = await Promise.all([
    prisma.geoAudit.findFirst({
      where: { projectId, workspaceId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, score: true, findings: true, createdAt: true },
    }),
    prisma.cannibalReport.findFirst({
      where: { projectId, workspaceId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, conflicts: true, criticalCount: true, warningCount: true, createdAt: true },
    }),
    prisma.pageSpeedResult.findFirst({
      where: { projectId, workspaceId, strategy: 'mobile', status: 'done' },
      orderBy: { createdAt: 'desc' },
      select: { performanceScore: true, createdAt: true },
    }),
    prisma.pageSpeedResult.findFirst({
      where: { projectId, workspaceId, strategy: 'desktop', status: 'done' },
      orderBy: { createdAt: 'desc' },
      select: { performanceScore: true, createdAt: true },
    }),
    prisma.keywordRanking.findMany({
      where: { projectId, workspaceId, month, position: { gte: 3.5, lte: 20 } },
      select: { position: true, impressions: true, clicks: true, trackedKeyword: { select: { query: true } } },
    }),
    prisma.projectBrief.findUnique({
      where: { projectId_type: { projectId, type: 'seo_sem' } },
      select: { answers: true },
    }),
  ])

  const items = []
  let n = 0
  const push = (it) => items.push({ key: `it-${n++}`, ...it })

  // GEO findings
  if (geoAudit?.findings) {
    let findings = []
    try { findings = JSON.parse(geoAudit.findings) } catch {}
    for (const f of findings) {
      push({
        source: 'geo', category: 'GEO',
        title:  f.action || f.title || 'Mejora GEO',
        detail: f.description || f.impact || '',
        priority: normSeverity(f.severity),
      })
    }
  }

  // Canibalización (top conflictos por severidad)
  if (cannibal?.conflicts) {
    let conflicts = []
    try { conflicts = JSON.parse(cannibal.conflicts) } catch {}
    conflicts
      .slice()
      .sort((a, b) => (b.severityScore || 0) - (a.severityScore || 0))
      .slice(0, 10)
      .forEach(c => push({
        source: 'cannibal', category: 'Canibalización',
        title:  `Resolver canibalización: "${c.query}"`,
        detail: `${(c.urls?.length ?? 0)} URLs compiten por la misma query · ${c.totalImpressions ?? 0} impresiones en juego`,
        priority: normSeverity(c.severity),
      }))
  }

  // PageSpeed
  const psItem = (score, strategy) => {
    if (score == null || score >= 90) return
    push({
      source: 'pagespeed', category: 'Performance',
      title:  `Mejorar performance ${strategy} (${score}/100)`,
      detail: 'La velocidad de carga afecta el ranking y la conversión. Revisá oportunidades en la pestaña Web → Performance.',
      priority: score < 50 ? 'high' : score < 70 ? 'medium' : 'low',
    })
  }
  psItem(psMobile?.performanceScore, 'mobile')
  psItem(psDesktop?.performanceScore, 'desktop')

  // Keywords a distancia de golpe (trackeadas)
  kwRankings
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
    .slice(0, 10)
    .forEach(r => push({
      source: 'keywords', category: 'Keywords',
      title:  `Empujar "${r.trackedKeyword.query}" a top 3 (hoy #${r.position.toFixed(1)})`,
      detail: `${r.impressions} impresiones · ${r.clicks} clicks este mes. Mejorá el contenido y los enlaces internos de la página que rankea.`,
      priority: r.position <= 10 ? 'high' : 'medium',
    }))

  // Foco del cliente (brief SEO/SEM) → prioriza items que lo mencionan
  const answers = brief?.answers && typeof brief.answers === 'object' ? brief.answers : {}
  const focus = {
    objetivo:             answers.objetivo || null,
    servicios_posicionar: answers.servicios_posicionar || null,
    keywords_objetivo:    answers.keywords_objetivo || null,
    urls_prioritarias:    answers.urls_prioritarias || null,
  }
  const focusTerms = extractTerms([answers.keywords_objetivo, answers.servicios_posicionar])
  for (const it of items) {
    it.focus = focusTerms.length > 0 && focusTerms.some(t => it.title.toLowerCase().includes(t))
  }

  // Orden: foco del cliente primero, luego prioridad
  items.sort((a, b) =>
    (b.focus - a.focus) ||
    (PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]),
  )

  return {
    projectName: project.name,
    items,
    focus,
    sources: {
      geo:       geoAudit  ? { present: true, date: geoAudit.createdAt,  score: geoAudit.score } : { present: false },
      cannibal:  cannibal  ? { present: true, date: cannibal.createdAt,  critical: cannibal.criticalCount, warning: cannibal.warningCount } : { present: false },
      pagespeed: (psMobile || psDesktop) ? { present: true, mobile: psMobile?.performanceScore ?? null, desktop: psDesktop?.performanceScore ?? null } : { present: false },
      keywords:  { present: kwRankings.length > 0, count: kwRankings.length, month },
    },
    counts: { total: items.length, high: items.filter(i => i.priority === 'high').length },
  }
}

module.exports = { computeSeoActionItems, PRIORITY_WEIGHT }
