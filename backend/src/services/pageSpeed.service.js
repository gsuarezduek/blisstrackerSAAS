const axios = require('axios')

const PAGESPEED_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

// ─── Rating helpers ───────────────────────────────────────────────────────────

function scoreRating(score) {
  if (score == null) return null
  if (score >= 0.9) return 'good'
  if (score >= 0.5) return 'needs-improvement'
  return 'poor'
}

function parseAudit(audits, id) {
  const a = audits[id]
  if (!a) return null
  return {
    displayValue: a.displayValue  ?? null,
    numericValue: a.numericValue  ?? null,
    score:        a.score         ?? null,
    rating:       scoreRating(a.score),
  }
}

// ─── Qué hay que arreglar, no solo cuánto falta ──────────────────────────
// El parser guardaba de cada oportunidad el título, la descripción y los ms ahorrados, y
// tiraba `details.items` — que es justo dónde Google dice QUÉ recurso frena la página. Por
// eso el informe quedaba en "74/100" sin nada accionable. Los items vienen con nombres de
// campo distintos según el audit (`url`, `node`, `entity`, `source`...), así que se
// normalizan a una sola forma.
const MAX_ITEMS_PER_AUDIT = 5

// Un item de Lighthouse puede identificar el culpable de varias formas; se toma la
// primera que exista, en este orden.
function itemLabel(item) {
  if (typeof item.url === 'string' && item.url) return item.url
  if (typeof item.source === 'string') return item.source
  if (item.source?.url) return item.source.url
  if (item.node?.nodeLabel) return item.node.nodeLabel
  if (item.node?.selector) return item.node.selector
  if (typeof item.entity === 'string') return item.entity
  if (item.entity?.text) return item.entity.text
  if (typeof item.groupLabel === 'string') return item.groupLabel
  if (typeof item.statistic === 'string') return item.statistic
  return null
}

function parseItems(audit) {
  const items = audit?.details?.items
  if (!Array.isArray(items)) return []
  return items
    .slice(0, MAX_ITEMS_PER_AUDIT)
    .map(it => ({
      label:       itemLabel(it),
      snippet:     typeof it.node?.snippet === 'string' ? it.node.snippet.slice(0, 300) : null,
      wastedMs:    typeof it.wastedMs    === 'number' ? Math.round(it.wastedMs)    : null,
      wastedBytes: typeof it.wastedBytes === 'number' ? Math.round(it.wastedBytes) : null,
      totalBytes:  typeof it.totalBytes  === 'number' ? Math.round(it.totalBytes)  : null,
      blockingTime: typeof it.blockingTime === 'number' ? Math.round(it.blockingTime)
        : typeof it.mainThreadTime === 'number' ? Math.round(it.mainThreadTime) : null,
    }))
    .filter(it => it.label || it.snippet)
}

// Audits que nombran al culpable aunque Lighthouse no los marque como "opportunity".
// `largest-contentful-paint-element` es el más importante de todos — dice QUÉ elemento es
// el LCP — y se perdía porque el filtro de diagnósticos pedía `details.type === 'table'`
// y este viene como 'list'.
const CULPRIT_AUDITS = [
  'largest-contentful-paint-element',
  'render-blocking-resources',
  'third-party-summary',
  'mainthread-work-breakdown',
  'bootup-time',
  'unused-javascript',
  'unused-css-rules',
  'legacy-javascript',
  'uses-responsive-images',
  'modern-image-formats',
  'unsized-images',
  'layout-shift-elements',
  'font-display',
  'critical-request-chains',
  'server-response-time',
]

