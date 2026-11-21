// Búsquedas de marca: no son canibalización.
//
// ── Por qué ──────────────────────────────────────────────────────────────────
// Cuando alguien busca el nombre del negocio, que aparezcan dos páginas del sitio no es
// un problema de intención compitiendo: es Google mostrando el sitio. Consolidar o
// canonicalizar ahí no corresponde — lo único que importa es que gane la URL esperada
// (normalmente la home). Tratarlas como conflictos llenaba la lista de ruido inaccionable.
//
// ── Por qué los términos los confirma una persona ────────────────────────────
// Derivarlos del dominio es trampa: "car" está dentro de "mdzrentacar" y es la keyword
// más importante del negocio; marcarla como marca borraría del análisis justo lo que hay
// que mirar. Y hay tokens que parecen marca y no lo son: "mdz" es el código IATA del
// aeropuerto de Mendoza y se usa como sinónimo de la ciudad (igual que "mza").
// Por eso el sistema SUGIERE a partir de búsquedas reales de Search Console, marcando
// como dudoso todo lo que podría ser genérico, y no aplica nada sin confirmación.

const { significantTerms } = require('./cannibalAnalysis')

// Palabras que aparecen en el nombre de muchas marcas pero que, solas, son la búsqueda
// genérica del rubro. Un token de esta lista nunca se sugiere como término de marca por
// sí mismo (sí como parte de una frase: "mdz rent a car" está bien, "car" no).
const GENERIC_TOKENS = new Set([
  // Rubro / servicio
  'rent', 'rental', 'rentacar', 'car', 'cars', 'auto', 'autos', 'alquiler', 'alquileres',
  'hotel', 'hostel', 'resort', 'tour', 'tours', 'viajes', 'turismo', 'travel',
  'inmobiliaria', 'propiedades', 'clinica', 'centro', 'estudio', 'taller', 'tienda',
  'shop', 'store', 'market', 'group', 'grupo', 'company', 'srl', 'sa', 'sas', 'ltda',
  'oficial', 'online', 'web', 'app', 'digital', 'agencia', 'agency', 'servicios',
  'service', 'services', 'solutions', 'soluciones', 'consultora', 'consulting',
  // Geográficos y códigos de aeropuerto usados como sinónimo de ciudad
  'mdz', 'mza', 'mendoza', 'bsas', 'caba', 'baires', 'cordoba', 'rosario', 'argentina',
  'chile', 'brasil', 'brazil', 'uruguay', 'eze', 'aep', 'cor', 'bue',
])

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** El nombre del negocio como tokens, para buscarlo dentro de las queries. */
function brandNameTokens({ projectName, websiteUrl } = {}) {
  const fromName = normalize(projectName).split(' ').filter(Boolean)
  let fromDomain = []
  // Ojo: `new URL('https://undefined')` es una URL válida con hostname "undefined", así
  // que sin este guard un proyecto sin web generaba el término "undefined".
  if (typeof websiteUrl === 'string' && websiteUrl.trim()) {
    try {
      const raw = websiteUrl.trim()
      const host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname
      fromDomain = [normalize(host.replace(/^www\./, '').split('.')[0])].filter(Boolean)
    } catch { /* sin dominio usable */ }
  }
  return [...new Set([...fromName, ...fromDomain])].filter(t => t.length >= 2)
}

/**
 * Sugiere términos de marca a partir de búsquedas REALES de Search Console.
 *
 * Prioriza frases completas (las que de verdad son la marca escrita de distintas formas:
 * "mdz rent a car", "mdzrentacar", "mdz rentacar") y marca como `doubtful` todo lo que
 * podría ser genérico, para que la decisión quede en la persona.
 *
 * @param {Array<{query: string, impressions: number}>} rows
 * @param {{projectName?: string, websiteUrl?: string, existing?: string[]}} opts
 * @returns {Array<{term: string, impressions: number, doubtful: boolean, reason: string|null}>}
 */
function suggestBrandTerms(rows = [], { projectName, websiteUrl, existing = [] } = {}) {
  const nameTokens = brandNameTokens({ projectName, websiteUrl })
  if (nameTokens.length === 0) return []

  // Un token del nombre que además es genérico no sirve para reconocer la marca en una
  // query: "car" matchearía "alquiler de car" y media lista de keywords del rubro.
  const anchors = nameTokens.filter(t => !GENERIC_TOKENS.has(t) && t.length >= 3)
  if (anchors.length === 0) return []

  const already = new Set(existing.map(normalize))
  const byTerm = new Map()

  for (const row of rows) {
    const q = normalize(row.query)
    if (!q) continue
    // La query menciona la marca si contiene alguno de los tokens distintivos del nombre,
    // o el dominio escrito junto ("mdzrentacar").
    const mentions = anchors.some(a => q.split(' ').includes(a) || q.replace(/ /g, '').includes(a))
    if (!mentions) continue
    if (already.has(q)) continue

    const entry = byTerm.get(q) || { term: q, impressions: 0 }
    entry.impressions += row.impressions || 0
    byTerm.set(q, entry)
  }

  return [...byTerm.values()]
    .map(e => {
      const tokens = e.term.split(' ').filter(Boolean)
      // Un token solo y genérico (o muy corto) es justo el caso que hay que mirar con
      // lupa: puede ser la marca o la búsqueda del rubro/ciudad.
      const doubtful = tokens.length === 1 && (GENERIC_TOKENS.has(tokens[0]) || tokens[0].length <= 3)
      return {
        term: e.term,
        impressions: e.impressions,
        doubtful,
        reason: doubtful
          ? 'Una sola palabra, y también se usa como búsqueda genérica o de ciudad — confirmá solo si de verdad es tu marca'
          : null,
      }
    })
    // Frases completas primero (más tokens = más inequívoco), y a igual largo, por volumen.
    .sort((a, b) => {
      if (a.doubtful !== b.doubtful) return a.doubtful ? 1 : -1
      const tokensA = a.term.split(' ').length
      const tokensB = b.term.split(' ').length
      if (tokensA !== tokensB) return tokensB - tokensA
      return b.impressions - a.impressions
    })
    .slice(0, 25)
}

