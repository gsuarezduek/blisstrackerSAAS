// Fuente única de la navegación de Marketing: array de grupos + compat de URLs
// viejas. La usan Marketing.jsx (nav principal), PrioridadesTab.jsx (labels de los
// grupos en "Prioridades") y preferences/modules.jsx (checkboxes de "Pestañas
// visibles", Preferencias → Módulos → Marketing).
export const NAV = [
  {
    // OCULTA EN CÓDIGO (nov 2026, decisión de producto: el panel no se usa por ahora).
    // `hidden` la saca de la navegación, del buscador Cmd+K y del selector de
    // "Pestañas visibles" en TODOS los workspaces, y manda `?tab=hoy` (o `?sub=plan`)
    // a la primera pestaña visible. El componente, los endpoints y el cálculo de
    // hallazgos quedan enteros: para volver a prenderla, borrar `hidden` acá Y
    // `MARKETING_HIDDEN_SECTIONS` en backend/src/lib/marketingSections.js (que es lo
    // que apaga el aviso semanal por email). Sigue en el array —y no borrada— para
    // que `VALID_TABS` reconozca `?tab=hoy` y lo redirija en vez de ignorarlo.
    id: 'hoy',
    label: 'Prioridades',
    hidden: true,
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
        { id: 'ai-visibility',  label: 'Visibilidad IA' },
      ] },
      { id: 'keywords',  label: 'Keywords y oportunidades' },
      { id: 'enlaces',   label: 'Enlaces', views: [
        { id: 'nuestros',      label: 'Nuestros enlaces' },
        { id: 'competencia',   label: 'Competencia' },
        { id: 'oportunidades', label: 'Oportunidades' },
        { id: 'perfil',        label: 'Perfil de enlaces' },
      ] },
      { id: 'contenido', label: 'Contenido SEO', views: [
        { id: 'brief', label: 'Content Brief' },
        { id: 'gap',   label: '🆚 Content Gap' },
        // Lo ya publicado: cada nota del blog con sus métricas de Search Console.
        // Antes era la vista "Inventario SEO" de /contenido (que redirige acá).
        { id: 'blog',  label: 'Inventario del blog' },
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
      { id: 'chatgpt-ads',  label: 'ChatGPT Ads' },
    ],
  },
  {
    // Requiere además el feature flag `mailing` (opt-in por workspace): sin él,
    // Marketing.jsx la saca de la navegación.
    id: 'mailing',
    label: 'Mailing',
    subs: [
      { id: 'campanas',      label: 'Campañas' },
      { id: 'bases',         label: 'Bases y contactos' },
      { id: 'configuracion', label: 'Configuración' },
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
  'geo-seo':  'Diagnóstico (GEO, SEO, On-Page, canibalización), keywords, enlaces (backlinks) y contenido SEO (briefs, content gap e inventario del blog).',
  web:        'Analytics (GA4) y Performance (PageSpeed).',
  rrss:       'Instagram, TikTok, LinkedIn, Facebook, YouTube y Competidores.',
  anuncios:   'Meta Ads, Google Ads y ChatGPT Ads.',
  mailing:    'Email marketing: bases de contactos, campañas y métricas de aperturas, clics y bajas (requiere el módulo Mailing).',
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
// "Plan de acción" se fusionó en Prioridades (mismos hallazgos, ya agregados ahí);
// con Prioridades oculta, el destino cae solo en la primera pestaña visible.
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

// Secciones ocultas en el código (`hidden` en el NAV): fuente única para la
// navegación (Marketing.jsx), el buscador (useNavDestinations.js) y el selector de
// "Pestañas visibles" (preferences/modules.jsx). Son distintas de las que apaga cada
// workspace en Preferencias (`Workspace.marketingDisabledSections`): estas no se
// pueden prender desde la UI.
export const HIDDEN_SECTIONS = NAV.filter(n => n.hidden).map(n => n.id)
