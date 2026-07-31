const axios     = require('axios')
const cheerio   = require('cheerio')
const prisma    = require('../lib/prisma')
const { logTokens } = require('../lib/logTokens')
const { assertPublicUrl } = require('../lib/safeUrl')

const { anthropic } = require('../lib/claude')

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const res = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'BlissTrackerBot/1.0 (+https://blisstracker.app)' },
    maxRedirects: 5,
  })
  return res.data
}

async function fetchRobotsTxt(origin) {
  try {
    const res = await axios.get(`${origin}/robots.txt`, { timeout: 8000 })
    return res.data
  } catch { return '' }
}

async function fetchLlmsTxt(origin) {
  try {
    const res = await axios.get(`${origin}/llms.txt`, { timeout: 8000 })
    return { exists: true, content: res.data?.slice(0, 3000) ?? '' }
  } catch { return { exists: false, content: '' } }
}

async function fetchAiDiscovery(origin) {
  const endpoints = [
    { path: '/.well-known/ai.txt',  key: 'aiTxt'     },
    { path: '/ai/summary.json',     key: 'aiSummary'  },
    { path: '/sitemap.xml',         key: 'sitemap'    },
  ]
  const results = {}
  await Promise.all(endpoints.map(async ({ path, key }) => {
    try {
      const res = await axios.get(`${origin}${path}`, { timeout: 6000 })
      results[key] = { exists: true, status: res.status }
    } catch {
      results[key] = { exists: false }
    }
  }))
  return results
}

