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
const MAX_HTML_BYTES   = 400_000
const USER_AGENT       = 'BlissTrackerBot/1.0 (+https://blisstracker.app)'

// ─── Por qué se lee la respuesta como stream ───────────────────────────
// `maxContentLength` de axios **no trunca: lanza**. Con un tope de 400 KB, la home de
// mdzrentacar.com (452 KB) fallaba SIEMPRE con ERR_BAD_RESPONSE y quedaba como
// `status: null` → veredicto `unknown`, así que ningún conflicto donde estuviera la home
// podía darse por arreglado. Las internas, más chicas, pasaban — de ahí que pareciera un
// bloqueo al bot y no un tope propio.
//
// Subir el número solo mueve el problema al próximo sitio más pesado. Acá solo hace
// falta el `<head>` (canonical, meta robots, hreflang), así que se lee de a chunks y se
// corta al encontrar `</head>`: nunca lanza por tamaño, y de paso baja la transferencia
// (del home de MDZ se leen ~40 KB en vez de 452 KB).

function readHeadFromStream(stream, maxBytes = MAX_HTML_BYTES) {
  return new Promise(resolve => {
    let html = ''
    let done = false
    const finish = () => {
      if (done) return
      done = true
      stream.destroy() // cortar la descarga: no necesitamos el resto del documento
      resolve(html)
    }
    stream.on('data', chunk => {
      html += chunk.toString('utf8')
      if (html.length >= maxBytes || /<\/head>/i.test(html)) finish()
    })
    stream.on('end', finish)
    stream.on('error', finish) // un corte a mitad del body no invalida lo ya leído
    stream.on('close', finish)
  })
}

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
        responseType:   'stream',
        // Infinity a propósito: el tamaño se acota leyendo el stream, no haciendo que
        // axios lance a mitad de camino (ver el comentario de readHeadFromStream).
        maxContentLength: Infinity,
        maxBodyLength:    Infinity,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      })

      // El status que importa es el PRIMERO: es el que dice si la URL se mudó.
      if (base.status === null) base.status = res.status

      const location = res.headers?.location
      if (res.status >= 300 && res.status < 400 && location) {
        res.data?.destroy?.() // no hace falta el cuerpo de un redirect
        let next
        try { next = new URL(location, current).toString() } catch { break }
        base.chain.push({ status: res.status, to: next })
        current = next
        continue
      }

      base.finalUrl = current
      const isHtml = /text\/html|application\/xhtml/i.test(res.headers?.['content-type'] ?? 'text/html')
      if (readHtml && isHtml && res.data) {
        Object.assign(base, parseHtmlSignals(await readHeadFromStream(res.data), current))
      } else {
        res.data?.destroy?.()
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

// El código con el que una página se nombra a sí misma, leído de su propia
// autorreferencia (`<link rel="alternate" hreflang="es" href="<ella misma>">`). Sirve
// para saber qué código representa al idioma `default` (una URL sin prefijo de ruta no
// dice si es "es", "pt" o lo que sea) sin tener que suponerlo.
function selfDeclaredLang(page) {
  const tags = page?.check?.hreflang ?? []
  const own = tags.find(t => t.lang !== 'x-default' && sameTarget(t.href, page.url))
  return own ? own.lang.split('-')[0] : null
}

// ¿Alguna etiqueta declara el idioma de `other`? `x-default` no cuenta: no es un idioma,
// es el fallback.
function declaresLanguageOf(tags, other) {
  const code = selfDeclaredLang(other) ?? (other.language === 'default' ? null : other.language)
  if (!code) return null // no se puede saber qué código le corresponde — no se afirma nada
  return tags.some(t => t.lang !== 'x-default' && t.lang.split('-')[0] === code)
}

/**
 * ¿Las etiquetas hreflang entre estas páginas están bien puestas?
 *
 * El hallazgo se emitía mirando solo datos de Search Console — decía "revisar el
 * emparejamiento hreflang" sin haber pedido una página. Ahora se leen las etiquetas y se
 * chequea lo que la especificación realmente pide. Tres reglas que evitan los falsos
 * positivos que se reportaron:
 *
 *  1. **Solo se comparan páginas de idiomas DISTINTOS, una por idioma.** Dos URLs del
 *     mismo idioma (`/en/car-rental-mendoza/` y `/en/mendoza-airport-car-rental/`) no son
 *     traducciones entre sí: exigirles que se declaren mutuamente daba "falta la etiqueta"
 *     en un sitio donde estaban perfectas. Que dos URLs del mismo idioma compitan por una
 *     keyword es canibalización, y eso se resuelve del otro lado.
 *  2. **Una página con canonical hacia otra URL se saltea.** Google pide hreflang en la
 *     versión canónica; una página que declara "la buena es aquella" no tiene por qué
 *     declarar nada (el caso reportado: `/alquilar-autos-en-mendoza/` con canonical a `/`).
 *  3. **Declarar el idioma del otro pero apuntando a OTRA URL no es un error**, es que
 *     esas dos páginas no son par de traducción. Va como nota informativa, no como
 *     problema: afirmar un error acá era justamente el falso positivo más caro, porque
 *     salía con `verified: true`.
 *
 * @param {Array<{url: string, language: string, check: object}>} pages
 */
function hreflangVerdict(pages = []) {
  const problems = []
  const notes    = []
  const skipped  = []

  const readable = pages.filter(p => p.check && !p.check.error && p.check.status === 200)

  // (2) fuera las que canonicalizan a otra URL
  const canonicalOnes = readable.filter(p => {
    const c = p.check.canonical
    if (c && !sameTarget(c, p.url)) {
      skipped.push({ url: p.url, reason: `Su canonical apunta a ${c}: no es la versión canónica, no se le exige hreflang` })
      return false
    }
    return true
  })

  // (1) una página por idioma, la primera que venga (groupConflicts ya las manda
  // ordenadas por impresiones, así que es la que más pesa en esa búsqueda)
  const byLang = new Map()
  for (const p of canonicalOnes) if (!byLang.has(p.language)) byLang.set(p.language, p)
  const reps = [...byLang.values()]

  if (reps.length < 2) {
    return {
      ok: false, checked: false, problems: [], notes, skipped,
      note: skipped.length
        ? 'Las páginas de los otros idiomas canonicalizan a otra URL o no se pudieron leer en vivo'
        : 'No se pudieron leer dos versiones de idiomas distintos en vivo',
    }
  }

  for (const page of reps) {
    const tags = page.check.hreflang ?? []
    if (tags.length === 0) {
      problems.push({ type: 'missing', url: page.url, detail: 'No declara ninguna etiqueta hreflang' })
      continue
    }
    if (!tags.some(t => sameTarget(t.href, page.url))) {
      problems.push({ type: 'no_self', url: page.url, detail: 'No se autorreferencia (le falta su propio hreflang)' })
    }

    for (const other of reps) {
      if (other.url === page.url) continue

      if (tags.some(t => sameTarget(t.href, other.url))) {
        // La declara: lo único que queda por chequear es que el vínculo vuelva.
        const otherTags = other.check.hreflang ?? []
        if (otherTags.length && !otherTags.some(t => sameTarget(t.href, page.url))) {
          problems.push({
            type: 'not_reciprocal', url: other.url,
            detail: `Declara ${page.url} sin que esa página lo devuelva`,
          })
        }
        continue
      }

      const declaresLang = declaresLanguageOf(tags, other)
      if (declaresLang === false) {
        problems.push({
          type: 'lang_not_declared', url: page.url,
          detail: `No declara ninguna versión en el idioma de ${other.url}`,
        })
      } else {
        // (3) declara ese idioma pero hacia otra URL — o no se puede saber qué código le
        // corresponde. En ninguno de los dos casos se afirma un error.
        notes.push({
          type: 'points_elsewhere', url: page.url,
          detail: `Declara su versión en ese idioma, pero apuntando a otra URL que la que Google devolvió para esta búsqueda (${other.url}): probablemente no son par de traducción`,
        })
      }
    }
  }

  return { ok: problems.length === 0, checked: true, problems, notes, skipped }
}

module.exports = {
  DEFAULT_TIMEOUT,
  MAX_REDIRECTS,
  MAX_HTML_BYTES,
  readHeadFromStream,
  parseHtmlSignals,
  checkUrlLive,
  checkUrlsLive,
  sameTarget,
  selfDeclaredLang,
  liveVerdict,
  hreflangVerdict,
}
