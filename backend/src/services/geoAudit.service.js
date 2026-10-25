const cheerio   = require('cheerio')
const prisma    = require('../lib/prisma')
const { logTokens } = require('../lib/logTokens')
const { assertPublicUrl, fetchPublicUrl } = require('../lib/safeUrl')
const { normalizeInternal, crawlSite } = require('../lib/siteCrawler')
const { parseLooseJson } = require('../lib/jsonRepair')

const { anthropic } = require('../lib/claude')

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const res = await fetchPublicUrl(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'BlissTrackerBot/1.0 (+https://blisstracker.app)' },
  })
  return res.data
}

async function fetchRobotsTxt(origin) {
  try {
    const res = await fetchPublicUrl(`${origin}/robots.txt`, { timeout: 8000 })
    return res.data
  } catch { return '' }
}

async function fetchLlmsTxt(origin) {
  try {
    const res = await fetchPublicUrl(`${origin}/llms.txt`, { timeout: 8000 })
    return { exists: true, content: res.data?.slice(0, 3000) ?? '' }
  } catch { return { exists: false, content: '' } }
}

// Nota (metodología v2, 2026): se dejó de chequear /.well-known/ai.txt y
// /ai/summary.json — no son estándares adoptados por nadie (ninguna IA los lee),
// a diferencia de /sitemap.xml que sí es real y relevante para crawl discovery.
async function fetchAiDiscovery(origin) {
  try {
    const res = await fetchPublicUrl(`${origin}/sitemap.xml`, { timeout: 6000 })
    return { sitemap: { exists: true, status: res.status } }
  } catch {
    return { sitemap: { exists: false } }
  }
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

// ─── Multi-página (#4/#9) — home + páginas donde suele vivir el NAP ───────────
// Un BFS genérico no garantiza tocar "Contacto" dentro de pocas páginas (el home
// casi nunca tiene NAP), así que se priorizan patrones de URL típicos por sobre el
// orden de descubrimiento.
const NAP_PAGE_PATTERN = /\/(contact|contacto|about|about-us|sobre-nosotros|nosotros|quienes-somos|ubicacion|location|donde-estamos)\/?$/i

// A partir de los internalLinks ya extraídos del home, devuelve hasta `max` URLs
// candidatas para crawlear, con las que matchean patrones de NAP primero.
function pickExtraSeeds(homeInternalLinks, seedUrl, origin, max) {
  const normalized = homeInternalLinks
    .map(u => normalizeInternal(u, seedUrl, origin))
    .filter(Boolean)
  const priority = normalized.filter(u => NAP_PAGE_PATTERN.test(new URL(u).pathname))
  const rest     = normalized.filter(u => !priority.includes(u))
  return [...new Set([...priority, ...rest])].slice(0, max)
}

// Extrae name/telephone/address de los schemas Organization/LocalBusiness de cada
// página crawleada — texto crudo, sin normalizar: dejamos que la propia IA juzgue
// consistencia (comparar direcciones a mano es frágil, "Av. Corrientes 1234" vs
// "Avenida Corrientes 1234, CABA" son el mismo lugar escrito distinto).
function extractNapSignals(pages) {
  const rows = []
  for (const p of pages) {
    if (p.error) continue
    for (const s of p.schemas ?? []) {
      const types = Array.isArray(s['@type']) ? s['@type'] : [s['@type']]
      if (!types.includes('Organization') && !types.includes('LocalBusiness')) continue
      const addr = s.address
      rows.push({
        url:       p.url,
        name:      s.name ?? null,
        telephone: s.telephone ?? null,
        address:   typeof addr === 'string'
          ? addr
          : addr ? [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter(Boolean).join(', ') : null,
      })
    }
  }
  return rows
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

// ─── Contexto de la corrida anterior — qué recomendaciones ya tienen tarea ───

const STATUS_LABELS = {
  COMPLETED:   '[RESUELTA]',
  IN_PROGRESS: '[EN CURSO]',
  PAUSED:      '[EN CURSO]',
  BLOCKED:     '[EN CURSO]',
  PENDING:     '[PENDIENTE — ya asignada a una tarea]',
}

async function buildPreviousRunContext(projectId, workspaceId, currentAuditId) {
  const prevAudit = await prisma.geoAudit.findFirst({
    where:   { projectId, workspaceId, status: 'completed', id: { not: currentAuditId } },
    orderBy: { createdAt: 'desc' },
    select:  { id: true, createdAt: true, findings: true },
  })
  if (!prevAudit) return ''

  const prevItems = JSON.parse(prevAudit.findings || '[]')
  if (!prevItems.length) return ''

  const links = await prisma.geoFindingTask.findMany({
    where:   { auditId: prevAudit.id, kind: 'finding' },
    include: { task: { select: { status: true } } },
  })
  const statusByIndex = new Map(links.map(l => [l.itemIndex, l.task.status]))

  const lines = prevItems.map((item, idx) => {
    const label = STATUS_LABELS[statusByIndex.get(idx)] ?? '[PENDIENTE — sin tarea creada]'
    return `${label} ${item.title}${item.action ? ` — Acción sugerida entonces: ${item.action}` : ''}`
  }).join('\n')

  const dateStr = prevAudit.createdAt.toISOString().slice(0, 10)

  return `

═══════════════════════════════════════════════════════════
CONTEXTO: RECOMENDACIONES DEL ANÁLISIS ANTERIOR (${dateStr})
Estas son las recomendaciones de la corrida previa de este mismo sitio, con su estado
actual según el seguimiento de tareas del equipo (RESUELTA = la tarea se completó,
EN CURSO = hay una tarea en progreso/pausada/bloqueada, PENDIENTE = sin avance real):

${lines}

REGLAS para usar este contexto:
- Si un hallazgo marcado [RESUELTA] o [EN CURSO] sigue sin corregirse en el HTML actual,
  NO lo repitas como item nuevo igual a como estaba: reportalo como regresión o seguimiento
  dentro de su descripción, dejando explícito que ya hay (o hubo) una tarea asociada.
- Si un hallazgo marcado [RESUELTA] o [EN CURSO] efectivamente ya no está presente en el
  sitio, no lo incluyas en "items" de esta corrida.
- Los marcados [PENDIENTE — sin tarea creada] podés repetirlos como item nuevo si siguen
  vigentes (nadie tomó acción todavía).
- Los marcados [PENDIENTE — ya asignada a una tarea] no los repitas como item nuevo salvo
  que el problema haya empeorado significativamente.
═══════════════════════════════════════════════════════════`
}

// ─── Claude analysis ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un experto en GEO (Generative Engine Optimization) — la práctica de optimizar sitios web para aparecer en respuestas de motores de búsqueda con IA como ChatGPT, Perplexity, Claude, Google AI Overviews y Bing Copilot.

Analizás el contenido de una página web y devolvés un análisis estructurado en JSON.

IMPORTANTE: Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown, sin bloques de código. Solo el objeto JSON. El JSON debe ser estrictamente válido: sin comas colgantes antes de "}" o "]", con las comillas internas de los strings escapadas (\\"), y sin saltos de línea literales dentro de un string (usá \\n si hace falta).`

function buildPrompt(url, pageData, robotsData, llmsData, aiDiscovery, previousRunContext = '', project = null, extraPages = [], napRows = []) {
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
      "impact": "<impacto esperado en visibilidad IA, en términos cualitativos (alto/medio/bajo + por qué) — no inventes porcentajes específicos, son señales probabilísticas, no mediciones garantizadas>"
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
METODOLOGÍA GEO (v2, actualizada 2026) — basada en investigación académica (Princeton KDD
2024) + evidencia de comportamiento real de crawlers/motores de IA relevada en 2026.
Las siguientes técnicas tienen asociación medida con mayor visibilidad en IA — son SEÑALES
CON EVIDENCIA, no garantías: un sitio puede aplicarlas todas y aun así no ser citado (depende
también de la competencia, la pregunta exacta del usuario, y señales externas al sitio que
este análisis no puede medir). Comunicá los items como oportunidades de mejora probables, no
como promesas de resultado.
• Citar fuentes externas de autoridad con enlaces: asociado a mayor visibilidad
• Estadísticas con fechas recientes (últimos 1-2 años): asociado a mayor visibilidad
• Citas de expertos con atribución clara: asociado a mayor visibilidad
• Estructura respuesta-primero (conclusión en las primeras 150 palabras): asociado a mayor visibilidad
• Párrafos autónomos de 50-150 palabras con datos concretos: asociado a mayor visibilidad
• Secciones FAQ con respuestas directas: asociado a mayor visibilidad
• Lenguaje fluido y natural (vs keyword stuffing): asociado a mayor visibilidad
• IMPORTANTE (hallazgo 2026): la mayoría de las citas de IA en la práctica vienen de fuentes
  DE TERCEROS (prensa, reviews, directorios), no del sitio propio — por eso señales externas
  como el Domain Rating (ver más abajo si está disponible) pesan en brandAuthority tanto o más
  que el contenido on-page de esta sola página.
• IMPORTANTE (hallazgo 2026): llms.txt y endpoints no-estándar (/.well-known/ai.txt,
  /ai/summary.json) tienen evidencia de que los crawlers de IA reales casi nunca los leen — no
  los trates como palancas de alto impacto.

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

═══ AUTORIDAD EXTERNA (fuente de terceros, no el HTML de esta página) ═══
${project?.domainRating != null
  ? `Domain Rating (Ahrefs, fuerza del perfil de backlinks del dominio): ${Math.round(project.domainRating)}/100. Usalo como señal de ENTRADA para el componente brandAuthority (no es on-page): un DR alto es evidencia real de autoridad externa aunque el HTML de esta página no la muestre; un DR bajo o ausente no es automáticamente un hallazgo negativo, pero sí limita cuánto puede subir brandAuthority solo con señales on-page.`
  : 'Domain Rating (Ahrefs) no disponible para este proyecto — no penalices brandAuthority por esta ausencia, simplemente basate en las señales on-page de esta página para ese componente.'}

TÍTULO: ${pageData.title || '(sin título)'}
META DESCRIPCIÓN: ${pageData.description || '(sin meta descripción)'}
CANONICAL: ${pageData.canonical || '(no definido)'}
IDIOMA (lang attr): ${pageData.langAttr || '(no definido)'}
PALABRAS EN PÁGINA: ${pageData.wordCount}
ESTADÍSTICAS/DATOS detectados: ${pageData.statsMatches} ocurrencias
SECCIÓN FAQ: ${pageData.hasFaq ? 'presente' : 'no detectada'}
RSS/ATOM FEED: ${pageData.rssLink ? `presente (${pageData.rssLink})` : 'no detectado'}

AUTORÍA: ${pageData.hasAuthor ? 'detectada (rel=author / itemprop=author / clase byline)' : 'NO detectada — ausencia de autoría reduce score E-E-A-T'}
FECHA DE HOY (para evaluar frescura real, no solo presencia/ausencia): ${new Date().toISOString().slice(0, 10)}
FECHAS DE PUBLICACIÓN: ${pageData.hasDates ? `detectadas${pageData.latestDate ? ` (fecha más reciente encontrada en la página: "${pageData.latestDate}" — calculá vos la antigüedad real contra la fecha de hoy de arriba; si tiene más de 12-18 meses, es una señal de contenido desactualizado aunque "tenga fecha")` : ', sin una fecha específica legible'}` : 'NO detectadas — sin fechas los LLMs no pueden validar frescura del contenido'}

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
  : 'AUSENTE — llms.txt es un estándar PROPUESTO (llmstxt.org), pero evidencia de 2026 confirma que los crawlers de IA reales (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot) casi nunca lo leen: en una medición de 500M+ visitas de bots de IA, solo 408 pidieron ese archivo. NO lo reportes como hallazgo de alta prioridad ni como algo que mueva mucho el componente platforms — a lo sumo, si platforms queda con pocos hallazgos, mencionalo como mejora menor y de bajo esfuerzo (no "crítico" ni "alto impacto").'}

═══ DESCUBRIMIENTO/CRAWL (sitemap) ═══
/sitemap.xml: ${aiDiscovery.sitemap?.exists ? 'presente ✓' : 'ausente — afecta descubrimiento normal de páginas, es relevante para technical, no es una señal GEO específica de IA'}

LINKS INTERNOS: ${pageData.internalLinks.length}
LINKS EXTERNOS (citas) — ${pageData.externalLinks.length} en total, muestra de hasta 10:
${pageData.externalLinks.length ? pageData.externalLinks.slice(0, 10).map(u => `  • ${u}`).join('\n') : '  (ninguno)'}
No te limites a contar estos links: evaluá si citan FUENTES DE AUTORIDAD (medios reconocidos, instituciones, papers, sitios .gov/.edu, players grandes y reconocidos del rubro) — eso es lo que la investigación confirma que aumenta citabilidad, no la cantidad cruda de links salientes. Enlazar solo a redes sociales propias, proveedores de plantillas/temas, o sitios de bajo valor no cuenta como "citar fuentes".

${extraPages.length ? `═══ OTRAS PÁGINAS DEL SITIO (además del home de arriba) ═══
Se rastrearon ${extraPages.length} página(s) más, priorizando las que suelen tener datos de contacto/empresa:
${extraPages.map(p => p.error
  ? `  • ${p.url} — no se pudo cargar (HTTP ${p.status || '?'})`
  : `  • ${p.url} — título: "${p.title || '(sin título)'}" | ${p.wordCount} palabras | schemas: ${p.schemaTypes.join(', ') || 'ninguno'}${p.isNoindex ? ' | ⛔ NOINDEX' : ''}`
).join('\n')}

CONSISTENCIA DE ENTIDAD (NAP — nombre/dirección/teléfono, schema Organization/LocalBusiness) encontrada en el home + estas páginas:
${napRows.length
  ? napRows.map(r => `  • ${r.url} → nombre: "${r.name ?? '(sin dato)'}" | teléfono: "${r.telephone ?? '(sin dato)'}" | dirección: "${r.address ?? '(sin dato)'}"`).join('\n')
  : '  Ningún schema Organization/LocalBusiness con estos datos encontrado en ninguna de las páginas rastreadas.'}
Si hay más de una fila y los datos difieren entre páginas (nombre, teléfono o dirección distintos, más allá de formato), reportalo como hallazgo de inconsistencia de entidad (afecta eeat/brandAuthority) — pero si son el mismo dato escrito distinto (ej. "Av. Corrientes 1234" vs "Avenida Corrientes 1234, CABA"), NO lo reportes como inconsistencia.
` : ''}
${previousRunContext}

═══ INSTRUCCIONES PARA EL ANÁLISIS ═══
Incluí entre 5 y 10 items priorizados por impacto GEO real, ordenados de mayor a menor severidad.
Cada item debe combinar el problema con la acción concreta y el impacto esperado, en términos cualitativos — son señales con evidencia de asociación, no garantías de resultado, así que no inventes porcentajes exactos de mejora.
En negativeSignals, detectá señales que REDUCEN citabilidad: lenguaje excesivamente autopromocional, contenido escaso (<300 palabras), keyword stuffing, texto oculto, ausencia de autoría, fechas desactualizadas.
NUNCA reportes como señal negativa contenido que podría ser un widget dinámico (reseñas, mapas, chat). Si hay widgets de reseñas dinámicos detectados, reportalos como oportunidad de mejora GEO (agregar Schema.org AggregateRating/Review estático), no como "sección vacía" o "ausencia de testimonios".
Si no detectás señales negativas, devolvé negativeSignals: [].`
}

// ─── Parseo tolerante de la respuesta de la IA ────────────────────────────────
// Los LLM a veces devuelven JSON casi válido con errores típicos (coma colgante
// antes de "}"/"]"). Antes de rendirse, se intenta sanear eso antes de parsear.

const parseAuditResult = parseLooseJson

// ─── Main analysis function ───────────────────────────────────────────────────

async function setStep(auditId, step) {
  await prisma.geoAudit.update({
    where: { id: auditId },
    data:  { errorMsg: step },
  }).catch(err => console.error('[GeoAudit] Error al actualizar paso:', err.message))
}

async function runGeoAnalysis(auditId, workspaceId, projectId, url, userId, { maxExtraPages = 3 } = {}) {
  try {
    // 1. Mark as running
    await prisma.geoAudit.update({
      where: { id: auditId },
      data:  { status: 'running', errorMsg: 'Conectando con el sitio…' },
    })

    // Verificar presupuesto mensual antes de llamar a Claude
    const { hasTokenBudget } = require('../lib/tokenBudget')
    if (!(await hasTokenBudget(workspaceId))) {
      await prisma.geoAudit.update({ where: { id: auditId }, data: { status: 'failed', errorMsg: 'Límite mensual de tokens de IA alcanzado.' } })
      return
    }

    // 2. Fetch todo en paralelo
    await assertPublicUrl(url)
    const origin = new URL(url).origin
    const [html, robotsTxt, llmsData, aiDiscovery, project] = await Promise.all([
      fetchPage(url),
      fetchRobotsTxt(origin),
      fetchLlmsTxt(origin),
      fetchAiDiscovery(origin),
      prisma.project.findUnique({ where: { id: projectId }, select: { domainRating: true, domainRatingAt: true } }),
    ])

    // 3. Extract structured data
    await setStep(auditId, 'Extrayendo contenido y estructura…')
    const pageData   = extractPageData(html, url)
    const robotsData = analyzeRobots(robotsTxt)

    // 3b. Crawlear páginas extra (#4/#9) — home + hasta `maxExtraPages` priorizando
    // patrones de NAP (Contacto/Nosotros). Best-effort: un fallo acá no debe tirar
    // abajo todo el audit, el análisis sigue con solo el home si hace falta.
    let extraPages = []
    if (maxExtraPages > 0) {
      await setStep(auditId, 'Rastreando otras páginas del sitio…')
      try {
        const seeds = pickExtraSeeds(pageData.internalLinks, url, origin, maxExtraPages)
        if (seeds.length) {
          const crawled = await crawlSite({
            seedUrl:    seeds[0],
            extraSeeds: seeds.slice(1),
            maxPages:   seeds.length,
            extract:    extractPageData,
          })
          extraPages = crawled.filter(p => p.url !== url) // por si el home se coló entre los links
        }
      } catch (err) {
        console.error(`[GeoAudit] Crawl multi-página falló (audit ${auditId}), se sigue solo con el home:`, err.message)
      }
    }
    const napRows = extractNapSignals([{ ...pageData, url }, ...extraPages])

    // 4-6. Call Claude y parsear — si la IA devuelve JSON inválido (comas colgantes,
    // comillas sin escapar) se reintenta UNA vez antes de marcar el audit como fallido.
    await setStep(auditId, 'Analizando con IA (esto puede tardar unos segundos)…')
    const previousRunContext = await buildPreviousRunContext(projectId, workspaceId, auditId)
    const prompt = buildPrompt(url, pageData, robotsData, llmsData, aiDiscovery, previousRunContext, project, extraPages, napRows)

    // Suficiente para 5-10 items con descripción/acción/impacto + negativeSignals sin
    // truncar a mitad del JSON (4096 se quedaba corto y producía "Unexpected end of
    // JSON input" — JSON incompleto, no inválido; sanitizeTrailingCommas no lo arregla).
    const MAX_OUTPUT_TOKENS = 8192
    const MAX_ATTEMPTS = 2
    let result = null
    let totalTokens = 0
    let lastParseErr = null
    let lastTruncated = false
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const message = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: MAX_OUTPUT_TOKENS,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: prompt }],
      })
      await logTokens('geoAudit', userId, message.usage, workspaceId)
      totalTokens += (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0)
      lastTruncated = message.stop_reason === 'max_tokens'
      try {
        result = parseAuditResult(message.content[0].text)
        lastParseErr = null
        break
      } catch (err) {
        lastParseErr = err
        console.error(`[GeoAudit] JSON inválido de la IA (intento ${attempt}/${MAX_ATTEMPTS}) en audit ${auditId}${lastTruncated ? ' — respuesta TRUNCADA por max_tokens' : ''}: ${err.message}`)
        if (err.rawText) console.error(`[GeoAudit] Respuesta cruda (intento ${attempt}):`, err.rawText.slice(0, 2000))
      }
    }
    if (lastParseErr) {
      if (lastTruncated) lastParseErr.message = 'La respuesta de la IA se cortó por longitud antes de terminar. Probá analizar de nuevo.'
      throw lastParseErr
    }

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
      // v1 = metodología original (llms.txt/endpoints inventados como alta prioridad, % fijos
      // de Princeton KDD 2024); v2 = reponderada 2026 (ver METODOLOGÍA GEO en buildPrompt).
      // Permite explicar saltos de score entre corridas que no vienen de un cambio real del sitio.
      methodologyVersion: 2,
      // Multi-página (#4/#9): schemasPresent/schemasMissing de arriba siguen siendo SOLO del
      // home a propósito (generateLlmsTxt/generateSchemaOrg asumen esa página semilla) — esto
      // es aparte, el agregado de todas las páginas rastreadas.
      pagesCrawled: 1 + extraPages.length,
      schemasPresentAnyPage: [...new Set([...schemasPresent, ...extraPages.flatMap(p => p.schemaTypes ?? [])])],
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
        tokensUsed:      totalTokens,
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

      // Llamada directa (con await) en lugar de setImmediate — el cron espera.
      // maxExtraPages más chico que el default on-demand (3): esto corre secuencial,
      // primero en MONTHLY_CHAIN, con una sola ventana de 6hs compartida con otros 15
      // jobs — cada página extra por proyecto suma tiempo a esa cadena completa.
      await runGeoAnalysis(audit.id, project.workspaceId, project.id, url, null, { maxExtraPages: 1 })
      done++
    } catch (err) {
      console.error(`[GeoAudit] Error en proyecto ${project.id}:`, err.message)
    }
  }

  console.log(`[GeoAudit] ${done}/${projects.length} audits completados.`)
}

module.exports = { runGeoAnalysis, runAllMonthlyGeoAudits }