function extractPageData(html, url) {
  const $ = cheerio.load(html)
  const origin = new URL(url).origin

  const title       = $('title').first().text().trim()
  const description = $('meta[name="description"]').attr('content') ?? ''
  const canonical   = $('link[rel="canonical"]').attr('href') ?? ''
  const langAttr    = $('html').attr('lang') ?? ''

  // Meta robots — noindex/nofollow
  const robotsMeta  = $('meta[name="robots"], meta[name="googlebot"]').map((_, el) => $(el).attr('content') ?? '').get().join(',')
  const isNoindex   = /noindex/i.test(robotsMeta)
  const isNofollow  = /nofollow/i.test(robotsMeta)

  const h1 = $('h1').map((_, el) => $(el).text().trim()).get()
  const h2 = $('h2').map((_, el) => $(el).text().trim()).get().slice(0, 10)
  const h3 = $('h3').map((_, el) => $(el).text().trim()).get().slice(0, 10)

  // JSON-LD schemas — must extract BEFORE removing script tags
  const schemas = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try { schemas.push(JSON.parse($(el).html())) } catch {}
  })
  // Handle both "@type": "X" and "@type": ["X", "Y"]
  const schemaTypes = schemas.flatMap(s =>
    Array.isArray(s['@type']) ? s['@type'] : (s['@type'] ? [s['@type']] : [])
  ).filter(Boolean)

  // Dynamic widget detection — must run BEFORE removing scripts/iframes
  // These load content via JS so cheerio sees them as empty, but they ARE present
  const REVIEW_WIDGET_PATTERNS = [
    { pattern: /elfsight/i,            label: 'Elfsight widget' },
    { pattern: /maps\.google|google\.com\/maps/i, label: 'Google Maps/Reviews iframe' },
    { pattern: /widget\.trustpilot/i, label: 'Trustpilot widget' },
    { pattern: /reviews\.io/i,        label: 'Reviews.io widget' },
    { pattern: /birdeye\.com/i,        label: 'Birdeye widget' },
    { pattern: /podium\.com/i,         label: 'Podium widget' },
    { pattern: /grade\.us/i,           label: 'Grade.us widget' },
    { pattern: /reviewtrackers/i,      label: 'ReviewTrackers widget' },
    { pattern: /senja\.io/i,           label: 'Senja widget' },
    { pattern: /testimonial\.to/i,     label: 'Testimonial.to widget' },
  ]
  const dynamicWidgets = []
  // Check iframes
  $('iframe').each((_, el) => {
    const src = $(el).attr('src') ?? ''
    for (const { pattern, label } of REVIEW_WIDGET_PATTERNS) {
      if (pattern.test(src)) { dynamicWidgets.push(label); break }
    }
  })
  // Check scripts
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src') ?? ''
    for (const { pattern, label } of REVIEW_WIDGET_PATTERNS) {
      if (pattern.test(src)) { dynamicWidgets.push(label); break }
    }
  })
  // Check div class/id patterns (Elfsight and similar inject via class)
  $('[class*="elfsight"], [class*="trustpilot"], [class*="reviews-widget"], [id*="reviews-widget"]').each(() => {
    if (!dynamicWidgets.includes('Elfsight widget')) dynamicWidgets.push('widget de reseñas embebido')
  })
  const hasDynamicReviewWidget = dynamicWidgets.length > 0

  // Word count before removing elements
  const wordCount = $('body').text().replace(/\s+/g, ' ').trim().split(' ').length

  // SPA/CSR detection: if raw HTML has barely any text, the site likely renders via JS
  const likelySPA = wordCount < 150 && h1.length === 0 && schemas.length === 0

  $('script, style, nav, footer, header, aside, noscript').remove()
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 4000)

  // Open Graph / Twitter
  const ogTitle       = $('meta[property="og:title"]').attr('content') ?? ''
  const ogDescription = $('meta[property="og:description"]').attr('content') ?? ''
  const ogImage       = $('meta[property="og:image"]').attr('content') ?? ''
  const twitterCard   = $('meta[name="twitter:card"]').attr('content') ?? ''

  // RSS / Atom feed
  const rssLink = $('link[type="application/rss+xml"], link[type="application/atom+xml"]').attr('href') ?? ''

  // FAQ sections
  const hasFaq = $('[itemtype*="FAQPage"], [class*="faq"], [id*="faq"]').length > 0
    || schemaTypes.includes('FAQPage')

  // Author / E-E-A-T signals
  const hasAuthor = $('[rel="author"], [itemprop="author"], [class*="author"], [class*="byline"]').length > 0
  const dateElems = $('time[datetime], [itemprop="datePublished"], [itemprop="dateModified"]')
  const hasDates  = dateElems.length > 0
  const latestDate = dateElems.first().attr('datetime') ?? dateElems.first().text().trim() ?? ''

  // Statistics detection
  const statsMatches = (bodyText.match(/\d+[\.,]?\d*\s*(%|€|\$|mil\b|millones|billion|million|usuarios|clientes|clients)/gi) ?? []).length

  // External citations
  const externalLinks = []
  const internalLinks = []
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) return
    try {
      const abs = new URL(href, origin).href
      if (abs.startsWith(origin)) internalLinks.push(abs)
      else externalLinks.push(abs)
    } catch {}
  })

  return {
    title, description, canonical, langAttr, wordCount,
    isNoindex, isNofollow, likelySPA,
    h1, h2, h3, bodyText,
    schemas, schemaTypes,
    hasAuthor, hasDates, latestDate,
    hasDynamicReviewWidget, dynamicWidgets: [...new Set(dynamicWidgets)],
    og: { title: ogTitle, description: ogDescription, image: ogImage },
    twitterCard, rssLink, hasFaq, statsMatches,
    internalLinks: [...new Set(internalLinks)].slice(0, 20),
    externalLinks: [...new Set(externalLinks)].slice(0, 20),
  }
}

// ─── Robots analysis — distingue bots de citación vs entrenamiento ────────────

