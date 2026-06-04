// Catálogo único de objetivos de marketing.
// Lo usan: el controller (validación), el motor de cómputo y (replicado) el frontend.
//
// Cada métrica define:
//   - category    : "web" | "seo" | "rrss" | "ads"
//   - label       : nombre legible
//   - unit        : "" | "%" | "$" | "pos"  (cómo se formatea el valor/target)
//   - direction   : "higher" (mayor es mejor) | "lower" (menor es mejor) | "info" (informativo)
//   - aggregation : "flow" (acumula meses del período) | "stock" (último valor del período)
//   - param       : param obligatorio extra ("trackedKeywordId" | "competitorId" | "platform" | null)

const METRICS = {
  // WEB
  visitas:        { category: 'web',  label: 'Visitas al sitio',     unit: '',    direction: 'higher', aggregation: 'flow',  param: null },
  leads:          { category: 'web',  label: 'Leads (eventos clave)', unit: '',   direction: 'higher', aggregation: 'flow',  param: null },
  performance:    { category: 'web',  label: 'Performance web',      unit: '',    direction: 'higher', aggregation: 'stock', param: null },
  // SEO / GEO
  posicionamiento:{ category: 'seo',  label: 'Posicionamiento SEO',  unit: 'pos', direction: 'lower',  aggregation: 'stock', param: 'trackedKeywordId' },
  // RRSS
  seguidores:     { category: 'rrss', label: 'Seguidores nuevos',    unit: '',    direction: 'higher', aggregation: 'flow',  param: null },
  interaccion:    { category: 'rrss', label: 'Interacciones',        unit: '',    direction: 'higher', aggregation: 'flow',  param: null },
  competidores:   { category: 'rrss', label: 'Superar competidor',   unit: '',    direction: 'higher', aggregation: 'stock', param: 'competitorId' },
  // ANUNCIOS
  inversion:      { category: 'ads',  label: 'Monto a invertir',     unit: '$',   direction: 'info',   aggregation: 'flow',  param: 'platform' },
  clicks:         { category: 'ads',  label: 'Clicks',               unit: '',    direction: 'higher', aggregation: 'flow',  param: 'platform' },
  ctr:            { category: 'ads',  label: 'CTR',                  unit: '%',    direction: 'higher', aggregation: 'stock', param: 'platform' },
}

const CATEGORIES = ['web', 'seo', 'rrss', 'ads']
const PERIODICITIES = ['monthly', 'quarterly', 'annual']
const AD_PLATFORMS = ['meta_ads', 'google_ads']

function isValidMetric(metric)            { return Object.prototype.hasOwnProperty.call(METRICS, metric) }
function metricDef(metric)                { return METRICS[metric] || null }
function metricsForCategory(category)     { return Object.entries(METRICS).filter(([, d]) => d.category === category).map(([k]) => k) }

module.exports = { METRICS, CATEGORIES, PERIODICITIES, AD_PLATFORMS, isValidMetric, metricDef, metricsForCategory }
