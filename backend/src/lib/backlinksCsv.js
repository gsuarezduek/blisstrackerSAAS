// Parseo de los CSV de backlinks que exportan Ahrefs, Semrush y Search Console.
//
// Sin dependencia nueva: un parser RFC-4180 correcto son unas decenas de líneas y
// el repo no tiene ninguna lib de CSV (sólo generación a mano en el frontend).
// Lo que sí hace falta es cubrir los casos reales de esos exports — comillas,
// comas dentro de un campo, BOM de Excel, CRLF y el separador `;` del Excel en
// español —, que es exactamente lo que fija tests/unit/backlinkCsv.test.js.
const { normalizeLinkUrl, linkDomain } = require('./backlinks')

// Tope de filas que se procesan de un archivo. Un export de Ahrefs de un cliente
// grande son decenas de miles de filas y el body de la request corta en 1 MB
// (express.json) mucho antes; esto es el segundo freno, y lo que sobra se informa
// como salteado en vez de morir en silencio.
const MAX_ROWS = { own: 500, prospects: 1000 }

/** Saca el BOM que Excel escribe al principio del archivo. */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * El separador no se asume: Excel en español exporta con `;` y algunas
 * herramientas con tab. Se elige el que más aparece en la línea de encabezados,
 * contando sólo lo que está FUERA de comillas (un título con comas adentro no
 * puede ganarle al separador real).
 */
function detectSeparator(headerLine) {
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (const ch of headerLine) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (!inQuotes && ch in counts) counts[ch]++
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : ','
}

/**
 * Parser RFC-4180: comillas dobles, `""` como comilla escapada, saltos de línea
 * DENTRO de un campo citado, y CRLF o LF indistintos.
 */
function parseCsv(text, sep) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += ch; i++; continue
    }

    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === sep) { row.push(field); field = ''; i++; continue }
    if (ch === '\r') { i++; continue }               // CRLF: el \n hace el corte
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += ch; i++
  }

  // La última fila puede no terminar en salto de línea.
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  // Una línea vacía al final no es una fila.
  return rows.filter(r => r.length > 1 || (r[0] ?? '').trim() !== '')
}