// ─── Datos de campo (CrUX) ─────────────────────────────────────────
// La misma respuesta de la API trae las métricas de USUARIOS REALES (28 días, Chrome UX
// Report) y se descartaban: el informe mostraba solo el score de laboratorio, que es una
// simulación con red y CPU fijas. Un 74 de laboratorio con buenos datos de campo no es lo
// mismo que un 74 con malos datos de campo, y la acción que corresponde es distinta.
const CRUX_KEYS = {
  LARGEST_CONTENTFUL_PAINT_MS:      'lcp',
  INTERACTION_TO_NEXT_PAINT:        'inp',
  CUMULATIVE_LAYOUT_SHIFT_SCORE:    'cls',
  FIRST_CONTENTFUL_PAINT_MS:        'fcp',
  EXPERIMENTAL_TIME_TO_FIRST_BYTE:  'ttfb',
}

const CRUX_CATEGORY = { FAST: 'good', AVERAGE: 'needs-improvement', SLOW: 'poor' }

function parseFieldData(experience) {
  const metrics = experience?.metrics
  if (!metrics) return null
  const out = {}
  for (const [apiKey, key] of Object.entries(CRUX_KEYS)) {
    const m = metrics[apiKey]
    if (!m) continue
    out[key] = {
      // CLS viene multiplicado por 100 en CrUX (un CLS de 0.1 llega como 10).
      numericValue: key === 'cls' ? m.percentile / 100 : m.percentile,
      rating:       CRUX_CATEGORY[m.category] ?? null,
    }
  }
  if (Object.keys(out).length === 0) return null
  out.overall = CRUX_CATEGORY[experience.overall_category] ?? null
  return out
}

// ─── Response parser ────────────────────────────────────────