function analyzeRobots(robotsTxt) {
  // IMPORTANTE: la distinción entre tipos cambia el impacto GEO:
  // - 'citation': bloquearlos REDUCE directamente las citas en IA (crítico)
  // - 'broad':    bloquearlos reduce visibilidad en AI Overviews (importante)
  // - 'training': bloquearlos es aceptable, no afecta citas directas
  const AI_CRAWLERS = [
    // Bots de CITACIÓN (bloquear = malo para GEO)
    { name: 'OAI-SearchBot',      type: 'citation', platform: 'ChatGPT' },
    { name: 'ClaudeBot',          type: 'citation', platform: 'Claude' },
    { name: 'Claude-SearchBot',   type: 'citation', platform: 'Claude' },
    { name: 'PerplexityBot',      type: 'citation', platform: 'Perplexity' },
    { name: 'Googlebot',          type: 'citation', platform: 'Google AI Overviews' },
    { name: 'Google-Extended',    type: 'citation', platform: 'Google AI Overviews' },
    { name: 'Applebot',           type: 'citation', platform: 'Apple Intelligence' },
    { name: 'Applebot-Extended',  type: 'citation', platform: 'Apple Intelligence' },
    { name: 'bingbot',            type: 'citation', platform: 'Bing Copilot' },
    { name: 'DuckAssistBot',      type: 'citation', platform: 'DuckDuckGo AI' },
    { name: 'YouBot',             type: 'citation', platform: 'You.com' },
    { name: 'Diffbot',            type: 'citation', platform: 'Diffbot / LLM feeds' },
    // Bots de ENTRENAMIENTO (bloquear = aceptable, no afecta citas directas)
    { name: 'GPTBot',             type: 'training', platform: 'OpenAI training' },
    { name: 'anthropic-ai',       type: 'training', platform: 'Anthropic training' },
    { name: 'cohere-ai',          type: 'training', platform: 'Cohere training' },
    { name: 'CCBot',              type: 'training', platform: 'Common Crawl' },
    { name: 'FacebookBot',        type: 'training', platform: 'Meta training' },
    { name: 'omgili',             type: 'training', platform: 'Omgili' },
    { name: 'Bytespider',         type: 'training', platform: 'TikTok/ByteDance' },
    { name: 'ImagesiftBot',       type: 'training', platform: 'Imagesift' },
    { name: 'ChatGPT-User',       type: 'training', platform: 'ChatGPT browsing' },
    // Bots de DESCUBRIMIENTO AMPLIO
    { name: 'ia_archiver',        type: 'broad', platform: 'Alexa/Wayback' },
    { name: 'Timpibot',           type: 'broad', platform: 'Timpi' },
  ]

  const lines = robotsTxt.toLowerCase().split('\n')

  function isCrawlerBlocked(name) {
    const nameL = name.toLowerCase()
    const userAgentIdx = lines.findIndex(l => l.trim() === `user-agent: ${nameL}`)
    const wildcardIdx  = lines.findIndex(l => l.trim() === 'user-agent: *')

    if (userAgentIdx !== -1) {
      // Collect all lines until the next user-agent block or end of file
      const block = []
      for (let i = userAgentIdx + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('user-agent:')) break
        block.push(lines[i].trim())
      }
      return block.some(l => l === 'disallow: /')
    }
    if (wildcardIdx !== -1) {
      // Specific bot rule anywhere in file takes precedence over wildcard
      const hasExplicitRule = lines.some(l => l.trim() === `user-agent: ${nameL}`)
      if (hasExplicitRule) return false
      const block = []
      for (let i = wildcardIdx + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('user-agent:')) break
        block.push(lines[i].trim())
      }
      return block.some(l => l === 'disallow: /')
    }
    return false
  }

  const result = { hasRobotsTxt: robotsTxt.length > 0, citation: [], training: [], broad: [] }

  for (const crawler of AI_CRAWLERS) {
    const blocked = isCrawlerBlocked(crawler.name)
    result[crawler.type].push({ ...crawler, blocked })
  }

  return result
}

// ─── Claude analysis ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un experto en GEO (Generative Engine Optimization) — la práctica de optimizar sitios web para aparecer en respuestas de motores de búsqueda con IA como ChatGPT, Perplexity, Claude, Google AI Overviews y Bing Copilot.

Analizás el contenido de una página web y devolvés un análisis estructurado en JSON.

IMPORTANTE: Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown, sin bloques de código. Solo el objeto JSON.`

function buildPrompt(url, pageData, robotsData, llmsData, aiDiscovery) {
  const blockedCitation = robotsData.citation.filter(c => c.blocked)
  const blockedTraining = robotsData.training.filter(c => c.blocked)
  const allowedCitation = robotsData.citation.filter(c => !c.blocked)

  return `Analizá el siguiente sitio web para GEO y devolvé un JSON con este formato exacto:

{
  "score": <número 0-100, calculado como: round(citability*0.25 + brandAuthority*0.20 + eeat*0.20 + technical*0.15 + schema*0.10 + platforms*0.10)>,
  "components": {
    "citability": <0-100>,
    "brandAuthority": <0-100>,
    "eeat": <0-100>,
    "technical": <0-100>,
    "schema": <0-100>,
    "platforms": <0-100>
  },
  "items": [
    {
      "severity": "high" | "medium" | "low",
      "component": "citability" | "brandAuthority" | "eeat" | "technical" | "schema" | "platforms",
      "title": "<título corto del problema>",
      "description": "<qué está mal y por qué importa para GEO>",
      "action": "<acción concreta a tomar para resolverlo>",
      "impact": "<impacto esperado en visibilidad IA, usando los % de investigación si aplica>"
    }
  ],
  "negativeSignals": [
    {
      "title": "<señal negativa detectada>",
      "description": "<por qué reduce la citabilidad en IA>"
    }
  ]
}

