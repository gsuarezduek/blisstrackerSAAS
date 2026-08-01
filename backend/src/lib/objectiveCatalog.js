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
//   - rrssPlatform: si acepta una red opcional (instagram | tiktok | linkedin); null = todas las redes

const METRICS = {
  // WEB
  visitas:        { category: 'web',  label: 'Visitas al sitio',     unit: '',    direction: 'higher', aggregation: 'flow',  param: null },
  leads:          { category: 'web',  label: 'Leads (eventos clave)', unit: '',   direction: 'higher', aggregation: 'flow',  param: null },
  performance:    { category: 'web',  label: 'Performance web',      unit: '',    direction: 'higher', aggregation: 'stock', param: null },
  // SEO / GEO
  posicionamiento:{ category: 'seo',  label: 'Posicionamiento SEO (keyword)', unit: 'pos', direction: 'lower', aggregation: 'stock', param: 'trackedKeywordId' },
  seo_clicks:     { category: 'seo',  label: 'Clics orgánicos (GSC)',       unit: '',    direction: 'higher', aggregation: 'flow',  param: null },
  seo_impressions:{ category: 'seo',  label: 'Impresiones orgánicas (GSC)', unit: '',    direction: 'higher', aggregation: 'flow',  param: null },
  seo_ctr:        { category: 'seo',  label: 'CTR orgánico (GSC)',          unit: '%',   direction: 'higher', aggregation: 'stock', param: null },
  seo_position:   { category: 'seo',  label: 'Posición media del sitio (GSC)', unit: 'pos', direction: 'lower', aggregation: 'stock', param: null },
  keywords_top3:  { category: 'seo',  label: 'Keywords en Top 3',           unit: '',    direction: 'higher', aggregation: 'stock', param: null },
  keywords_top10: { category: 'seo',  label: 'Keywords en Top 10',          unit: '',    direction: 'higher', aggregation: 'stock', param: null },
  domain_rating:  { category: 'seo',  label: 'Domain Rating (autoridad)',   unit: '',    direction: 'higher', aggregation: 'stock', param: null },
  geo_score:      { category: 'seo',  label: 'Presencia en IAs (GEO)',      unit: '',    direction: 'higher', aggregation: 'stock', param: null },
  // RRSS
  seguidores:     { category: 'rrss', label: 'Seguidores nuevos',    unit: '',    direction: 'higher', aggregation: 'flow',  param: null, rrssPlatform: true },
  interaccion:    { category: 'rrss', label: 'Interacciones',        unit: '',    direction: 'higher', aggregation: 'flow',  param: null, rrssPlatform: true },
  alcance:        { category: 'rrss', label: 'Alcance (Instagram)',  unit: '',    direction: 'higher', aggregation: 'flow',  param: null, igInsightsOnly: true },
  visualizaciones:{ category: 'rrss', label: 'Visualizaciones (Instagram)', unit: '', direction: 'higher', aggregation: 'flow', param: null, igInsightsOnly: true },
  competidores:   { category: 'rrss', label: 'Superar competidor',   unit: '',    direction: 'higher', aggregation: 'stock', param: 'competitorId' },
  // ANUNCIOS
  inversion:      { category: 'ads',  label: 'Monto a invertir',     unit: '$',   direction: 'info',   aggregation: 'flow',  param: 'platform' },
  clicks:         { category: 'ads',  label: 'Clicks',               unit: '',    direction: 'higher', aggregation: 'flow',  param: 'platform' },
  ctr:            { category: 'ads',  label: 'CTR',                  unit: '%',    direction: 'higher', aggregation: 'stock', param: 'platform' },
}

const CATEGORIES = ['web', 'seo', 'rrss', 'ads']
const PERIODICITIES = ['monthly', 'quarterly', 'annual']
const AD_PLATFORMS = ['meta_ads', 'google_ads']
const RRSS_PLATFORMS = ['instagram', 'tiktok', 'linkedin']

function metricDef(metric)                { return METRICS[metric] || null }

module.exports = { METRICS, CATEGORIES, PERIODICITIES, AD_PLATFORMS, RRSS_PLATFORMS, metricDef }