function parseResult(data) {
  const lhr    = data.lighthouseResult ?? {}
  const audits = lhr.audits            ?? {}

  const performanceScore = lhr.categories?.performance?.score != null
    ? Math.round(lhr.categories.performance.score * 100)
    : null

  const metrics = {
    lcp:  parseAudit(audits, 'largest-contentful-paint'),
    fcp:  parseAudit(audits, 'first-contentful-paint'),
    tbt:  parseAudit(audits, 'total-blocking-time'),
    cls:  parseAudit(audits, 'cumulative-layout-shift'),
    si:   parseAudit(audits, 'speed-index'),
    ttfb: parseAudit(audits, 'server-response-time'),
    // Datos de campo (CrUX): de esta URL y, si no hay suficiente tráfico, del origen.
    // Viven dentro de `metrics` porque son las MISMAS métricas con otra fuente — así no
    // hace falta una columna nueva en PageSpeedResult.
    field:       parseFieldData(data.loadingExperience),
    fieldOrigin: parseFieldData(data.originLoadingExperience),
  }

  // Oportunidades: audits tipo 'opportunity' con mejoras estimadas (con ahorros en ms primero)
  const opportunities = Object.values(audits)
    .filter(a =>
      a.details?.type === 'opportunity' &&
      a.score !== null &&
      a.score !== undefined &&
      a.score < 1
    )
    .sort((a, b) => (b.details?.overallSavingsMs ?? 0) - (a.details?.overallSavingsMs ?? 0))
    .map(a => ({
      id:          a.id,
      title:       a.title,
      description: a.description,
      savingsMs:   Math.round(a.details?.overallSavingsMs ?? 0),
      score:       a.score,
      type:        'opportunity',
      items:       parseItems(a),
    }))

  const opportunityIds = new Set(opportunities.map(o => o.id))

  // Diagnósticos: audits fallidos que no son oportunidades (igualmente accionables). Ya no
  // se piden solo los de tipo 'table': los que nombran al culpable vienen como 'list',
  // 'criticalrequestchain' o 'debugdata' (ver CULPRIT_AUDITS).
  const diagnostics = Object.values(audits)
    .filter(a =>
      !opportunityIds.has(a.id) &&
      a.score !== null &&
      a.score !== undefined &&
      a.score < 1 &&
      (a.details?.type === 'table' || CULPRIT_AUDITS.includes(a.id))
    )
    .map(a => ({
      id:           a.id,
      title:        a.title,
      description:  a.description,
      displayValue: a.displayValue ?? null,
      score:        a.score,
      type:         'diagnostic',
      items:        parseItems(a),
    }))
    // Primero los que nombran al culpable: son los accionables.
    .sort((a, b) => (b.items.length > 0) - (a.items.length > 0))

  return { performanceScore, metrics, opportunities, diagnostics }
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Llama a la PageSpeed Insights API y devuelve el resultado parseado.
 * @param {string} url
 * @param {'mobile'|'desktop'} strategy
 * @returns {Promise<object>}
 */
async function runPageSpeedAnalysis(url, strategy = 'mobile') {
  const apiKey = process.env.PAGESPEED_API_KEY
  if (!apiKey) throw new Error('PAGESPEED_API_KEY no configurada en el entorno')

  try {
    const { data } = await axios.get(PAGESPEED_API, {
      params:  { url, strategy, key: apiKey, category: 'performance', locale: 'es' },
      timeout: 90_000,
    })
    return parseResult(data)
  } catch (err) {
    // Extraer el mensaje real de Google si viene en el body
    const googleMsg = err.response?.data?.error?.message
    const status    = err.response?.status
    console.error('[PageSpeed] Error de API:', status, googleMsg ?? err.message)
    if (err.response?.data) {
      console.error('[PageSpeed] Body:', JSON.stringify(err.response.data).slice(0, 500))
    }
    throw new Error(googleMsg ?? err.message)
  }
}

/**
 * Cron mensual: corre ambas estrategias (mobile + desktop) para todos los
 * proyectos con websiteUrl configurada. Se ejecuta el 1° de cada mes.
 */
async function runAllMonthlyPageSpeed() {
  const prisma = require('../lib/prisma')
const { MARKETING_PROJECT_WHERE } = require('../lib/projectModules')
  const { enabledWorkspaceIds } = require('../lib/featureFlags')

  const { projectPageSpeedUrls } = require('../lib/pageSpeedUrls')

  const enabled = await enabledWorkspaceIds('marketing')
  const projects = enabled.size === 0 ? [] : await prisma.project.findMany({
    where:  { websiteUrl: { not: null }, active: true, workspaceId: { in: [...enabled] }, ...MARKETING_PROJECT_WHERE },
    select: {
      id: true, workspaceId: true, websiteUrl: true, name: true,
      briefs: { where: { type: 'seo_sem' }, select: { answers: true } },
    },
  })

  console.log(`[PageSpeed] Análisis mensual automático: ${projects.length} proyecto(s)`)
  let ok = 0, fail = 0

  for (const p of projects) {
    const urls = projectPageSpeedUrls(p.websiteUrl, p.briefs?.[0]?.answers?.urls_prioritarias)

    for (const { url, isHome } of urls) {
      // El home se mide en mobile y desktop; las páginas prioritarias solo en mobile —
      // es el índice con el que Google rankea, y duplicar las llamadas por cada URL
      // extra no agrega una decisión distinta. Desde la UI se puede pedir cualquiera.
      for (const strategy of (isHome ? ['mobile', 'desktop'] : ['mobile'])) {
        try {
          const result = await runPageSpeedAnalysis(url, strategy)
          await prisma.pageSpeedResult.create({
            data: {
              workspaceId:      p.workspaceId,
              projectId:        p.id,
              url,
              strategy,
              status:           'done',
              performanceScore: result.performanceScore,
              metrics:          JSON.stringify(result.metrics),
              opportunities:    JSON.stringify(result.opportunities),
              diagnostics:      JSON.stringify(result.diagnostics),
            },
          })
          ok++
        } catch (err) {
          console.error(`[PageSpeed] Error en "${p.name}" ${url} (${strategy}):`, err.message)
          fail++
        }
        // Pausa entre llamadas para no saturar la cuota
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  console.log(`[PageSpeed] Mensual completado: ${ok} OK, ${fail} errores.`)
}

module.exports = { runPageSpeedAnalysis, runAllMonthlyPageSpeed, parseResult, parseItems, parseFieldData, CULPRIT_AUDITS }
