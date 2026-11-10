// Lógica pura (sin I/O) del inventario SEO del blog: identidad de una URL, de
// qué idioma es, qué alertas salen de comparar dos ventanas de Search Console,
// y cómo se lee un sitemap o la respuesta de la API de WordPress.
//
// Separado de los servicios para poder testear las reglas sin mocks de Prisma
// ni de Search Console — mismo criterio que cannibalAnalysis.js y
// recurrence.service.js, que son los otros dos lugares del repo donde una
// decisión del producto vive en una función pura.

const cheerio = require('cheerio')
const { detectLanguage, normalizeUrlForCompare } = require('./cannibalAnalysis')
const { CONTENT_LANGUAGE_KEYS } = require('./contentCatalog')

// ── Identidad de una URL ────────────────────────────────────────────────────
// La misma normalización que usa el análisis de canibalización: host en
// minúsculas, sin barra final. Que las dos secciones comparen URLs igual es
// lo que permite que una alerta de acá apunte a un conflicto de allá.
const normalizeUrl = normalizeUrlForCompare

// ── Idioma ──────────────────────────────────────────────────────────────────

/**
 * Idioma de una URL por el prefijo de su ruta (/en/, /pt-br/…), restringido al
 * catálogo de Contenido. Una URL sin prefijo es la del idioma principal del
 * sitio, que el sitio decide: por eso `defaultLanguage` es un parámetro y no un
 * valor fijo — en MDZ las notas sin prefijo son español, en otro cliente podrían
 * ser inglés.
 *
 * Devuelve null si el prefijo es de un idioma que no está en el catálogo: es
 * preferible dejar el campo vacío a etiquetar una nota en francés como española.
 */
function languageFromUrl(url, defaultLanguage = null) {
  const detected = detectLanguage(url)
  if (detected === 'default') {
    return CONTENT_LANGUAGE_KEYS.includes(defaultLanguage) ? defaultLanguage : null
  }
  return CONTENT_LANGUAGE_KEYS.includes(detected) ? detected : null
}

// ── Keywords ────────────────────────────────────────────────────────────────

/**
 * Forma comparable de una keyword: sin tildes, sin mayúsculas, sin espacios de
 * más. Se compara lo que una persona escribió en la ficha contra lo que
 * devuelve Google, que son dos fuentes distintas de la misma frase — "Alquiler
 * de Autos" y "alquiler de autos" son la misma keyword, y nadie va a escribirla
 * dos veces igual.
 */
