// Lógica pura (sin I/O) del análisis de canibalización SEO: detección de idioma
// por prefijo de ruta, detección de URLs indexadas por error, severidad,
// elección de URL principal y armado de recomendaciones no destructivas.
// Separado de cannibalization.service.js para poder testearlo sin mocks de
// Prisma/Search Console (mismo criterio que recurrence.service.js).

const KNOWN_LANGS = new Set([
  'en', 'es', 'pt', 'fr', 'de', 'it', 'nl', 'ca', 'eu', 'gl',
  'ru', 'zh', 'ja', 'ko', 'ar', 'he', 'pl', 'tr', 'sv', 'no',
  'da', 'fi', 'cs', 'el', 'hu', 'ro', 'uk', 'hi', 'id', 'vi', 'th',
])

const LANGUAGE_PREFIX_RE = /^\/([a-z]{2})(?:[-_][a-z]{2})?(?:\/|$)/i

// Idioma de una URL por prefijo de ruta (/en/, /pt-br/...). Sin match
// reconocible → 'default' (idioma principal sin prefijo, típico de Polylang).
function detectLanguage(pageUrl) {
  try {
    const { pathname } = new URL(pageUrl)
    const m = pathname.match(LANGUAGE_PREFIX_RE)
    if (m && KNOWN_LANGS.has(m[1].toLowerCase())) return m[1].toLowerCase()
  } catch { /* URL inválida */ }
  return 'default'
}

const JUNK_RULES = [
  {
    test: ({ search }) => !!search,
    reason: 'URL con parámetros de query',
    suggestionType: 'canonical_or_noindex',
    suggestion: 'Canonicalizar a la URL sin parámetros, o agregar noindex si no tiene versión canónica clara.',
  },
  {
    test: ({ pathname }) => /\/attachment\/?$/i.test(pathname),
    reason: 'Página de adjunto (attachment)',
    suggestionType: 'noindex',
    suggestion: 'Noindex: las páginas de adjunto no deberían indexarse; considerar canonical a la entrada que las usa.',
  },
  {
    test: ({ pathname }) => /\/feed\/?$/i.test(pathname),
    reason: 'Feed RSS',
    suggestionType: 'noindex',
    suggestion: 'Noindex: un feed RSS no debería indexarse como página de contenido.',
  },
  {
    test: ({ pathname }) => /\/page\/\d+\/?$/i.test(pathname),
    reason: 'Página de paginación',
    suggestionType: 'canonical',
    suggestion: 'Canonical hacia la primera página de la serie, o noindex si no aporta contenido único.',
  },
  {
    test: ({ pathname }) => {
      const seg = pathname.replace(/\/$/, '').split('/').pop() || ''
      return /^\d+(-\d+)*$/.test(seg)
    },
    reason: 'Slug numérico (probable URL auto-generada sin contenido real)',
    suggestionType: 'review',
    suggestion: 'Revisar manualmente: si no tiene contenido real, devolver 404/410; si es una URL vieja, canonical a la home o a la URL correcta.',
  },
]

// null si la URL no parece "indexada por error"; si matchea, { reason, suggestionType, suggestion }.
function classifyJunkUrl(pageUrl) {
  let parsed
  try { parsed = new URL(pageUrl) } catch { return null }
  const { pathname, search } = parsed
  for (const rule of JUNK_RULES) {
    if (rule.test({ pathname, search })) {
      return { reason: rule.reason, suggestionType: rule.suggestionType, suggestion: rule.suggestion }
    }
  }
  return null
}

// Score aditivo 0-100 de severidad de un conflicto (sin cambios de comportamiento).
function calcSeverity(urls, totalImpressions) {
  const positions = urls.map(u => u.position).filter(Boolean)
  const positionSpread = positions.length >= 2
    ? Math.max(...positions) - Math.min(...positions)
    : 0

  const maxCTR = Math.max(...urls.map(u => u.ctr || 0))

  const impressionsScore = Math.min(totalImpressions / 200, 40)          // 0-40
  const spreadScore      = Math.min(positionSpread * 4, 30)              // 0-30
  const urlBonus         = Math.min((urls.length - 2) * 10, 20)         // 0-20
  const ctrPenalty       = maxCTR < 0.02 ? 15 : maxCTR < 0.05 ? 8 : 0  // 0-15

  const score = Math.min(Math.round(impressionsScore + spreadScore + urlBonus + ctrPenalty), 100)

  const label = score >= 55 ? 'Alta' : score >= 25 ? 'Media' : 'Baja'
  return { label, score }
}

// Host (lowercase) + pathname sin trailing slash + search, para comparar URLs
// sin que importen mayúsculas de host o una barra final.
function normalizeUrlForCompare(url) {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, '') || '/'
    return `${u.host.toLowerCase()}${path}${u.search}`
  } catch {
    return String(url || '').trim().toLowerCase().replace(/\/+$/, '')
  }
}