═══════════════════════════════════════════════════════════
METODOLOGÍA GEO — INVESTIGACIÓN ACADÉMICA (Princeton KDD 2024)
Las siguientes técnicas tienen impacto medido en visibilidad IA:
• Citar fuentes externas con enlaces: +115% visibilidad
• Estadísticas con fechas (últimos 3 años): +40% visibilidad
• Citas de expertos con atribución: +30-40% visibilidad
• Estructura respuesta-primero (conclusión en primeras 150 palabras): +25%
• Párrafos autónomos de 50-150 palabras con datos concretos: +23%
• Secciones FAQ con respuestas directas: +20-30%
• Lenguaje fluido y natural (vs keyword stuffing): +15-20%

BANDAS DE SCORE:
• 86-100: Excelente — plenamente optimizado para citación IA
• 68-85: Bueno — bien optimizado con gaps menores
• 36-67: Base — visible pero faltan señales clave
• 0-35: Crítico — no puede ser citado de forma confiable

PESOS componentes: citability=25%, brandAuthority=20%, eeat=20%, technical=15%, schema=10%, platforms=10%
═══════════════════════════════════════════════════════════

⚠ IMPORTANTE — LIMITACIÓN DEL ANÁLISIS ESTÁTICO:
Este análisis se basa en el HTML estático de la página (sin ejecutar JavaScript). Por eso:
- Widgets de terceros (Google Reviews, Elfsight, Trustpilot, chats, mapas) aparecen como contenedores vacíos aunque funcionen perfectamente en el browser.
- Si detectás que una sección tiene un heading pero el contenido parece ausente, verificá si puede tratarse de un widget dinámico antes de marcarlo como señal negativa.
- NO reportes como "sección vacía" o "contenido faltante" lo que puede ser contenido dinámico. En su lugar, si corresponde, recomendá añadir markup estático Schema.org que sí sea rastreable por IA.

DATOS DEL SITIO:
URL: ${url}
${pageData.isNoindex ? '⛔ NOINDEX DETECTADO: la página tiene meta robots noindex — ningún motor de búsqueda ni IA puede indexarla ni citarla. Este es el hallazgo más crítico posible.' : ''}
${pageData.likelySPA ? '⚠ POSIBLE SPA/CSR: el HTML inicial tiene muy poco contenido (<150 palabras, sin H1, sin schemas). El sitio podría renderizarse con JavaScript en el cliente, lo que impide que los crawlers de IA lean el contenido real.' : ''}
${pageData.hasDynamicReviewWidget ? `⚠ WIDGETS DINÁMICOS DE RESEÑAS DETECTADOS: ${pageData.dynamicWidgets.join(', ')}. Estas reseñas son invisibles para crawlers de IA (y para este análisis estático). Aunque el sitio SÍ tiene reseñas, no son rastreables. La recomendación correcta es complementar con Schema.org Review/AggregateRating estático, NO reportar como "ausencia de testimonios".` : ''}

TÍTULO: ${pageData.title || '(sin título)'}
META DESCRIPCIÓN: ${pageData.description || '(sin meta descripción)'}
CANONICAL: ${pageData.canonical || '(no definido)'}
IDIOMA (lang attr): ${pageData.langAttr || '(no definido)'}
PALABRAS EN PÁGINA: ${pageData.wordCount}
ESTADÍSTICAS/DATOS detectados: ${pageData.statsMatches} ocurrencias
SECCIÓN FAQ: ${pageData.hasFaq ? 'presente' : 'no detectada'}
RSS/ATOM FEED: ${pageData.rssLink ? `presente (${pageData.rssLink})` : 'no detectado'}

AUTORÍA: ${pageData.hasAuthor ? 'detectada (rel=author / itemprop=author / clase byline)' : 'NO detectada — ausencia de autoría reduce score E-E-A-T'}
FECHAS DE PUBLICACIÓN: ${pageData.hasDates ? `detectadas${pageData.latestDate ? ` (más reciente: ${pageData.latestDate})` : ''}` : 'NO detectadas — sin fechas los LLMs no pueden validar frescura del contenido'}

H1: ${pageData.h1.join(' | ') || '(sin H1)'}
H2: ${pageData.h2.join(' | ') || '(ninguno)'}
H3: ${pageData.h3.join(' | ') || '(ninguno)'}

