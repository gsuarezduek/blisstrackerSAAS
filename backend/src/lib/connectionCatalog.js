// Fuentes de datos de Marketing de un proyecto, del lado del backend: qué puede
// estar conectado y DÓNDE se conecta en la app.
//
// Espejo de frontend/src/components/marketing/ConnectionsPanel.jsx
// (CONNECTION_SOURCES) — mantener los dos en sync, mismo criterio que
// contentCatalog.js. Acá sólo vive lo que el backend necesita para contestar
// "¿qué falta?" y "¿a dónde tengo que ir a arreglarlo?": el label y la pestaña.
// Los estados/colores siguen siendo cosa del frontend.
//
// Por qué un link a la app y NO la URL de OAuth: el `state` de los flujos OAuth
// vive 10 minutos (lib/oauthState.js) y el callback vuelve a una página puente
// que espera ser un popup abierto por la app. Una URL de consentimiento pegada
// en un chat llega vencida y sin opener. El único link que sirve es el de la
// pantalla donde la persona aprieta "Conectar" y el flujo arranca fresco.

const SOURCES = [
  { type: 'website',               label: 'Sitio web',        project: { infoTab: 'ajustes' } },
  { type: 'google_analytics',      label: 'Google Analytics', section: 'web',      tab: 'web',     sub: 'analytics' },
  { type: 'google_search_console', label: 'Search Console',   section: 'geo-seo',  tab: 'geo-seo', sub: 'diagnostico', view: 'seo' },
  { type: 'instagram',             label: 'Instagram',        section: 'rrss',     tab: 'rrss',    sub: 'instagram' },
  { type: 'tiktok',                label: 'TikTok',           section: 'rrss',     tab: 'rrss',    sub: 'tiktok' },
  { type: 'linkedin',              label: 'LinkedIn',         section: 'rrss',     tab: 'rrss',    sub: 'linkedin' },
  { type: 'facebook',              label: 'Facebook',         section: 'rrss',     tab: 'rrss',    sub: 'facebook' },
  { type: 'google_youtube',        label: 'YouTube',          section: 'rrss',     tab: 'rrss',    sub: 'youtube' },
  { type: 'meta_ads',              label: 'Meta Ads',         section: 'anuncios', tab: 'anuncios', sub: 'meta-ads' },
  { type: 'google_ads',            label: 'Google Ads',       section: 'anuncios', tab: 'anuncios', sub: 'google-ads' },
  { type: 'chatgpt_ads',           label: 'ChatGPT Ads',      section: 'anuncios', tab: 'anuncios', sub: 'chatgpt-ads' },
]

/** Base pública del workspace: https://<slug>.<APP_DOMAIN> */
function workspaceBaseUrl(slug) {
  return `https://${slug}.${process.env.APP_DOMAIN || 'blisstracker.app'}`
}

/** URL de la pantalla donde se conecta/reconecta esa fuente. */
function reconnectUrl(source, { slug, projectId }) {
  const base = workspaceBaseUrl(slug)
  if (source.project) return `${base}/my-projects/${projectId}?infoTab=${source.project.infoTab}`
  const params = new URLSearchParams({ tab: source.tab, sub: source.sub })
  if (source.view) params.set('view', source.view)
  params.set('projectId', String(projectId))
  return `${base}/marketing?${params.toString()}`
}

// Estado de cada fuente, con el mismo criterio que `resolveConnections` del
// frontend y que getAvailableSections de los informes: el sitio web sale de
// Project.websiteUrl, el resto de ProjectIntegration (active → conectado,
// cualquier otro status → el acceso se cayó y hay que reconectar).
//   'active' | 'expired' | 'missing'
function resolveConnections({ integrations, websiteUrl, slug, projectId }) {
  const byType = new Map((integrations ?? []).map(i => [i.type, i]))
  return SOURCES.map(source => {
    const row = byType.get(source.type)
    let state
    if (source.type === 'website') state = websiteUrl ? 'active' : 'missing'
    else if (!row) state = 'missing'
    else state = row.status === 'active' ? 'active' : 'expired'

    const out = { type: source.type, label: source.label, state }
    if (source.type === 'website') {
      if (websiteUrl) out.websiteUrl = websiteUrl
    } else if (row) {
      // IDs de cuenta: sin ellos la integración puede estar "conectada" y no traer
      // datos igual (ver ProjectIntegration.propertyId en CLAUDE.md).
      if (row.propertyId) out.propertyId = row.propertyId
      if (row.customerId) out.customerId = row.customerId
      if (row.accountEmail) out.accountEmail = row.accountEmail
      if (row.scopes === 'scrape') out.mode = 'scrape'
      // `expiresAt` es el vencimiento del access token, que en las integraciones con
      // refresh token (todas las de Google) se renueva solo cada hora: una fecha YA
      // PASADA al lado de "conectada" es lo normal, no un problema, y leerla como
      // alarma es exactamente lo que confundió a un agente. Si el token estuviera
      // muerto de verdad, `status` sería 'expired'. Así que solo viaja cuando es una
      // fecha FUTURA, que ahí sí es un plazo real (ej. un token de Business Manager
      // que vence en 60 días y hay que renovar a mano).
      if (row.expiresAt && new Date(row.expiresAt) > new Date()) out.expiresAt = row.expiresAt
    }
    if (state !== 'active') out.reconnectUrl = reconnectUrl(source, { slug, projectId })
    return out
  })
}

module.exports = { SOURCES, resolveConnections, reconnectUrl, workspaceBaseUrl }
