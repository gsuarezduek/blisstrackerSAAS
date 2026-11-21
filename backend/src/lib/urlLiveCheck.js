// Chequeo en vivo de una URL: estado HTTP real, a dónde redirige, su canonical, si está
// noindex y qué etiquetas hreflang declara.
//
// ── Por qué ──────────────────────────────────────────────────────────────────
// Ningún módulo de SEO mira el sitio antes de recomendar. Search Console se consulta a
// 30/90/180 días hacia atrás, así que una URL redirigida hace 40 días sigue apareciendo
// con los datos de antes del 301 — y el sistema la recomienda como si existiera. "Sigue
// en el reporte" no significa "sigue viva", y la única forma de distinguirlo es pedirla.
//
// `fetchPublicUrl` (lib/safeUrl.js) no alcanza para esto: sigue los redirects a mano
// —bien, es la protección contra SSRF— pero devuelve solo la respuesta FINAL, así que un
// 301 se vuelve invisible (llega un 200 de otra URL). Acá se sigue la misma cadena
// revalidando cada salto, pero se conserva el PRIMER status y todo el camino.

const axios = require('axios')
const cheerio = require('cheerio')
const { assertPublicUrl } = require('./safeUrl')

const DEFAULT_TIMEOUT  = 10000
const MAX_REDIRECTS    = 5
const MAX_HTML_BYTES   = 400_000 // alcanza de sobra para el <head>
const USER_AGENT       = 'BlissTrackerBot/1.0 (+https://blisstracker.app)'

// ─── Lectura del HTML (pura) ──────────────────────────────────────────────────

/**
 * Señales del <head> que deciden qué página es la canónica de un grupo.
 * @returns {{canonical: string|null, noindex: boolean, hreflang: Array<{lang: string, href: string}>}}
 */
function parseHtmlSignals(html, baseUrl) {
  const out = { canonical: null, noindex: false, hreflang: [] }
  if (!html || typeof html !== 'string') return out

  let $
  try { $ = cheerio.load(html) } catch { return out }

  const canonicalHref = $('link[rel="canonical"]').first().attr('href')
  if (canonicalHref) {
    try { out.canonical = new URL(canonicalHref, baseUrl).toString() } catch { out.canonical = canonicalHref }
  }

  // Un noindex puede venir de `robots` o del específico `googlebot`.
  const robotsMeta = $('meta[name="robots"], meta[name="googlebot"]')
    .map((_, el) => $(el).attr('content') ?? '').get().join(',')
  out.noindex = /noindex/i.test(robotsMeta)

  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = String($(el).attr('hreflang') || '').trim().toLowerCase()
    const href = $(el).attr('href')
    if (!lang || !href) return
    let abs = href
    try { abs = new URL(href, baseUrl).toString() } catch { /* se guarda como vino */ }
    out.hreflang.push({ lang, href: abs })
  })

  return out
}

// ─── Chequeo (I/O) ───────────────────────────────────────────────────────────

/**
 * Pide una URL siguiendo los redirects a mano y devuelve qué encontró.
 * Nunca lanza: un fallo vuelve como `{ error }` — esto es best-effort y jamás debe
 * tirar abajo el análisis que lo llama.
 *
 * @returns {Promise<{url, status, finalUrl, redirectedTo, chain, canonical, noindex, hreflang, error}>}
 */
async function checkUrlLive(url, { timeout = DEFAULT_TIMEOUT, readHtml = true } = {}) {
  const base = {
    url, status: null, finalUrl: null, redirectedTo: null, chain: [],
    canonical: null, noindex: false, hreflang: [], error: null,
  }

  let current = url
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicUrl(current) // en CADA salto, igual que fetchPublicUrl
      const res = await axios.get(current, {
        timeout,
        maxRedirects:   0,
        validateStatus: () => true,
        responseType:   'text',
        maxContentLength: MAX_HTML_BYTES,
        maxBodyLength:    MAX_HTML_BYTES,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
        // Un 304 sin cuerpo o un HTML gigante no deben romper el chequeo.
        transformResponse: [d => d],
      })

      // El status que importa es el PRIMERO: es el que dice si la URL se mudó.
      if (base.status === null) base.status = res.status

      const location = res.headers?.location
      if (res.status >= 300 && res.status < 400 && location) {
        let next
        try { next = new URL(location, current).toString() } catch { break }
        base.chain.push({ status: res.status, to: next })
        current = next
        continue
      }

      base.finalUrl = current
      if (readHtml && typeof res.data === 'string' && /text\/html/i.test(res.headers?.['content-type'] ?? 'text/html')) {
        Object.assign(base, parseHtmlSignals(res.data, current))
      }
      break
    }
    if (!base.finalUrl) {
      base.finalUrl = current
      base.error = base.chain.length > MAX_REDIRECTS ? 'Demasiados redirects' : base.error
    }
  } catch (err) {
    // ENOTFOUND / timeout / IP privada / etc.
    base.error = String(err?.message || 'Error al pedir la URL').slice(0, 200)
    if (err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN') base.error = 'El dominio no resuelve'
  }

  if (base.chain.length > 0) base.redirectedTo = base.chain[base.chain.length - 1].to
  return base
}