// URL principal sugerida dentro de un conflicto: más clics > más impresiones >
// mejor posición promedio. Devuelve { url, reason }.
function pickMainUrl(urls) {
  const sorted = [...urls].sort((a, b) => {
    if (b.clicks !== a.clicks) return b.clicks - a.clicks
    if (b.impressions !== a.impressions) return b.impressions - a.impressions
    return (a.position || 999) - (b.position || 999)
  })
  const main = sorted[0]
  const runnerUp = sorted[1]
  let reason
  if (!runnerUp || main.clicks > runnerUp.clicks) reason = `más clics (${main.clicks})`
  else if (main.impressions > runnerUp.impressions) reason = `más impresiones (${main.impressions})`
  else reason = `mejor posición promedio (${main.position != null ? main.position.toFixed(1) : 's/d'})`
  return { url: main.url, reason }
}

// Recomendación no destructiva, en orden de prioridad: diferenciar intención →
// enlazado interno → canonical → 301/noindex (solo sobre URLs no protegidas).
function buildRecommendation(urlsSorted, query, protectedSet) {
  const { url: mainUrl, reason: mainUrlReason } = pickMainUrl(urlsSorted)
  const secondary = urlsSorted.filter(u => u.url !== mainUrl)
  const protectedUrls = secondary.filter(u => protectedSet.has(normalizeUrlForCompare(u.url))).map(u => u.url)
  const actionableUrls = secondary.filter(u => !protectedSet.has(normalizeUrlForCompare(u.url))).map(u => u.url)

  const steps = [
    'Revisar si estas URLs responden a intenciones de búsqueda distintas (title, H1 y contenido). Si la intención es la misma, priorizar consolidar en la URL principal.',
    `Agregar enlaces internos con anchor exacto "${query}" apuntando a la URL principal (${mainUrl}) desde las URLs secundarias y otras páginas relevantes.`,
    'Si el contenido es muy similar, agregar <link rel="canonical"> en las URLs secundarias apuntando a la URL principal.',
  ]
  if (actionableUrls.length > 0) {
    steps.push(`Como último recurso: aplicar 301 de ${actionableUrls.join(', ')} hacia la principal, o noindex si no se puede redirigir.`)
  }
  if (protectedUrls.length > 0) {
    const plural = protectedUrls.length > 1
    steps.push(
      `${protectedUrls.join(', ')} está${plural ? 'n' : ''} marcada${plural ? 's' : ''} como protegida${plural ? 's' : ''}: no se recomienda 301 ni noindex, solo las acciones de diferenciación/enlazado/canonical de arriba.`
    )
  }

  return { mainUrl, mainUrlReason, steps, protectedUrls }
}

function buildConflict(query, urls, protectedSet) {
  const totalImpressions = urls.reduce((s, u) => s + u.impressions, 0)
  const totalClicks = urls.reduce((s, u) => s + u.clicks, 0)
  const positions = urls.map(u => u.position).filter(Boolean)
  const positionSpread = positions.length >= 2 ? Math.max(...positions) - Math.min(...positions) : 0
  const { label: severity, score: severityScore } = calcSeverity(urls, totalImpressions)
  const urlsSorted = [...urls].sort((a, b) => b.impressions - a.impressions)
  const recommendation = buildRecommendation(urlsSorted, query, protectedSet)

  return {
    query,
    language: urls[0].language,
    urls: urlsSorted.map(u => ({
      url: u.url, clicks: u.clicks, impressions: u.impressions, ctr: u.ctr, position: u.position,
      protected: protectedSet.has(normalizeUrlForCompare(u.url)),
    })),
    severity,
    severityScore,
    totalImpressions,
    totalClicks,
    positionSpread: Math.round(positionSpread * 10) / 10,
    recommendation,
  }
}

/**
 * Orquestador central: agrupa filas planas de Search Console en conflictos de
 * canibalización, hallazgos de hreflang y URLs indexadas por error.
 *
 * @param {Array<{query,page,country,clicks,impressions,ctr,position}>} rows
 * @param {{protectedUrls?: string[], languageFilter?: string|null, languageOverrides?: Map<string,string>}} opts
 */
