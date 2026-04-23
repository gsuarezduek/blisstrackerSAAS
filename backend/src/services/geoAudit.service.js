const axios     = require('axios')
const cheerio   = require('cheerio')
const Anthropic = require('@anthropic-ai/sdk')
const prisma    = require('../lib/prisma')
const { logTokens } = require('../lib/logTokens')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

  const h1 = $('h1').map((_, el) => $(el).text().trim()).get()
  const h2 = $('h2').map((_, el) => $(el).text().trim()).get().slice(0, 10)
  const h3 = $('h3').map((_, el) => $(el).text().trim()).get().slice(0, 10)

  // Word count before removing elements
  const wordCount = $('body').text().replace(/\s+/g, ' ').trim().split(' ').length

  $('script, style, nav, footer, header, aside, noscript').remove()
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 4000)

  // JSON-LD schemas
  const schemas = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try { schemas.push(JSON.parse($(el).html())) } catch {}
  })
  const schemaTypes = schemas.map(s => s['@type']).filter(Boolean)

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

  // Statistics detection (numbers with %, $, or followed by "mil"/"millones")
  const statsMatches = (bodyText.match(/\d+[\.,]?\d*\s*(%|€|\$|mil|millones|usuarios|clientes)/gi) ?? []).length

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
    h1, h2, h3, bodyText,
    schemas, schemaTypes,
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
      const block = lines.slice(userAgentIdx, userAgentIdx + 8)
      return block.some(l => l.trim() === 'disallow: /')
    }
    if (wildcardIdx !== -1) {
      // Wildcard only counts if no explicit Allow for this bot
      const hasExplicitAllow = lines.some((l, i) => {
        if (i < wildcardIdx) return false
        return l.includes(`user-agent: ${nameL}`)
      })
      if (hasExplicitAllow) return false
      const block = lines.slice(wildcardIdx, wildcardIdx + 8)
      return block.some(l => l.trim() === 'disallow: /')
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
  "score": <número 0-100, promedio ponderado de los 6 componentes>,
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

DATOS DEL SITIO:
URL: ${url}

TÍTULO: ${pageData.title || '(sin título)'}
META DESCRIPCIÓN: ${pageData.description || '(sin meta descripción)'}
CANONICAL: ${pageData.canonical || '(no definido)'}
IDIOMA (lang attr): ${pageData.langAttr || '(no definido)'}
PALABRAS EN PÁGINA: ${pageData.wordCount}
ESTADÍSTICAS/DATOS detectados: ${pageData.statsMatches} ocurrencias
SECCIÓN FAQ: ${pageData.hasFaq ? 'presente' : 'no detectada'}
RSS/ATOM FEED: ${pageData.rssLink ? `presente (${pageData.rssLink})` : 'no detectado'}

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
Si no detectás señales negativas, devolvé negativeSignals: [].`
}

// ─── Main analysis function ───────────────────────────────────────────────────

async function setStep(auditId, step) {
  await prisma.geoAudit.update({
    where: { id: auditId },
    data:  { errorMsg: step },
  }).catch(() => {})
}

async function runGeoAnalysis(auditId, workspaceId, projectId, url, userId) {
  try {
    // 1. Mark as running
    await prisma.geoAudit.update({
      where: { id: auditId },
      data:  { status: 'running', errorMsg: 'Conectando con el sitio…' },
    })

    // 2. Fetch todo en paralelo
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
        rawData:         raw,
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
    }).catch(() => {})
  }
}

module.exports = { runGeoAnalysis }
