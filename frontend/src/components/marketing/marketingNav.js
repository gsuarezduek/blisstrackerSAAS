// Fuente única de la navegación de Marketing: array de grupos + compat de URLs
// viejas. La usan Marketing.jsx (nav principal), PrioridadesTab.jsx (labels de los
// grupos en "Prioridades") y preferences/modules.jsx (checkboxes de "Pestañas
// visibles", Preferencias → Módulos → Marketing).
export const NAV = [
  {
    id: 'hoy',
    label: '🎯 Prioridades',
    subs: [],
  },
  {
    id: 'geo-seo',
    label: '🤖 GEO / SEO',
    subs: [
      { id: 'geo',            label: '🤖 GEO' },
      { id: 'seo',            label: '🔍 SEO' },
      { id: 'onpage',         label: '🔬 On-Page' },
      { id: 'keywords',       label: '🔑 Keywords' },
      { id: 'contenido',      label: '✍️ Content Brief' },
      { id: 'content-gap',    label: '🆚 Content Gap' },
      { id: 'plan',           label: '📋 Plan de acción' },
      { id: 'canibalizacion', label: '⚠️ Canibalización' },
    ],
  },
  {
    id: 'web',
    label: '🌐 Web',
    subs: [
      { id: 'analytics',   label: '📊 Analytics' },
      { id: 'performance', label: '⚡ Performance' },
    ],
  },
  {
    id: 'rrss',
    label: '📱 RRSS',
    subs: [
      { id: 'instagram',    label: 'Instagram', network: 'instagram' },
      { id: 'tiktok',       label: 'TikTok',    network: 'tiktok' },
      { id: 'linkedin',     label: 'LinkedIn',  network: 'linkedin' },
      { id: 'facebook',     label: 'Facebook',  network: 'facebook' },
      { id: 'youtube',      label: 'YouTube',   network: 'youtube' },
      { id: 'competidores', label: '🏁 Competidores' },
    ],
  },
  {
    id: 'anuncios',
    label: '📣 Anuncios',
    subs: [
      { id: 'meta-ads',     label: '📘 Meta Ads' },
      { id: 'google-ads',   label: '🔍 Google Ads' },
      { id: 'linkedin-ads', label: '💼 LinkedIn Ads', soon: true },
      { id: 'tiktok-ads',   label: '🎵 TikTok Ads',   soon: true },
    ],
  },
  {
    id: 'informes',
    label: '📊 Informes',
    subs: [],
  },
]

// Descripción corta de qué contiene cada grupo, para el selector de "Pestañas
// visibles" en Preferencias → Módulos → Marketing.
export const SECTION_DESCRIPTIONS = {
  hoy:        'Recomendaciones top del workspace: objetivos atrasados, hallazgos de SEO/GEO, performance, anuncios e informes pendientes.',
  'geo-seo':  'Auditoría GEO, SEO on-page, keywords, content briefs, canibalización.',
  web:        'Analytics (GA4) y Performance (PageSpeed).',
  rrss:       'Instagram, TikTok, LinkedIn, Facebook, YouTube y Competidores.',
  anuncios:   'Meta Ads y Google Ads (LinkedIn/TikTok Ads próximamente).',
  informes:   'Informes mensuales para compartir con el cliente.',
}

// Compatibilidad con URLs antiguas (?tab=geo, ?tab=web, etc.)
export const LEGACY_MAP = {
  geo:        { tab: 'geo-seo',  sub: 'geo' },
  seo:        { tab: 'geo-seo',  sub: 'seo' },
  web:        { tab: 'web',      sub: 'analytics' },
  anuncios:   { tab: 'anuncios', sub: 'google-ads' },
  contenidos: { tab: 'rrss',     sub: 'instagram' },
  informes:   { tab: 'informes', sub: 'salud' },
}

export const VALID_TABS = new Set(NAV.map(n => n.id))