function groupConflicts(rows, { protectedUrls = [], languageFilter = null, languageOverrides = new Map() } = {}) {
  const protectedSet = new Set(protectedUrls.map(normalizeUrlForCompare))

  // 1. URLs basura — sobre TODAS las filas, independiente de query/idioma.
  const junkMap = new Map()
  for (const row of rows) {
    const junk = classifyJunkUrl(row.page)
    if (!junk) continue
    if (!junkMap.has(row.page)) {
      junkMap.set(row.page, { url: row.page, ...junk, impressions: 0, clicks: 0, queries: new Set() })
    }
    const entry = junkMap.get(row.page)
    entry.impressions += row.impressions
    entry.clicks += row.clicks
    entry.queries.add(row.query)
  }
  const indexedByMistake = [...junkMap.values()]
    .map(e => ({
      url: e.url, reason: e.reason, suggestionType: e.suggestionType, suggestion: e.suggestion,
      impressions: e.impressions, clicks: e.clicks, sampleQueries: [...e.queries].slice(0, 3),
    }))
    .sort((a, b) => b.impressions - a.impressions)

  const junkUrls = new Set(junkMap.keys())

  // 2. Agregar filas no-basura por (query, page) entre países.
  const byQueryPage = new Map()
  for (const row of rows) {
    if (junkUrls.has(row.page)) continue
    const key = `${row.query}\u0000${row.page}`
    if (!byQueryPage.has(key)) {
      byQueryPage.set(key, { query: row.query, url: row.page, clicks: 0, impressions: 0, posSum: 0, posWeight: 0, countries: {} })
    }
    const e = byQueryPage.get(key)
    e.clicks += row.clicks
    e.impressions += row.impressions
    e.posSum += (row.position || 0) * row.impressions
    e.posWeight += row.impressions
    if (row.country) e.countries[row.country] = (e.countries[row.country] || 0) + row.impressions
  }

  // 3. Idioma por URL (prefijo, con override por fetch si lo hubiera).
  const pageAgg = [...byQueryPage.values()].map(e => ({
    query: e.query,
    url: e.url,
    clicks: e.clicks,
    impressions: e.impressions,
    position: e.posWeight > 0 ? e.posSum / e.posWeight : null,
    ctr: e.impressions > 0 ? e.clicks / e.impressions : 0,
    countries: e.countries,
    language: languageOverrides.get(e.url) ?? detectLanguage(e.url),
  }))

  // 4. Agrupar por query.
  const byQuery = new Map()
  for (const u of pageAgg) {
    if (!byQuery.has(u.query)) byQuery.set(u.query, [])
    byQuery.get(u.query).push(u)
  }

  const conflicts = []
  const hreflangIssues = []

  for (const [query, urls] of byQuery) {
    const totalImpressions = urls.reduce((s, u) => s + u.impressions, 0)
    if (totalImpressions < 50) continue // descarta queries con muy poco volumen

    if (languageFilter) {
      const filtered = urls.filter(u => u.language === languageFilter)
      if (filtered.length >= 2) conflicts.push(buildConflict(query, filtered, protectedSet))
      continue // con filtro de idioma activo no se evalúa hreflang
    }

    const languages = [...new Set(urls.map(u => u.language))]

    if (languages.length > 1) {
      hreflangIssues.push({
        query,
        totalImpressions,
        urls: urls.map(u => ({
          url: u.url, language: u.language, clicks: u.clicks, impressions: u.impressions,
          position: u.position != null ? Math.round(u.position * 10) / 10 : null,
        })),
        suggestion: 'Google está devolviendo URLs de distinto idioma para la misma búsqueda. Revisar el emparejamiento hreflang entre estas versiones.',
      })

      const byLang = new Map()
      for (const u of urls) {
        if (!byLang.has(u.language)) byLang.set(u.language, [])
        byLang.get(u.language).push(u)
      }
      for (const langUrls of byLang.values()) {
        if (langUrls.length >= 2) conflicts.push(buildConflict(query, langUrls, protectedSet))
      }
    } else if (urls.length >= 2) {
      conflicts.push(buildConflict(query, urls, protectedSet))
    }
  }

  conflicts.sort((a, b) => b.severityScore - a.severityScore)
  hreflangIssues.sort((a, b) => b.totalImpressions - a.totalImpressions)

  const criticalCount = conflicts.filter(c => c.severity === 'Alta').length
  const warningCount  = conflicts.filter(c => c.severity === 'Media').length
  const lowCount      = conflicts.filter(c => c.severity === 'Baja').length
  const trafficAtRisk = conflicts
    .filter(c => c.severity === 'Alta' || c.severity === 'Media')
    .reduce((s, c) => s + c.totalImpressions, 0)

  return {
    conflicts, hreflangIssues, indexedByMistake,
    criticalCount, warningCount, lowCount, trafficAtRisk,
    hreflangCount: hreflangIssues.length,
    indexedByMistakeCount: indexedByMistake.length,
  }
}

module.exports = {
  KNOWN_LANGS,
  detectLanguage,
  classifyJunkUrl,
  calcSeverity,
  normalizeUrlForCompare,
  pickMainUrl,
  buildRecommendation,
  groupConflicts,
}
