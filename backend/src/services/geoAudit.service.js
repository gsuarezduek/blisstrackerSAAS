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

function extractPageData(html, url) {
  const $ = cheerio.load(html)
  const origin = new URL(url).origin

  // Metadata
  const title       = $('title').first().text().trim()
  const description = $('meta[name="description"]').attr('content') ?? ''
  const canonical   = $('link[rel="canonical"]').attr('href') ?? ''

  // Headings
  const h1 = $('h1').map((_, el) => $(el).text().trim()).get()
  const h2 = $('h2').map((_, el) => $(el).text().trim()).get().slice(0, 10)
  const h3 = $('h3').map((_, el) => $(el).text().trim()).get().slice(0, 10)

  // Main text content (remove scripts/styles/nav/footer)
  $('script, style, nav, footer, header, aside, noscript').remove()
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000)

  // JSON-LD schemas
  const schemas = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try { schemas.push(JSON.parse($(el).html())) } catch {}
  })

  // Open Graph / Twitter
  const ogTitle       = $('meta[property="og:title"]').attr('content') ?? ''
  const ogDescription = $('meta[property="og:description"]').attr('content') ?? ''
  const ogImage       = $('meta[property="og:image"]').attr('content') ?? ''
  const twitterCard   = $('meta[name="twitter:card"]').attr('content') ?? ''

  // Links
  const internalLinks = []
  const externalLinks = []
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
    title, description, canonical,
    h1, h2, h3, bodyText,
    schemas,
    og: { title: ogTitle, description: ogDescription, image: ogImage },
    twitterCard,
    internalLinks: [...new Set(internalLinks)].slice(0, 20),
    externalLinks: [...new Set(externalLinks)].slice(0, 20),
  }
}

function analyzeRobots(robotsTxt) {
  const AI_CRAWLERS = [
    { name: 'GPTBot',        tier: 'critical' },
    { name: 'OAI-SearchBot', tier: 'critical' },
    { name: 'ClaudeBot',     tier: 'critical' },
    { name: 'PerplexityBot', tier: 'critical' },
    { name: 'Google-Extended', tier: 'broad' },
    { name: 'Applebot-Extended', tier: 'broad' },
    { name: 'anthropic-ai',  tier: 'training' },
    { name: 'cohere-ai',     tier: 'training' },
  ]

  const lines = robotsTxt.toLowerCase().split('\n')
  const blocked = []
  const allowed = []

  for (const crawler of AI_CRAWLERS) {
    const name = crawler.name.toLowerCase()
    const isBlocked = lines.some(l => l.includes(`user-agent: ${name}`) || l.includes(`user-agent: *`))
      && lines.some(l => l.trim() === 'disallow: /')
    // Simple heuristic: look for explicit disallow after the crawler's user-agent block
    const userAgentIdx = lines.findIndex(l => l.includes(`user-agent: ${name}`))
    const wildcardIdx  = lines.findIndex(l => l.trim() === 'user-agent: *')

    let crawlerBlocked = false
    if (userAgentIdx !== -1) {
      const block = lines.slice(userAgentIdx, userAgentIdx + 5)
      crawlerBlocked = block.some(l => l.trim() === 'disallow: /')
    } else if (wildcardIdx !== -1) {
      const block = lines.slice(wildcardIdx, wildcardIdx + 5)
      crawlerBlocked = block.some(l => l.trim() === 'disallow: /')
    }

    if (crawlerBlocked) blocked.push({ ...crawler, blocked: true })
    else allowed.push({ ...crawler, blocked: false })
  }

  return { blocked, allowed, hasRobotsTxt: robotsTxt.length > 0 }
}

// ─── Claude analysis ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un experto en GEO (Generative Engine Optimization) — la práctica de optimizar sitios web para aparecer en respuestas de motores de búsqueda con IA como ChatGPT, Perplexity, Claude, Google AI Overviews y Bing Copilot.

Analizás el contenido de una página web y devolvés un análisis estructurado en JSON.

IMPORTANTE: Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown, sin bloques de código. Solo el objeto JSON.`

function buildPrompt(url, pageData, robotsData) {
  return `Analizá el siguiente sitio web para GEO y devolvé un JSON con este formato exacto:

{
  "score": <número 0-100, promedio ponderado de los 6 componentes>,
  "components": {
    "citability": <0-100, qué tan citable es el contenido para IAs>,
    "brandAuthority": <0-100, señales de autoridad de marca>,
    "eeat": <0-100, Experience/Expertise/Authoritativeness/Trustworthiness>,
    "technical": <0-100, fundamentos técnicos: robots.txt, velocidad, estructura>,
    "schema": <0-100, marcado estructurado JSON-LD>,
    "platforms": <0-100, preparación para plataformas IA específicas>
  },
  "findings": [
    {
      "severity": "high" | "medium" | "low",
      "component": "citability" | "brandAuthority" | "eeat" | "technical" | "schema" | "platforms",
      "title": "<título corto del problema>",
      "description": "<descripción concreta de qué está mal y por qué importa para GEO>"
    }
  ],
  "recommendations": [
    {
      "priority": "high" | "medium" | "low",
      "action": "<acción concreta y específica a tomar>",
      "impact": "<qué mejora conseguiría esta acción en términos de visibilidad IA>"
    }
  ]
}

DATOS DEL SITIO:
URL: ${url}

TÍTULO: ${pageData.title}
META DESCRIPCIÓN: ${pageData.description}
CANONICAL: ${pageData.canonical}

H1: ${pageData.h1.join(' | ')}
H2: ${pageData.h2.join(' | ')}
H3: ${pageData.h3.join(' | ')}

OPEN GRAPH: título="${pageData.og.title}", descripción="${pageData.og.description}", imagen="${pageData.og.image}"
TWITTER CARD: ${pageData.twitterCard}

CONTENIDO PRINCIPAL:
${pageData.bodyText}

SCHEMAS JSON-LD detectados: ${pageData.schemas.length} schemas — tipos: ${pageData.schemas.map(s => s['@type']).filter(Boolean).join(', ') || 'ninguno'}

ROBOTS.TXT: ${robotsData.hasRobotsTxt ? 'presente' : 'no encontrado'}
Crawlers IA bloqueados (${robotsData.blocked.length}): ${robotsData.blocked.map(c => c.name).join(', ') || 'ninguno'}
Crawlers IA permitidos (${robotsData.allowed.length}): ${robotsData.allowed.map(c => c.name).join(', ')}

LINKS INTERNOS: ${pageData.internalLinks.length} | EXTERNOS: ${pageData.externalLinks.length}

PESOS para el score global (citability=25%, brandAuthority=20%, eeat=20%, technical=15%, schema=10%, platforms=10%)

Incluí entre 3 y 8 findings priorizados por impacto real en GEO, y entre 3 y 6 recomendaciones concretas.`
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

    // 2. Fetch page + robots.txt in parallel
    const origin = new URL(url).origin
    const [html, robotsTxt] = await Promise.all([
      fetchPage(url),
      fetchRobotsTxt(origin),
    ])

    // 3. Extract structured data
    await setStep(auditId, 'Extrayendo contenido y estructura…')
    const pageData   = extractPageData(html, url)
    const robotsData = analyzeRobots(robotsTxt)

    // 4. Call Claude
    await setStep(auditId, 'Analizando con IA (esto puede tardar unos segundos)…')
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: buildPrompt(url, pageData, robotsData) }],
    })

    // 5. Log tokens
    await logTokens('geoAudit', userId, message.usage, workspaceId)

    // 6. Parse response — strip markdown fences if Claude los agrega
    const raw = message.content[0].text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
    const result = JSON.parse(raw)

    const { score, components, findings, recommendations } = result

    // 7. Save completed result
    await setStep(auditId, 'Guardando resultados…')
    await prisma.geoAudit.update({
      where: { id: auditId },
      data: {
        status:         'completed',
        score:          Number(score),
        citability:     Number(components.citability),
        brandAuthority: Number(components.brandAuthority),
        eeat:           Number(components.eeat),
        technical:      Number(components.technical),
        schema:         Number(components.schema),
        platforms:      Number(components.platforms),
        findings:       JSON.stringify(findings ?? []),
        recommendations: JSON.stringify(recommendations ?? []),
        rawData:        raw,
        tokensUsed:     (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0),
        errorMsg:       null,
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