function normalizeKeyword(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Mapa keyword normalizada → quién la tiene asignada. Si dos piezas declaran la
 * misma keyword gana la PRIMERA de la lista (las piezas llegan ordenadas), y la
 * segunda se entera por la alerta de solapamiento — que es justamente el caso
 * que hay que ver, no uno a resolver en silencio pisando el mapa.
 *
 * @param {Array} pieces — [{ id, title, seoKeyword, seoKeywords: string[] }]
 */
function buildKeywordOwners(pieces = []) {
  const owners = new Map()
  for (const p of pieces) {
    const entries = [
      [p.seoKeyword, true],
      ...(Array.isArray(p.seoKeywords) ? p.seoKeywords.map(k => [k, false]) : []),
    ]
    for (const [kw, primary] of entries) {
      const key = normalizeKeyword(kw)
      if (!key || owners.has(key)) continue
      owners.set(key, { pieceId: p.id, title: p.title, primary })
    }
  }
  return owners
}

// ── Alertas ─────────────────────────────────────────────────────────────────

// CTR que se espera en cada posición media. No son números nuestros sino el
// orden de magnitud público de cualquier estudio de CTR por posición; lo que
// importa acá no es el valor exacto sino que un 2% signifique cosas distintas en
// la posición 2 (malísimo) y en la 9 (normal). Comparar contra un umbral plano
// —"CTR < 5%"— marcaba como problema toda nota que rankea en la segunda mitad
// de la primera página, que es la mayoría.
const EXPECTED_CTR_BY_POSITION = [
  [1, 0.27], [2, 0.15], [3, 0.11], [4, 0.08], [5, 0.06],
  [6, 0.045], [7, 0.035], [8, 0.03], [9, 0.025], [10, 0.022],
]
const EXPECTED_CTR_PAGE_TWO = 0.01 // posiciones 11-20

function expectedCtr(position) {
  if (!Number.isFinite(position) || position <= 0) return 0
  const rounded = Math.round(position)
  const hit = EXPECTED_CTR_BY_POSITION.find(([pos]) => pos === rounded)
  if (hit) return hit[1]
  return rounded <= 20 ? EXPECTED_CTR_PAGE_TWO : 0
}

// Umbrales. Todos tienen un piso de volumen: sin él, una nota que pasó de 2
// clics a 1 figura como "perdió el 50% del tráfico" y la lista de alertas se
// llena de ruido que nadie puede accionar.
const MIN_PREV_CLICKS_TO_COMPARE = 10   // clics del período anterior para que una caída signifique algo
const CLICKS_DROP                = 0.30 // -30% de clics
const CLICKS_DROP_CRITICAL       = 0.50
const POSITION_DROP              = 3    // posiciones perdidas
const POSITION_DROP_CRITICAL     = 5
const POSITION_DROP_MAX_PREV     = 20   // caer de la 45 a la 60 no es noticia: nunca estuvo en juego
const MIN_IMPRESSIONS_FOR_POSITION = 50
const MIN_IMPRESSIONS_FOR_CTR    = 100  // "muchas impresiones" del pedido
const CTR_RATIO                  = 0.5  // menos de la mitad del CTR esperado para esa posición
const CRITICAL_IMPRESSIONS       = 500
const MIN_IMPRESSIONS_FOR_OVERLAP = 20  // una keyword que trae 3 impresiones no es una disputa

function pct(value) { return Math.round(value * 100) }

/**
 * Variación porcentual contra el período anterior. `null` cuando no hay con qué
 * comparar (la nota no aparecía): distinto de 0%, que es "no cambió".
 */
function deltaPct(current, previous) {
  if (previous == null) return null
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function losingTrafficAlert(current, previous) {
  if (!previous) return null

  const { clicks, impressions, position } = current
  const reasons = []
  let severity = 'warning'

  if (previous.clicks != null && previous.clicks >= MIN_PREV_CLICKS_TO_COMPARE) {
    const drop = (previous.clicks - clicks) / previous.clicks
    if (drop >= CLICKS_DROP) {
      reasons.push(`${pct(drop)}% menos de clics (${previous.clicks} → ${clicks})`)
      if (drop >= CLICKS_DROP_CRITICAL) severity = 'critical'
    }
  }

  // Search Console da la posición como promedio: sube cuando empeora.
  if (
    previous.position != null &&
    previous.position > 0 &&
    previous.position <= POSITION_DROP_MAX_PREV &&
    impressions >= MIN_IMPRESSIONS_FOR_POSITION
  ) {
    const lost = position - previous.position
    if (lost >= POSITION_DROP) {
      reasons.push(`bajó ${lost.toFixed(1)} posiciones (${previous.position.toFixed(1)} → ${position.toFixed(1)})`)
      if (lost >= POSITION_DROP_CRITICAL) severity = 'critical'
    }
  }

  if (reasons.length === 0) return null
  return {
    code: 'losing_traffic',
    severity,
    message: `Pierde tráfico: ${reasons.join(' y ')}.`,
    data: {
      clicks, prevClicks: previous.clicks,
      position, prevPosition: previous.position,
      clicksDelta: deltaPct(clicks, previous.clicks),
    },
  }
}

function lowCtrAlert(current) {
  const { clicks, impressions, ctr, position } = current
  if (impressions < MIN_IMPRESSIONS_FOR_CTR) return null
  const expected = expectedCtr(position)
  // Fuera de las dos primeras páginas el CTR bajo es la consecuencia de la
  // posición, no del título: reescribir el meta no lo arregla.
  if (expected === 0) return null
  if (ctr >= expected * CTR_RATIO) return null

  return {
    code: 'low_ctr',
    severity: impressions >= CRITICAL_IMPRESSIONS ? 'critical' : 'warning',
    message: `${impressions} impresiones y sólo ${clicks} clics (CTR ${(ctr * 100).toFixed(1)}%, se espera ~${pct(expected)}% en la posición ${position.toFixed(1)}). Conviene reescribir título y meta descripción.`,
    data: { impressions, clicks, ctr, expectedCtr: expected, position },
  }
}

/**
 * Keywords por las que esta nota aparece y que YA tiene asignadas otra pieza.
 * Es la puerta de entrada al módulo de canibalización que ya existe: acá se
 * detecta el solapamiento a nivel de inventario (dos notas apuntando a lo
 * mismo), y el análisis de canibalización es el que mira si además se están
 * robando el ranking en Google.
 *
 * `resolvedQueries` son las queries que el equipo ya marcó como resueltas en
 * ese módulo: volver a alertarlas acá sería pedirle dos veces el mismo trabajo.
 */
function keywordOverlapAlerts({ pieceId, ownKeywords = [], topQueries = [], keywordOwner, resolvedQueries }) {
  if (!keywordOwner || keywordOwner.size === 0) return []

  // La keyword propia primero: un choque declarado (dos piezas con la misma
  // keyword principal) no depende de que Google ya las muestre.
  const candidates = [
    ...ownKeywords.map(kw => ({ query: kw, impressions: null, declared: true })),
    ...topQueries.map(q => ({ query: q.query, impressions: q.impressions, declared: false })),
  ]

  const alerts = []
  const seen = new Set()
  for (const { query, impressions, declared } of candidates) {
    const key = normalizeKeyword(query)
    if (!key || seen.has(key)) continue

    const owner = keywordOwner.get(key)
    if (!owner || owner.pieceId === pieceId) continue
    if (resolvedQueries?.has(String(query).trim().toLowerCase())) continue
    if (!declared && (impressions ?? 0) < MIN_IMPRESSIONS_FOR_OVERLAP) continue

    seen.add(key)
    alerts.push({
      code: 'keyword_overlap',
      severity: owner.primary && !declared ? 'warning' : 'info',
      message: declared
        ? `«${query}» también está asignada a «${owner.title}».`
        : `Aparece para «${query}», que es la keyword de «${owner.title}». Puede estar canibalizando.`,
      data: { query, otherPieceId: owner.pieceId, otherPieceTitle: owner.title, impressions, declared },
    })
  }
  return alerts
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 }

/**
 * Las alertas de una nota, ordenadas por gravedad.
 *
 * @param {object}   current   — { clicks, impressions, ctr, position }
 * @param {object?}  previous  — mismos campos del período anterior, o null
 * @param {Array}    topQueries— [{ query, impressions, … }]
 * @param {string[]} ownKeywords
 * @param {Map}      keywordOwner — ver buildKeywordOwners
 * @param {Set?}     resolvedQueries — queries ya resueltas en Canibalización
 */
function computeAlerts({ pieceId, current, previous = null, topQueries = [], ownKeywords = [], keywordOwner, resolvedQueries } = {}) {
  if (!current) return []
  const alerts = [
    losingTrafficAlert(current, previous),
    lowCtrAlert(current),
    ...keywordOverlapAlerts({ pieceId, ownKeywords, topQueries, keywordOwner, resolvedQueries }),
  ].filter(Boolean)

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

/**
 * Tendencia de una nota, para el filtro de la tabla. Se calcula sobre los clics
 * porque es lo que el inventario ordena y lo que el equipo mira primero.
 * 'nuevo' = sin período anterior con qué comparar.
 */
const TREND_FLAT_PCT = 10 // variaciones menores son ruido de la ventana móvil

function trendOf(stat) {
  if (!stat || stat.prevClicks == null) return 'nuevo'
  const delta = deltaPct(stat.clicks, stat.prevClicks)
  if (delta == null) return 'nuevo'
  if (delta > TREND_FLAT_PCT) return 'sube'
  if (delta < -TREND_FLAT_PCT) return 'baja'
  return 'estable'
}

// ── Importación: sitemap ────────────────────────────────────────────────────

const MAX_SITEMAP_URLS = 2000

/**
 * Lee un sitemap. Devuelve las URLs y, si es un índice de sitemaps, los
 * sitemaps hijos para que el servicio decida si los sigue — un sitio mediano
 * tiene un índice con 10 sitemaps y bajarlos todos sin control es cómo se
 * importan 20.000 URLs de una.
 */
function parseSitemap(xml) {
  const $ = cheerio.load(xml ?? '', { xmlMode: true })

  const sitemaps = $('sitemapindex > sitemap > loc')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)

  const urls = $('urlset > url')
    .map((_, el) => {
      const loc = $(el).find('loc').first().text().trim()
      if (!loc) return null
      const lastmod = $(el).find('lastmod').first().text().trim() || null
      return { url: loc, lastmod }
    })
    .get()
    .filter(Boolean)
    .slice(0, MAX_SITEMAP_URLS)

  return { urls, sitemaps }
}

/**
 * Título a partir del slug de la URL, para las entradas que vienen de un
 * sitemap: un sitemap trae URLs, no títulos. Sin esto una importación de 65
 * notas deja 65 filas tituladas con la URL completa, ilegibles en la tabla.
 * Es un punto de partida editable, no la verdad: WordPress sí trae el título
 * real y por eso ese camino nunca pasa por acá.
 */
function titleFromUrl(url) {
  let slug = ''
  try {
    const { pathname } = new URL(url)
    slug = pathname.replace(/\/+$/, '').split('/').pop() || ''
  } catch {
    slug = String(url ?? '').split('/').filter(Boolean).pop() || ''
  }
  const text = decodeURIComponent(slug)
    .replace(/\.(html?|php|aspx?)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return url
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// ── Importación: WordPress ──────────────────────────────────────────────────

/** Saca el texto de un campo de WP, que puede venir como string o como { rendered }. */
function wpText(field) {
  if (typeof field === 'string') return field
  if (field && typeof field.rendered === 'string') return field.rendered
  return ''
}

// Entidades con nombre que aparecen de verdad en los títulos de un blog en
// español o portugués. No es la tabla completa de HTML (son ~2000): las
// numéricas, que son la mayoría de lo que emite WordPress, se resuelven solas
// con un cálculo, y acá van las que se escriben con nombre.
const NAMED_ENTITIES = {
  quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', hellip: '…',
  ndash: '–', mdash: '—', laquo: '«', raquo: '»', deg: '°', euro: '€',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
  atilde: 'ã', otilde: 'õ', Atilde: 'Ã', Otilde: 'Õ',
  ccedil: 'ç', Ccedil: 'Ç', agrave: 'à', Agrave: 'À',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô',
  iquest: '¿', iexcl: '¡',
}

/**
 * Decodifica las entidades HTML que WordPress deja en los títulos
 * (&#8211;, &amp;, &iacute;…). El título se muestra tal cual en la tabla: sin
 * esto, la mitad del inventario de un sitio en español queda con basura.
 */
function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    // `&amp;` se deja para el final: resolverlo acá convertiría "&amp;lt;" en
    // "<" cuando el texto original decía, literalmente, "&lt;".
    .replace(/&([a-zA-Z]+);/g, (match, name) => (name === 'amp' ? match : (NAMED_ENTITIES[name] ?? match)))
    .replace(/&amp;/g, '&')
    .trim()
}

/**
 * Normaliza la respuesta de /wp-json/wp/v2/posts. `translations` lo expone
 * Polylang cuando está instalado (un objeto { idioma: postId }); no todos los
 * sitios lo traen, así que vincular traducciones a partir de eso es
 * best-effort y nunca un requisito.
 */
function normalizeWpPosts(rows = []) {
  if (!Array.isArray(rows)) return []
  return rows
    .map(r => {
      const url = typeof r?.link === 'string' ? r.link.trim() : ''
      if (!url) return null
      return {
        wpId:         Number.isInteger(r.id) ? r.id : null,
        url,
        title:        decodeEntities(wpText(r.title)) || url,
        date:         typeof r.date_gmt === 'string' ? r.date_gmt : (typeof r.date === 'string' ? r.date : null),
        lang:         typeof r.lang === 'string' ? r.lang.slice(0, 2).toLowerCase() : null,
        translations: r.translations && typeof r.translations === 'object' ? r.translations : null,
      }
    })
    .filter(Boolean)
}

module.exports = {
  // identidad
  normalizeUrl,
  normalizeKeyword,
  languageFromUrl,
  // alertas
  expectedCtr,
  deltaPct,
  trendOf,
  buildKeywordOwners,
  computeAlerts,
  // importación
  titleFromUrl,
  parseSitemap,
  normalizeWpPosts,
  decodeEntities,
  // constantes expuestas para los tests y la documentación de los umbrales
  MIN_IMPRESSIONS_FOR_CTR,
  MIN_PREV_CLICKS_TO_COMPARE,
  MAX_SITEMAP_URLS,
}
