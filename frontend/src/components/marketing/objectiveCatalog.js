// Espejo del catálogo de objetivos del backend (backend/src/lib/objectiveCatalog.js).
// Define las métricas válidas por categoría y los params que requiere cada una,
// para construir el formulario condicional del gestor de objetivos.

export const CATEGORIES = [
  { key: 'web',  label: 'Web',        icon: '🌐' },
  { key: 'seo',  label: 'SEO / GEO',  icon: '🔍' },
  { key: 'rrss', label: 'RRSS',       icon: '📱' },
  { key: 'ads',  label: 'Anuncios',   icon: '📣' },
]

// param: null | 'trackedKeywordId' | 'competitorId' | 'platform'
// unit:  '' | '%' | '$' | 'pos'
// hasTarget: si pide un número objetivo
// rrssPlatform: si acepta una red opcional (Instagram / TikTok / LinkedIn / todas)
export const METRICS = {
  visitas:         { category: 'web',  label: 'Visitas al sitio',      unit: '',    param: null,               hasTarget: true,  help: 'Sesiones del período (Google Analytics).' },
  leads:           { category: 'web',  label: 'Leads (eventos clave)', unit: '',    param: null,               hasTarget: true,  help: 'Conversiones / eventos clave de Google Analytics.' },
  performance:     { category: 'web',  label: 'Performance web',       unit: '',    param: null,               hasTarget: true,  help: 'Score de PageSpeed desktop (0–100).' },
  posicionamiento: { category: 'seo',  label: 'Posicionamiento SEO',   unit: 'pos', param: 'trackedKeywordId', hasTarget: true,  help: 'Posición objetivo para una keyword en seguimiento (menor es mejor).' },
  seguidores:      { category: 'rrss', label: 'Seguidores nuevos',     unit: '',    param: null,               hasTarget: true,  rrssPlatform: true, help: 'Seguidores nuevos del período. Elegí una red para un objetivo por plataforma, o "Todas" para sumar IG + TikTok + LinkedIn.' },
  interaccion:     { category: 'rrss', label: 'Interacciones',         unit: '',    param: null,               hasTarget: true,  rrssPlatform: true, help: 'Interacciones del período. Elegí una red o "Todas" para sumar todas.' },
  alcance:         { category: 'rrss', label: 'Alcance (Instagram)',   unit: '',    param: null,               hasTarget: true,  help: 'Alcance (reach) de Instagram acumulado en el período. Requiere insights conectados.' },
  competidores:    { category: 'rrss', label: 'Superar competidor',    unit: '',    param: 'competitorId',     hasTarget: false, help: 'Comparación frente a un competidor (siempre se muestra en el informe).' },
  inversion:       { category: 'ads',  label: 'Monto a invertir',      unit: '$',   param: 'platform',         hasTarget: true,  help: 'Presupuesto a invertir; el informe compara contra el gasto real.' },
  clicks:          { category: 'ads',  label: 'Clicks',                unit: '',    param: 'platform',         hasTarget: true,  help: 'Clicks objetivo de la plataforma.' },
  ctr:             { category: 'ads',  label: 'CTR',                   unit: '%',   param: 'platform',         hasTarget: true,  help: 'CTR objetivo (%) de la plataforma.' },
}

export const PERIODICITIES = [
  { key: 'monthly',   label: 'Mensual' },
  { key: 'quarterly', label: 'Trimestral' },
  { key: 'annual',    label: 'Anual' },
]

export const AD_PLATFORMS = [
  { key: 'meta_ads',   label: 'Meta Ads' },
  { key: 'google_ads', label: 'Google Ads' },
]

export const RRSS_PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok',    label: 'TikTok' },
  { key: 'linkedin',  label: 'LinkedIn' },
]

// Etiqueta legible de cualquier plataforma (ads o rrss).
export const PLATFORM_LABEL = {
  meta_ads: 'Meta', google_ads: 'Google',
  instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn',
}

export function metricsForCategory(category) {
  return Object.entries(METRICS).filter(([, d]) => d.category === category).map(([key, d]) => ({ key, ...d }))
}

// Formatea un valor según la unidad de la métrica.
export function fmtObjectiveValue(value, unit) {
  if (value == null) return '—'
  const n = typeof value === 'number' ? value.toLocaleString('es-AR') : value
  if (unit === '$')   return `$${n}`
  if (unit === '%')   return `${value}%`
  if (unit === 'pos') return `#${value}`
  return `${n}`
}

export const PERIODICITY_LABEL = { monthly: 'Mensual', quarterly: 'Trimestral', annual: 'Anual' }
export const CATEGORY_LABEL = { web: 'Web', seo: 'SEO/GEO', rrss: 'RRSS', ads: 'Anuncios' }