/**
 * Corre `checkUrlLive` sobre varias URLs con concurrencia acotada (mismo patrón que
 * backlinkVerifier y el fetch de idioma de canibalización) y un tope duro de URLs: esto
 * corre dentro de un análisis, no es un crawler.
 *
 * @returns {Promise<Map<string, object>>} url → resultado
 */
async function checkUrlsLive(urls, { concurrency = 5, limit = 40, ...opts } = {}) {
  const unique = [...new Set((urls || []).filter(Boolean))].slice(0, limit)
  const out = new Map()
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency)
    const results = await Promise.all(batch.map(u => checkUrlLive(u, opts)))
    results.forEach(r => out.set(r.url, r))
  }
  return out
}

// ─── Veredictos (puros) ──────────────────────────────────────────────────────

// Compara URLs ignorando esquema, www, barra final y mayúsculas de host: para decidir si
// un redirect apunta "a la misma página" eso es ruido.
function sameTarget(a, b) {
  const norm = u => {
    try {
      const url = new URL(u)
      const path = url.pathname.replace(/\/+$/, '') || '/'
      return `${url.host.toLowerCase().replace(/^www\./, '')}${path}`
    } catch { return String(u || '').trim().toLowerCase().replace(/\/+$/, '') }
  }
  return !!a && !!b && norm(a) === norm(b)
}

/**
 * Qué hacer con una URL de un conflicto, según lo que respondió en vivo.
 *
 * `fixed` = el arreglo ya está hecho y lo único que falta es que Search Console se
 * ponga al día; esa URL no tiene que seguir apareciendo como algo por hacer.
 */
function liveVerdict(check, { otherUrls = [] } = {}) {
  if (!check || check.error) return { state: 'unknown', fixed: false, note: null }

  const { status, redirectedTo, canonical, noindex } = check

  if (status >= 500) return { state: 'server_error', fixed: false, note: `El servidor responde ${status}` }
  if (status === 404 || status === 410) {
    return { state: 'gone', fixed: true, note: `La URL ya no existe (HTTP ${status})` }
  }

  if (redirectedTo) {
    const toOther = otherUrls.find(u => sameTarget(u, redirectedTo))
    if (toOther) {
      return { state: 'redirect_to_other', fixed: true, target: toOther, note: `Redirige (HTTP ${status}) a ${toOther}` }
    }
    return { state: 'redirect_elsewhere', fixed: true, target: redirectedTo, note: `Redirige (HTTP ${status}) a ${redirectedTo}` }
  }

  if (noindex) return { state: 'noindex', fixed: true, note: 'La página tiene meta robots noindex' }

  if (canonical && !sameTarget(canonical, check.url)) {
    const toOther = otherUrls.find(u => sameTarget(u, canonical))
    if (toOther) {
      return { state: 'canonical_to_other', fixed: true, target: toOther, note: `Su canonical apunta a ${toOther}` }
    }
    return { state: 'canonical_elsewhere', fixed: false, target: canonical, note: `Su canonical apunta a ${canonical}` }
  }

  return { state: 'live', fixed: false, note: null }
}

/**
 * ¿Las etiquetas hreflang entre estas páginas están bien puestas?
 *
 * El hallazgo de hreflang se emitía mirando SOLO datos de Search Console: decía "revisar
 * el emparejamiento hreflang" sin haber pedido una sola página, y por eso marcaba
 * problemas en sitios donde las etiquetas estaban perfectas. Acá se verifica lo que la
 * especificación realmente pide: que cada versión se autorreferencie y que el vínculo sea
 * recíproco (si A declara B, B tiene que declarar A).
 *
 * @param {Array<{url: string, language: string, check: object}>} pages
 * @returns {{ok: boolean, checked: boolean, problems: Array<{type, url, detail}>}}
 */
function hreflangVerdict(pages = []) {
  const usable = pages.filter(p => p.check && !p.check.error && p.check.status === 200)
  if (usable.length < 2) {
    return { ok: false, checked: false, problems: [], note: 'No se pudieron leer las dos versiones en vivo' }
  }

  const problems = []

  for (const page of usable) {
    const tags = page.check.hreflang ?? []
    if (tags.length === 0) {
      problems.push({ type: 'missing', url: page.url, detail: 'No declara ninguna etiqueta hreflang' })
      continue
    }
    if (!tags.some(t => sameTarget(t.href, page.url))) {
      problems.push({ type: 'no_self', url: page.url, detail: 'No se autorreferencia (le falta su propio hreflang)' })
    }
    for (const other of usable) {
      if (other.url === page.url) continue
      const declares = tags.some(t => sameTarget(t.href, other.url))
      if (!declares) {
        problems.push({ type: 'not_declared', url: page.url, detail: `No declara la versión ${other.language}: ${other.url}` })
        continue
      }
      const otherTags = other.check.hreflang ?? []
      if (otherTags.length && !otherTags.some(t => sameTarget(t.href, page.url))) {
        problems.push({ type: 'not_reciprocal', url: other.url, detail: `Declara ${page.url} sin que esa página lo devuelva` })
      }
    }
  }

  return { ok: problems.length === 0, checked: true, problems }
}

module.exports = {
  DEFAULT_TIMEOUT,
  MAX_REDIRECTS,
  parseHtmlSignals,
  checkUrlLive,
  checkUrlsLive,
  sameTarget,
  liveVerdict,
  hreflangVerdict,
}