OPEN GRAPH: título="${pageData.og.title}", descripción="${pageData.og.description}", imagen="${pageData.og.image ? 'presente' : 'ausente'}"
TWITTER CARD: ${pageData.twitterCard || 'no configurado'}

CONTENIDO PRINCIPAL:
${pageData.bodyText}

SCHEMAS JSON-LD: ${pageData.schemas.length} detectados
Tipos presentes: ${pageData.schemaTypes.join(', ') || 'ninguno'}
Tipos GEO importantes ausentes: ${['Organization','WebSite','Article','FAQPage','BreadcrumbList'].filter(t => !pageData.schemaTypes.includes(t)).join(', ') || 'ninguno'}

═══ ACCESO DE CRAWLERS IA ═══
ROBOTS.TXT: ${robotsData.hasRobotsTxt ? 'presente' : 'NO encontrado (todos los bots permitidos por defecto)'}

⚠ BOTS DE CITACIÓN bloqueados (CRÍTICO — reducen citas directas en IA):
${blockedCitation.length ? blockedCitation.map(c => `  • ${c.name} (${c.platform})`).join('\n') : '  Ninguno bloqueado ✓'}

✓ BOTS DE CITACIÓN permitidos:
${allowedCitation.length ? allowedCitation.map(c => `  • ${c.name} (${c.platform})`).join('\n') : '  Ninguno permitido'}

BOTS DE ENTRENAMIENTO bloqueados (aceptable — no afecta citas directas):
${blockedTraining.length ? blockedTraining.map(c => `  • ${c.name}`).join('\n') : '  Ninguno bloqueado'}

═══ LLMS.TXT ═══
${llmsData.exists
  ? `PRESENTE ✓\nContenido:\n${llmsData.content}`
  : 'AUSENTE — llms.txt es el estándar emergente (llmstxt.org) para que los LLMs entiendan y citen el sitio. Su ausencia es un hallazgo de alta prioridad para el componente Plataformas IA.'}

═══ ENDPOINTS DE DESCUBRIMIENTO IA ═══
/.well-known/ai.txt: ${aiDiscovery.aiTxt?.exists ? 'presente ✓' : 'ausente'}
/ai/summary.json: ${aiDiscovery.aiSummary?.exists ? 'presente ✓' : 'ausente'}
/sitemap.xml: ${aiDiscovery.sitemap?.exists ? 'presente ✓' : 'ausente'}

LINKS INTERNOS: ${pageData.internalLinks.length} | EXTERNOS (citas): ${pageData.externalLinks.length}