/**
 * ¿Esta búsqueda es de marca? Sí cuando, al quitarle los términos de marca confirmados,
 * no queda nada significativo: "mdz rent a car" es marca y "mdz rent a car aeropuerto"
 * no (tiene intención propia y se sigue analizando).
 */
function isBrandQuery(query, brandTerms = []) {
  if (!brandTerms.length) return false
  let rest = ` ${normalize(query)} `
  if (rest.trim() === '') return false

  // Se quitan primero los términos más largos: si están cargados "mdz rent a car" y
  // "car", sacar el corto antes dejaría la frase sin poder matchear el largo.
  for (const term of [...brandTerms].map(normalize).filter(Boolean).sort((a, b) => b.length - a.length)) {
    rest = rest.split(` ${term} `).join(' ')
  }
  return significantTerms(rest).length === 0
}

/**
 * Qué decir de una búsqueda de marca. No se recomienda consolidar ni canonicalizar:
 * lo único que se verifica es que gane la URL esperada.
 */
function buildBrandFinding(conflict, { brandUrl }) {
  const urls = conflict.urls ?? []
  const winner = urls[0] // groupConflicts ya las ordena por impresiones
  const expected = brandUrl || null
  const expectedHit = expected ? urls.find(u => sameish(u.url, expected)) : null
  const winnerIsExpected = expected ? sameish(winner?.url, expected) : null

  let note
  if (!expected) {
    note = `Búsqueda de marca: lo único que hay que revisar es que gane la URL correcta. Hoy gana ${winner?.url ?? 's/d'} (${winner?.impressions ?? 0} imp.). Si no es la que esperás, marcá la URL de marca del proyecto para que esto se verifique solo.`
  } else if (winnerIsExpected) {
    note = `Búsqueda de marca: gana la URL esperada (${expected}). Nada que hacer.`
  } else {
    note = `Búsqueda de marca: gana ${winner?.url ?? 's/d'} (${winner?.impressions ?? 0} imp.) en lugar de la URL esperada (${expected}${expectedHit ? `, ${expectedHit.impressions} imp.` : ', que no aparece para esta búsqueda'}). Revisá por qué: no corresponde consolidar ni canonicalizar, sino que la página de marca sea la que responde.`
  }

  return {
    query: conflict.query,
    language: conflict.language,
    totalImpressions: conflict.totalImpressions,
    urls: urls.map(u => ({ url: u.url, impressions: u.impressions, clicks: u.clicks, position: u.position })),
    expectedUrl: expected,
    winnerUrl: winner?.url ?? null,
    ok: winnerIsExpected === true || (winnerIsExpected === null ? null : false),
    note,
  }
}

// Comparación laxa de URLs (sin esquema, www ni barra final), igual criterio que el resto.
function sameish(a, b) {
  const norm = u => {
    try {
      const url = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`)
      return `${url.host.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '') || '/'}`
    } catch { return String(u ?? '').trim().toLowerCase().replace(/\/+$/, '') }
  }
  return !!a && !!b && norm(a) === norm(b)
}

/**
 * Parte los conflictos detectados en los que son de marca y el resto.
 * Se aplica EN LECTURA además de en el run, igual que las resoluciones: cambiar la lista
 * de términos tiene efecto al instante y no hace falta re-correr el análisis.
 */
function splitBrandConflicts(conflicts = [], { brandTerms = [], brandUrl = null } = {}) {
  if (!brandTerms.length) return { conflicts, brandQueries: [] }
  const rest = []
  const brandQueries = []
  for (const c of conflicts) {
    if (isBrandQuery(c.query, brandTerms)) brandQueries.push(buildBrandFinding(c, { brandUrl }))
    else rest.push(c)
  }
  return { conflicts: rest, brandQueries }
}

module.exports = {
  GENERIC_TOKENS,
  normalize,
  brandNameTokens,
  suggestBrandTerms,
  isBrandQuery,
  buildBrandFinding,
  splitBrandConflicts,
}
