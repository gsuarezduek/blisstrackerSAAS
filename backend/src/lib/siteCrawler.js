const axios = require('axios')

// Crawler BFS acotado, compartido por GEO (geoAudit.service.js) y On-Page
// (onPageAudit.service.js) — antes eran dos copias independientes que terminaban
// divergiendo; este módulo concentra la mecánica de recorrido (normalización de URLs +
// cola BFS + fetch), dejando qué extraer de cada página 100% a criterio del caller.

const UA = 'BlissTrackerBot/1.0 (+https://blisstracker.app)'

// Normaliza un href a URL absoluta del mismo origen; devuelve null si es externo/inválido
// o un asset no-HTML (por extensión).
function normalizeInternal(href, base, origin) {
  if (!href) return null
  const h = href.trim()
  if (!h || h.startsWith('#') || h.startsWith('mailto:') || h.startsWith('tel:') || h.startsWith('javascript:')) return null
  let u
  try { u = new URL(h, base) } catch { return null }
  if (u.origin !== origin) return null
  if (!/^https?:$/.test(u.protocol)) return null
  if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|mp3|css|js|xml|json)$/i.test(u.pathname)) return null
  u.hash = ''
  u.search = ''
  let s = u.href
  if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1)
  return s
}

/**
 * BFS acotado sobre un sitio, a partir de `seedUrl` (+ `extraSeeds` opcionales, ya
 * normalizadas por el caller). `extract(html, url, origin)` se llama por cada página
 * fetcheada y debe devolver el shape que el caller necesite, con un campo
 * `internalLinks: string[]` (URLs ya normalizadas, mismo origen) — es lo único que el
 * BFS lee, para seguir descubriendo páginas.
 *
 * Devuelve un array de resultados de `extract()`, uno por página. Si el fetch de una
 * página falla, empuja `{ url, error: true, status, internalLinks: [] }` en su lugar
 * (sin llamar a `extract`).
 */
async function crawlSite({ seedUrl, extraSeeds = [], maxPages, extract, timeout = 15000 }) {
  const origin = new URL(seedUrl).origin
  const visited = new Set()
  const queue   = [normalizeInternal(seedUrl, seedUrl, origin) || seedUrl, ...extraSeeds]
  const pages   = []

  while (queue.length && pages.length < maxPages) {
    const next = queue.shift()
    if (!next || visited.has(next)) continue
    visited.add(next)
    try {
      const res = await axios.get(next, { timeout, maxRedirects: 5, headers: { 'User-Agent': UA }, validateStatus: s => s < 400 })
      const data = extract(res.data, next, origin)
      pages.push(data)
      for (const link of data.internalLinks || []) {
        if (!visited.has(link) && queue.length < maxPages * 3) queue.push(link)
      }
    } catch (err) {
      pages.push({ url: next, error: true, status: err.response?.status || 0, internalLinks: [] })
    }
  }
  return pages
}

module.exports = { normalizeInternal, crawlSite }