═══ INSTRUCCIONES PARA EL ANÁLISIS ═══
Incluí entre 5 y 10 items priorizados por impacto GEO real, ordenados de mayor a menor severidad.
Cada item debe combinar el problema con la acción concreta y el impacto esperado (usá los % de la investigación donde aplique).
En negativeSignals, detectá señales que REDUCEN citabilidad: lenguaje excesivamente autopromocional, contenido escaso (<300 palabras), keyword stuffing, texto oculto, ausencia de autoría, fechas desactualizadas.
NUNCA reportes como señal negativa contenido que podría ser un widget dinámico (reseñas, mapas, chat). Si hay widgets de reseñas dinámicos detectados, reportalos como oportunidad de mejora GEO (agregar Schema.org AggregateRating/Review estático), no como "sección vacía" o "ausencia de testimonios".
Si no detectás señales negativas, devolvé negativeSignals: [].`
}

// ─── Main analysis function ───────────────────────────────────────────────────

async function setStep(auditId, step) {
  await prisma.geoAudit.update({
    where: { id: auditId },
    data:  { errorMsg: step },
  }).catch(err => console.error('[GeoAudit] Error al actualizar paso:', err.message))
}

async function runGeoAnalysis(auditId, workspaceId, projectId, url, userId) {
  try {
    // 1. Mark as running
    await prisma.geoAudit.update({
      where: { id: auditId },
      data:  { status: 'running', errorMsg: 'Conectando con el sitio…' },
    })

    // Verificar presupuesto mensual antes de llamar a Claude
    const { hasTokenBudget } = require('../lib/tokenBudget')
    if (!(await hasTokenBudget(workspaceId))) {
      await prisma.geoAudit.update({ where: { id: auditId }, data: { status: 'error', errorMsg: 'Límite mensual de tokens de IA alcanzado.' } })
      return
    }

    // 2. Fetch todo en paralelo
    await assertPublicUrl(url)
    const origin = new URL(url).origin
    const [html, robotsTxt, llmsData, aiDiscovery] = await Promise.all([
      fetchPage(url),
      fetchRobotsTxt(origin),
      fetchLlmsTxt(origin),
      fetchAiDiscovery(origin),
    ])

    // 3. Extract structured data
    await setStep(auditId, 'Extrayendo contenido y estructura…')
    const pageData   = extractPageData(html, url)
    const robotsData = analyzeRobots(robotsTxt)

    // 4. Call Claude
    await setStep(auditId, 'Analizando con IA (esto puede tardar unos segundos)…')
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: buildPrompt(url, pageData, robotsData, llmsData, aiDiscovery) }],
    })

    // 5. Log tokens
    await logTokens('geoAudit', userId, message.usage, workspaceId)

    // 6. Parse response — strip markdown fences si Claude los agrega
    const raw = message.content[0].text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
    const result = JSON.parse(raw)

    const { score, components, items, negativeSignals } = result

    // Enrich rawData with page metadata needed for schema generation
    const IMPORTANT_SCHEMA_TYPES = ['Organization', 'WebSite', 'Article', 'FAQPage', 'BreadcrumbList', 'LocalBusiness', 'Product']
    const schemasPresent = pageData.schemaTypes ?? []
    const schemasMissing = IMPORTANT_SCHEMA_TYPES.filter(t => !schemasPresent.includes(t))
    const enrichedRaw = JSON.stringify({
      ...result,
      schemasPresent,
      schemasMissing,
      meta: { title: pageData.title, description: pageData.description, h2: pageData.h2 },
    })

    // 7. Save completed result
    await setStep(auditId, 'Guardando resultados…')
    await prisma.geoAudit.update({
      where: { id: auditId },
      data: {
        status:          'completed',
        score:           Number(score),
        citability:      Number(components.citability),
        brandAuthority:  Number(components.brandAuthority),
        eeat:            Number(components.eeat),
        technical:       Number(components.technical),
        schema:          Number(components.schema),
        platforms:       Number(components.platforms),
        findings:        JSON.stringify(items ?? []),
        recommendations: JSON.stringify(negativeSignals ?? []),
        rawData:         enrichedRaw,
        tokensUsed:      (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0),
        errorMsg:        null,
      },
    })
  } catch (err) {
    console.error(`[geoAudit] Error en audit ${auditId}:`, err.message)
    await prisma.geoAudit.update({
      where: { id: auditId },
      data: {
        status:   'failed',
        errorMsg: err.message?.slice(0, 500) ?? 'Error desconocido',
      },
    }).catch(e => console.error('[GeoAudit] Error al marcar audit como fallido:', e.message))
  }
}

// ─── Cron: audit mensual automático ───────────────────────────────────────────

/**
 * Ejecutado el 1° de cada mes: corre un GeoAudit para todos los proyectos
 * que tienen websiteUrl configurada.
 */
async function runAllMonthlyGeoAudits() {
  const { enabledWorkspaceIds } = require('../lib/featureFlags')
  const enabled = await enabledWorkspaceIds('marketing')
  const projects = enabled.size === 0 ? [] : await prisma.project.findMany({
    where:  { websiteUrl: { not: null }, workspaceId: { in: [...enabled] } },
    select: { id: true, workspaceId: true, websiteUrl: true },
  })

  console.log(`[GeoAudit] Iniciando audit mensual para ${projects.length} proyecto(s)...`)
  let done = 0

  for (const project of projects) {
    try {
      const raw = /^https?:\/\//i.test(project.websiteUrl)
        ? project.websiteUrl
        : 'https://' + project.websiteUrl
      let url
      try { url = new URL(raw).href } catch { continue }

      const audit = await prisma.geoAudit.create({
        data: {
          workspaceId: project.workspaceId,
          projectId:   project.id,
          url,
          status: 'running',
        },
      })

      // Llamada directa (con await) en lugar de setImmediate — el cron espera
      await runGeoAnalysis(audit.id, project.workspaceId, project.id, url, null)
      done++
    } catch (err) {
      console.error(`[GeoAudit] Error en proyecto ${project.id}:`, err.message)
    }
  }

  console.log(`[GeoAudit] ${done}/${projects.length} audits completados.`)
}

module.exports = { runGeoAnalysis, runAllMonthlyGeoAudits }
