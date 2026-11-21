// Qué páginas de un proyecto se miden con PageSpeed.
//
// Hasta ahora era una sola: `Project.websiteUrl`. Un score de la portada no dice nada de
// la landing que convierte, así que se suman las "páginas prioritarias" que el equipo ya
// carga en el brief de SEO/SEM (`urls_prioritarias`, el mismo campo que usa el audit
// On-Page como semilla — un solo lugar donde declarar qué páginas importan).
//
// Lógica pura: el I/O (leer el brief) queda en el controller.

const MAX_PRIORITY_URLS = 4 // + el home = 5 páginas; cada una son 2 llamadas a la API

/** Agrega https:// si falta, y saca la barra final (salvo que la URL sea la raíz). */
function withProtocol(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(withScheme)
    if (!/^https?:$/.test(u.protocol)) return null
    u.hash = ''
    let out = u.href
    if (out.endsWith('/') && u.pathname !== '/') out = out.slice(0, -1)
    return out
  } catch { return null }
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, '') } catch { return null }
}

/**
 * @param {string}  websiteUrl        — Project.websiteUrl
 * @param {string?} priorityRaw       — brief seo_sem.urls_prioritarias (texto libre)
 * @returns {Array<{url: string, label: string, isHome: boolean}>} el home primero
 */
function projectPageSpeedUrls(websiteUrl, priorityRaw) {
  const home = withProtocol(websiteUrl)
  if (!home) return []

  const homeHost = hostOf(home)
  const out = [{ url: home, label: 'Home', isHome: true }]
  const seen = new Set([home])

  // El campo es texto libre: el equipo pega las URLs separadas por saltos de línea, comas
  // o espacios. Una URL de otro dominio (un competidor pegado por error) no se mide: el
  // informe es del sitio del cliente.
  for (const piece of String(priorityRaw || '').split(/[\s,;]+/)) {
    if (out.length > MAX_PRIORITY_URLS) break
    const url = withProtocol(piece)
    if (!url || seen.has(url) || hostOf(url) !== homeHost) continue
    seen.add(url)
    let label
    try { label = new URL(url).pathname.replace(/\/$/, '') || '/' } catch { label = url }
    out.push({ url, label, isHome: false })
  }

  return out
}

module.exports = { MAX_PRIORITY_URLS, withProtocol, projectPageSpeedUrls }
