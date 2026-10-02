// Fuente única de la navegación de Marketing: array de grupos + compat de URLs
// viejas. La usan Marketing.jsx (nav principal), PrioridadesTab.jsx (labels de los
// grupos en "Prioridades") y preferences/modules.jsx (checkboxes de "Pestañas
// visibles", Preferencias → Módulos → Marketing).
export const NAV = [
  {
    id: 'hoy',
    label: 'Prioridades',
    subs: [],
  },
  {
    id: 'geo-seo',
    label: 'GEO / SEO',
    // 3 sub-pestañas por intención (¿cómo está el sitio? / ¿por qué rankeo? /
    // ¿qué escribo?). Las que agrupan varias herramientas las muestran como
    // `views` (selector segmentado dentro del contenido, `?view=`).
    subs: [
      { id: 'diagnostico', label: 'Diagnóstico', views: [
        { id: 'geo',            label: 'GEO' },
        { id: 'seo',            label: 'SEO' },
        { id: 'onpage',         label: 'On-Page' },
        { id: 'canibalizacion', label: 'Canibalización' },
      ] },
      { id: 'keywords',  label: 'Keywords y oportunidades' },
      { id: 'contenido', label: 'Contenido SEO', views: [
        { id: 'brief', label: 'Content Brief' },
        { id: 'gap',   label: '🆚 Content Gap' },
      ] },
    ],
  },
  {
    id: 'web',
    label: 'Web',
    subs: [
      { id: 'analytics',   label: 'Analytics' },
      { id: 'performance', label: 'Performance' },
    ],
  },
  {
    id: 'rrss',
    label: 'RRSS',
    subs: [
      { id: 'instagram',    label: 'Instagram', network: 'instagram' },
      { id: 'tiktok',       label: 'TikTok',    network: 'tiktok' },
      { id: 'linkedin',     label: 'LinkedIn',  network: 'linkedin' },
      { id: 'facebook',     label: 'Facebook',  network: 'facebook' },
      { id: 'youtube',      label: 'YouTube',   network: 'youtube' },
      { id: 'competidores', label: 'Competidores' },
    ],
  },
  {
    id: 'anuncios',
    label: 'Anuncios',
    subs: [
      { id: 'meta-ads',     label: 'Meta Ads' },
      { id: 'google-ads',   label: 'Google Ads' },
    ],
  },
  {
    id: 'informes',
    label: 'Informes',
    subs: [],
  },
]

// Descripción corta de qué contiene cada grupo, para el selector de "Pestañas
// visibles" en Preferencias → Módulos → Marketing.
export const SECTION_DESCRIPTIONS = {
  hoy:        'Recomendaciones top del workspace: objetivos atrasados, hallazgos de SEO/GEO, performance, anuncios e informes pendientes.',
  'geo-seo':  'Diagnóstico (GEO, SEO, On-Page, canibalización), keywords y contenido SEO.',
  web:        'Analytics (GA4) y Performance (PageSpeed).',
  rrss:       'Instagram, TikTok, LinkedIn, Facebook, YouTube y Competidores.',
  anuncios:   'Meta Ads y Google Ads.',
  informes:   'Informes mensuales para compartir con el cliente.',
}

// Compatibilidad con URLs antiguas (?tab=geo, ?tab=web, etc.)
export const LEGACY_MAP = {
  geo:        { tab: 'geo-seo',  sub: 'geo' },
  seo:        { tab: 'geo-seo',  sub: 'seo' },
  web:        { tab: 'web',      sub: 'analytics' },
  anuncios:   { tab: 'anuncios', sub: 'google-ads' },
  contenidos: { tab: 'rrss',     sub: 'instagram' },
  informes:   { tab: 'informes' },
}

// Sub-pestañas viejas de GEO / SEO (antes eran 8 sueltas) → dónde viven ahora.
// "Plan de acción" se fusionó en Prioridades (mismos hallazgos, ya agregados ahí).
export const LEGACY_SUB_MAP = {
  'geo-seo': {
    geo:            { sub: 'diagnostico', view: 'geo' },
    seo:            { sub: 'diagnostico', view: 'seo' },
    onpage:         { sub: 'diagnostico', view: 'onpage' },
    canibalizacion: { sub: 'diagnostico', view: 'canibalizacion' },
    'content-gap':  { sub: 'contenido',   view: 'gap' },
    plan:           { tab: 'hoy' },
  },
}

export const VALID_TABS = new Set(NAV.map(n => n.id))
