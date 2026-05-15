const axios  = require('axios')
const prisma = require('../lib/prisma')

const SERP_API_BASE = 'https://serpapi.com/search.json'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mapea el código de país GSC (3 letras) al código SerpAPI (ISO 3166-1 alpha-2).
 */
function gscCountryToSerp(gscCode) {
  const map = {
    arg: 'ar', mex: 'mx', col: 'co', esp: 'es',
    chl: 'cl', per: 'pe', ury: 'uy', bra: 'br', usa: 'us',
  }
  return map[(gscCode || 'arg').toLowerCase()] || 'ar'
}

/**
 * Extrae el hostname limpio de una URL. Quita www., protocolo y path.
 * "https://www.example.com/foo" → "example.com"
 */
function extractDomain(websiteUrl) {
  if (!websiteUrl) return null
  try {
    let url = websiteUrl.trim()
    if (!url.startsWith('http')) url = 'https://' + url
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Extrae el hostname de cualquier URL para comparar con dominio del proyecto.
 */
function urlToDomain(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// ─── Llamada a SerpAPI ────────────────────────────────────────────────────────

/**
 * Consulta SerpAPI para una keyword en un país dado.
 * countryCode ya en formato SerpAPI (2 letras, ej: "ar").
 */
async function fetchSerpData(query, countryCode = 'ar') {
  const apiKey = process.env.SERP_API_KEY
  if (!apiKey) throw new Error('SERP_API_KEY no configurada')

  const params = {
    q:       query,
    gl:      countryCode,
    hl:      countryCode === 'br' ? 'pt' : 'es',
    num:     10,
    api_key: apiKey,
  }

  const { data } = await axios.get(SERP_API_BASE, { params, timeout: 15000 })

  if (data.error) throw new Error(`SerpAPI error: ${data.error}`)

  return data
}

// ─── Parseo de respuesta ──────────────────────────────────────────────────────

/**
 * Procesa la respuesta raw de SerpAPI y la estructura para guardar en DB.
 * Detecta posición propia del projectDomain, features, competidores y PAA.
 */
function parseSerpResponse(serpData, projectDomain) {
  const organic = serpData.organic_results || []

  // ── Posición propia ──
  let position  = null
  let resultUrl = null
  if (projectDomain) {
    for (const r of organic) {
      if (r.link && urlToDomain(r.link) === projectDomain) {
        position  = r.position
        resultUrl = r.link
        break
      }
    }
  }

  // ── SERP Features ──
  const features = []
  if (serpData.answer_box)          features.push('featured_snippet')
  if (serpData.ai_overview)         features.push('ai_overview')
  if (serpData.local_results)       features.push('local_pack')
  if (serpData.shopping_results)    features.push('shopping_results')
  if (serpData.knowledge_graph)     features.push('knowledge_graph')
  if (serpData.related_questions)   features.push('people_also_ask')
  if (serpData.top_stories)         features.push('top_stories')
  if (serpData.inline_images || serpData.images_results) features.push('images')
  if (serpData.inline_videos || serpData.video_results)  features.push('videos')
  if (organic.some(r => r.sitelinks)) features.push('site_links')

  // ── Competidores ── (top 10 excluyendo dominio propio)
  const competitors = organic
    .filter(r => r.link && urlToDomain(r.link) !== projectDomain)
    .slice(0, 10)
    .map(r => ({
      position: r.position,
      domain:   urlToDomain(r.link),
      url:      r.link,
      title:    r.title || '',
    }))

  // ── People Also Ask ──
  const peopleAlsoAsk = (serpData.related_questions || []).map(q => q.question)

  // ── Related searches ──
  const relatedSearches = (serpData.related_searches || []).map(r => r.query)

  return {
    position,
    resultUrl,
    serpFeatures:    features,
    competitors,
    peopleAlsoAsk,
    relatedSearches,
    totalResults:    serpData.search_information?.total_results || null,
  }
}

// ─── Captura y guardado de snapshot ──────────────────────────────────────────

/**
 * Captura un SerpSnapshot para una keyword trackeada y lo guarda en DB.
 * Obtiene el websiteUrl del proyecto y el country de su integración GSC.
 */
async function captureAndSaveSerpSnapshot(trackedKeywordId, projectId, workspaceId) {
  const [kw, project, integration] = await Promise.all([
    prisma.trackedKeyword.findUnique({ where: { id: trackedKeywordId } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { websiteUrl: true } }),
    prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'google_search_console' } },
      select: { country: true },
    }),
  ])

  if (!kw) throw new Error('Keyword no encontrada')

  const projectDomain = extractDomain(project?.websiteUrl)
  const gscCountry    = integration?.country || 'arg'
  const serpCountry   = gscCountryToSerp(gscCountry)

  const serpData = await fetchSerpData(kw.query, serpCountry)
  const parsed   = parseSerpResponse(serpData, projectDomain)

  const snapshot = await prisma.serpSnapshot.create({
    data: {
      trackedKeywordId,
      projectId,
      workspaceId,
      position:        parsed.position,
      resultUrl:       parsed.resultUrl,
      serpFeatures:    JSON.stringify(parsed.serpFeatures),
      competitors:     JSON.stringify(parsed.competitors),
      peopleAlsoAsk:   JSON.stringify(parsed.peopleAlsoAsk),
      relatedSearches: JSON.stringify(parsed.relatedSearches),
      country:         serpCountry,
      totalResults:    parsed.totalResults ? String(parsed.totalResults) : null,
    },
  })

  return {
    ...snapshot,
    serpFeatures:    parsed.serpFeatures,
    competitors:     parsed.competitors,
    peopleAlsoAsk:   parsed.peopleAlsoAsk,
    relatedSearches: parsed.relatedSearches,
  }
}

// ─── Cron: capturar todos los snapshots semanales ────────────────────────────

/**
 * Ejecutado semanalmente: captura SERP snapshots para todos los proyectos
 * con al menos 1 keyword trackeada. 800ms de delay entre keywords para
 * respetar rate limits de SerpAPI.
 */
async function captureAllSerpSnapshots() {
  if (!process.env.SERP_API_KEY) {
    console.log('[SerpAPI] SERP_API_KEY no configurada, saltando cron.')
    return
  }

  const projects = await prisma.trackedKeyword.findMany({
    where:    {},
    select:   { projectId: true, workspaceId: true },
    distinct: ['projectId'],
  })

  console.log(`[SerpAPI] Capturando snapshots para ${projects.length} proyecto(s)...`)
  let total = 0; let errors = 0

  for (const { projectId, workspaceId } of projects) {
    const keywords = await prisma.trackedKeyword.findMany({
      where:  { projectId, workspaceId },
      select: { id: true, query: true },
    })

    for (const kw of keywords) {
      try {
        await captureAndSaveSerpSnapshot(kw.id, projectId, workspaceId)
        total++
      } catch (err) {
        errors++
        console.error(`[SerpAPI] Error en keyword ${kw.id} ("${kw.query}"):`, err.message)
      }
      await new Promise(r => setTimeout(r, 800))
    }

    await new Promise(r => setTimeout(r, 500))
  }

  console.log(`[SerpAPI] ${total} snapshots capturados, ${errors} errores.`)
}

module.exports = {
  gscCountryToSerp,
  extractDomain,
  fetchSerpData,
  parseSerpResponse,
  captureAndSaveSerpSnapshot,
  captureAllSerpSnapshots,
}