/** Normaliza un encabezado para comparar: sin tildes, sin signos, minúsculas. */
function normHeader(h) {
  return String(h || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// ─── Mapeo de columnas por formato ───────────────────────────────────────────
//
// Los nombres exactos cambian entre versiones e idiomas del export, así que cada
// campo acepta VARIOS encabezados posibles y se busca por coincidencia
// normalizada. El orden importa: el primero que matchea gana.
const COLUMN_MAP = {
  sourceUrl: [
    'referring page url', 'referring page', 'source url', 'source page',
    'url de la pagina de referencia', 'pagina de referencia', 'url de origen', 'origen',
  ],
  targetUrl: [
    'target url', 'target page', 'url objetivo', 'url de destino', 'destino',
  ],
  anchor: [
    'anchor', 'link anchor', 'anchor text', 'texto ancla', 'texto de ancla', 'ancla',
  ],
  domainRating: [
    'domain rating', 'dr', 'domain authority', 'da', 'page ascore', 'authority score',
    'source trust score', 'trust score', 'autoridad de dominio',
  ],
  traffic: [
    'domain traffic', 'referring page traffic', 'traffic', 'trafico', 'page traffic',
  ],
  firstSeenAt: [
    'first seen', 'first seen date', 'primera vez visto', 'primera aparicion', 'fecha',
  ],
  language: ['language', 'idioma', 'lang'],
  // Las tres banderas del rel vienen en columnas separadas en Semrush y como una
  // sola booleana en Ahrefs; se leen todas y gana la más específica.
  nofollow:  ['nofollow', 'no follow'],
  sponsored: ['sponsored', 'patrocinado'],
  ugc:       ['ugc'],
  linkTypeRaw: ['type', 'link type', 'tipo', 'tipo de enlace'],
  platform:  ['platform', 'plataforma'],
  // Search Console: el reporte agrega por dominio, no trae URL ni anchor.
  siteDomain: [
    'sitio de origen', 'source site', 'sitios de origen', 'dominio de origen', 'site',
  ],
  incomingLinks: ['enlaces entrantes', 'incoming links', 'links', 'enlaces'],
}

/**
 * Qué export es, a partir de los encabezados. Se decide por la columna
 * DISTINTIVA de cada herramienta, no por el conjunto completo: así una versión
 * nueva que agregue o quite columnas se sigue reconociendo.
 */
function detectCsvFormat(headers) {
  const set = new Set((headers || []).map(normHeader))
  const has = (...names) => names.some(n => set.has(n))

  // GSC primero: es el único que NO trae URL de origen, y confundirlo con otro
  // dejaría filas sin nada que verificar.
  const SOURCE_URL_HEADERS = COLUMN_MAP.sourceUrl
  if (has('sitio de origen', 'source site', 'dominio de origen') && !has(...SOURCE_URL_HEADERS)) return 'gsc'
  if (has('referring page url', 'referring page', 'url de la pagina de referencia', 'pagina de referencia')) return 'ahrefs'
  if (has('source url', 'source page', 'url de origen')) return 'semrush'
  // Un CSV cualquiera con algo que parezca una URL de origen entra como genérico.
  if (set.size && [...set].some(h => /url|origen|pagina|page|dominio|domain|sitio|site/.test(h))) return 'generico'
  return null
}

function buildIndex(headers) {
  const norm = headers.map(normHeader)
  const index = {}
  for (const [field, candidates] of Object.entries(COLUMN_MAP)) {
    for (const cand of candidates) {
      const at = norm.indexOf(cand)
      if (at !== -1) { index[field] = at; break }
    }
  }
  return index
}

const truthy = v => /^(true|si|sí|yes|1|x)$/i.test(String(v || '').trim())

/**
 * Un número de un CSV, con el separador de miles desambiguado.
 *
 * El problema es real y no teórico: "12,500" es doce mil quinientos en un export
 * en inglés y doce con cinco en uno en español, y "1.234" al revés. La regla que
 * resuelve los dos casos: si un separador viene seguido de EXACTAMENTE tres
 * dígitos y es el único, es de miles; si hay dos distintos, el último es el
 * decimal. Queda un caso genuinamente ambiguo ("1.500" como mil quinientos o como
 * uno y medio) y se resuelve a miles, que es lo correcto para tráfico y DR, los
 * dos únicos números que leemos de estos archivos.
 */
function numOrNull(value) {
  const text = String(value ?? '').trim().replace(/\s/g, '')
  if (!text) return null

  const lastComma = text.lastIndexOf(',')
  const lastDot   = text.lastIndexOf('.')
  let normalized

  if (lastComma !== -1 && lastDot !== -1) {
    // Los dos presentes: el último es el decimal, el otro es de miles.
    normalized = lastComma > lastDot
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '')
  } else if (lastComma !== -1 || lastDot !== -1) {
    const sep = lastComma !== -1 ? ',' : '.'
    const at  = lastComma !== -1 ? lastComma : lastDot
    const decimals = text.length - at - 1
    const onlyOne = text.split(sep).length === 2
    normalized = decimals === 3 || !onlyOne
      ? text.split(sep).join('')          // separador de miles
      : text.replace(sep, '.')            // decimal
  } else {
    normalized = text
  }

  const num = Number(normalized)
  return Number.isFinite(num) ? num : null
}

function dateOrNull(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  // Los exports usan ISO o DD/MM/YYYY. Se prueba ISO primero: es el que no es
  // ambiguo (en 03/04/2026 no se sabe si abril o marzo sin saber el locale).
  const iso = new Date(text)
  if (!Number.isNaN(iso.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(text)) return iso
  const m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    const parsed = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return Number.isNaN(iso.getTime()) ? null : iso
}

/**
 * Qué tipo de enlace declara el CSV. Devuelve `unknown` cuando el archivo no
 * trae ninguna columna del rel: es información que no tenemos, y asumir `follow`
 * mostraría autoridad que nadie verificó. El verificador la resuelve después.
 */
function linkTypeFromRow(row, index) {
  const raw = index.linkTypeRaw != null ? String(row[index.linkTypeRaw] || '').toLowerCase() : ''
  if (index.sponsored != null && truthy(row[index.sponsored])) return 'sponsored'
  if (index.ugc != null && truthy(row[index.ugc])) return 'ugc'
  if (/sponsored/.test(raw)) return 'sponsored'
  if (/ugc/.test(raw)) return 'ugc'
  if (index.nofollow != null) {
    const value = String(row[index.nofollow] || '').trim()
    if (value) return truthy(value) ? 'nofollow' : 'follow'
  }
  if (/nofollow/.test(raw)) return 'nofollow'
  if (/dofollow|follow/.test(raw)) return 'follow'
  return 'unknown'
}

/**
 * Convierte el texto de un CSV en filas listas para crear `Backlink`.
 *
 * Devuelve `{ format, separator, rows, skipped, unmappedHeaders }`. `skipped`
 * lleva el motivo por fila (`sin_url`, `url_invalida`, `tope`) para que el
 * preview pueda mostrar qué NO va a entrar y por qué — que es la mitad del valor
 * de previsualizar.
 */
function parseBacklinkCsv(text, { format = 'auto', target = 'own' } = {}) {
  const clean = stripBom(String(text || '')).trim()
  if (!clean) return { format: null, separator: ',', rows: [], skipped: [], unmappedHeaders: [], error: 'El archivo está vacío.' }

  const firstLine = clean.split(/\r?\n/, 1)[0]
  const separator = detectSeparator(firstLine)
  const table = parseCsv(clean, separator)
  if (!table.length) return { format: null, separator, rows: [], skipped: [], unmappedHeaders: [], error: 'No se pudo leer ninguna fila.' }

  const headers = table[0].map(h => String(h || '').trim())
  const resolved = format === 'auto' || !format ? detectCsvFormat(headers) : format
  if (!resolved) {
    return {
      format: null, separator, rows: [], skipped: [], unmappedHeaders: headers,
      error: 'No se reconocieron las columnas. El archivo tiene que tener al menos una columna con la URL o el dominio que enlaza.',
    }
  }

  const index = buildIndex(headers)
  const limit = MAX_ROWS[target] ?? MAX_ROWS.own
  const rows = []
  const skipped = []

  for (let r = 1; r < table.length; r++) {
    const raw = table[r]
    if (!raw.some(c => String(c || '').trim())) continue   // fila vacía

    if (rows.length >= limit) {
      skipped.push({ line: r + 1, value: null, reason: 'tope' })
      continue
    }

    const parsed = resolved === 'gsc' ? rowFromGsc(raw, index) : rowFromLinkExport(raw, index)
    if (parsed.error) {
      skipped.push({ line: r + 1, value: parsed.value ?? null, reason: parsed.error })
      continue
    }
    rows.push(parsed.row)
  }

  // Los encabezados que no mapeamos se informan: es lo que avisa que un export
  // nuevo trae una columna que nos estaría sirviendo y no estamos leyendo.
  const usedIdx = new Set(Object.values(index))
  const unmappedHeaders = headers.filter((h, i) => h && !usedIdx.has(i))

  return { format: resolved, separator, rows, skipped, unmappedHeaders, error: null }
}

/** Ahrefs, Semrush y genérico: una fila = una página que nos enlaza. */
function rowFromLinkExport(raw, index) {
  const rawUrl = index.sourceUrl != null ? raw[index.sourceUrl] : null
  const text = String(rawUrl ?? '').trim()
  if (!text) return { error: 'sin_url' }

  const { url, truncated } = normalizeLinkUrl(text)
  if (!url) return { error: 'url_invalida', value: text.slice(0, 120) }
  const domain = linkDomain(url)
  if (!domain) return { error: 'url_invalida', value: text.slice(0, 120) }

  const targetRaw = index.targetUrl != null ? String(raw[index.targetUrl] || '').trim() : ''
  const target = targetRaw ? normalizeLinkUrl(targetRaw).url : null

  return {
    row: {
      sourceUrl:    url,
      sourceDomain: domain,
      targetUrl:    target,
      anchor:       index.anchor != null ? trimOrNull(raw[index.anchor], 200) : null,
      linkType:     linkTypeFromRow(raw, index),
      placement:    placementFrom(raw, index),
      domainRating: index.domainRating != null ? clampDr(numOrNull(raw[index.domainRating])) : null,
      traffic:      index.traffic != null ? intOrNull(numOrNull(raw[index.traffic])) : null,
      language:     index.language != null ? trimOrNull(raw[index.language], 10) : null,
      firstSeenAt:  index.firstSeenAt != null ? dateOrNull(raw[index.firstSeenAt]) : null,
      verifiable:   true,
      notes:        truncated ? `URL original (truncada para el índice): ${text.slice(0, 400)}` : null,
    },
  }
}

/**
 * Search Console: el reporte de Enlaces **agrega por dominio** — no trae la URL
 * de origen ni el anchor. Esas filas nacen con `verifiable: false`: si entraran
 * al verificador, chequearía la home del sitio y daría "perdido" en casi todas.
 * Alguien tiene que completar la URL real para que empiecen a vigilarse.
 */
function rowFromGsc(raw, index) {
  const rawSite = index.siteDomain != null ? raw[index.siteDomain] : raw[0]
  const text = String(rawSite ?? '').trim()
  if (!text) return { error: 'sin_url' }

  const { url } = normalizeLinkUrl(text)
  const domain = url ? linkDomain(url) : null
  if (!domain) return { error: 'url_invalida', value: text.slice(0, 120) }

  const count = index.incomingLinks != null ? intOrNull(numOrNull(raw[index.incomingLinks])) : null

  return {
    row: {
      sourceUrl:    `https://${domain}`,
      sourceDomain: domain,
      targetUrl:    null,
      anchor:       null,
      linkType:     'unknown',
      placement:    null,
      domainRating: null,
      traffic:      null,
      language:     null,
      firstSeenAt:  null,
      verifiable:   false,
      notes: count != null
        ? `Importado de Search Console: ${count} enlace(s) entrantes desde este dominio. Falta la URL de la página concreta para poder verificarlo.`
        : 'Importado de Search Console (agregado por dominio). Falta la URL de la página concreta para poder verificarlo.',
    },
  }
}

function placementFrom(raw, index) {
  const text = index.platform != null ? String(raw[index.platform] || '').toLowerCase() : ''
  if (!text) return null
  if (/blog|news|medio|press|prensa/.test(text)) return 'prensa'
  if (/forum|foro/.test(text)) return 'foro'
  if (/directory|directorio/.test(text)) return 'directorio'
  return null
}

function trimOrNull(value, max) {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, max) : null
}
function intOrNull(num) {
  return num == null ? null : Math.round(num)
}
// Un DR fuera de 0–100 es una columna mal mapeada, no un dato: mejor null que un
// número que después se muestra como autoridad.
function clampDr(num) {
  return num == null || num < 0 || num > 100 ? null : num
}

module.exports = {
  parseBacklinkCsv,
  detectCsvFormat,
  detectSeparator,
  parseCsv,
  normHeader,
  linkTypeFromRow,
  MAX_ROWS,
}
