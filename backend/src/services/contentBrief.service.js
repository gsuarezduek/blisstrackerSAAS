const prisma    = require('../lib/prisma')
const { parseAIJson } = require('../utils/parseAIJson')
const { logTokens }   = require('../lib/logTokens')
const { gscCountryToSerp, extractDomain, fetchSerpData, parseSerpResponse } = require('./serpApi.service')

const { anthropic } = require('../lib/claude')

// Etiquetas legibles de los campos del brief SEO/SEM que le interesan al prompt.
// (El catálogo de preguntas vive en el frontend; acá solo mapeamos lo que usamos.)
const SEO_LABELS = {
  objetivo:             'Objetivo en Google',
  zona_geografica:      'Zona geográfica',
  terminos:             'Términos con los que los buscarían',
  keywords_objetivo:    'Keywords objetivo (rankear sí o sí)',
  servicios_posicionar: 'Servicios/productos a posicionar',
  urls_prioritarias:    'Páginas prioritarias',
  blog:                 'Blog / capacidad de generar contenido',
  autor_experto:        'Autor/referente de la marca (E-E-A-T)',
  competidores:         'Competidores bien posicionados',
}

function briefLines(answers, labels) {
  if (!answers || typeof answers !== 'object') return ''
  const lines = []
  for (const [k, label] of Object.entries(labels)) {
    const v = answers[k]
    if (v && String(v).trim()) lines.push(`- ${label}: ${String(v).trim()}`)
  }
  return lines.join('\n')
}

// Vuelca los valores de un brief (sin conocer sus claves) truncado, para dar contexto de marca.
function briefDump(answers, maxChars = 1500) {
  if (!answers || typeof answers !== 'object') return ''
  const txt = Object.values(answers).filter(v => v && String(v).trim()).map(v => String(v).trim()).join(' · ')
  return txt.length > maxChars ? txt.slice(0, maxChars) + '…' : txt
}

/**
 * Genera un Content Brief de SEO para una keyword combinando:
 *  - datos del SERP actual (SerpAPI, best-effort — degrada si no hay SERP_API_KEY)
 *  - los briefs seo_sem + marca del proyecto (tono, público, servicios, autor)
 *  - Claude Haiku para armar la estructura del contenido
 * Persiste (upsert por projectId+keyword) y devuelve { id, keyword, content, createdAt }.
 */
async function generateContentBrief(projectId, workspaceId, keyword, userId) {
  const [project, briefs, gsc] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { name: true, websiteUrl: true } }),
    prisma.projectBrief.findMany({ where: { projectId, workspaceId, type: { in: ['seo_sem', 'marca'] } }, select: { type: true, answers: true } }),
    prisma.projectIntegration.findUnique({ where: { projectId_type: { projectId, type: 'google_search_console' } }, select: { country: true } }),
  ])
  if (!project) { const e = new Error('Proyecto no encontrado'); e.status = 404; throw e }

  const seoAnswers   = briefs.find(b => b.type === 'seo_sem')?.answers || {}
  const marcaAnswers = briefs.find(b => b.type === 'marca')?.answers   || {}

  // ── SERP (best-effort) ──
  let serp = null
  if (process.env.SERP_API_KEY) {
    try {
      const country = gscCountryToSerp(gsc?.country || 'arg')
      const domain  = project.websiteUrl ? extractDomain(project.websiteUrl) : null
      const raw     = await fetchSerpData(keyword, country)
      const parsed  = parseSerpResponse(raw, domain)
      serp = {
        peopleAlsoAsk:   parsed.peopleAlsoAsk.slice(0, 8),
        relatedSearches: parsed.relatedSearches.slice(0, 10),
        competitors:     parsed.competitors.slice(0, 8).map(c => ({ domain: c.domain, title: c.title })),
        features:        parsed.serpFeatures,
        position:        parsed.position,
      }
    } catch (err) {
      console.error('[ContentBrief] SERP no disponible:', err.message)
    }
  }

  // ── Contexto para el prompt ──
  const seoCtx   = briefLines(seoAnswers, SEO_LABELS)
  const marcaCtx = briefDump(marcaAnswers)
  const paaCtx   = serp?.peopleAlsoAsk?.length ? serp.peopleAlsoAsk.map(q => `  - ${q}`).join('\n') : '  (sin datos)'
  const relCtx   = serp?.relatedSearches?.length ? serp.relatedSearches.join(', ') : '(sin datos)'
  const compCtx  = serp?.competitors?.length
    ? serp.competitors.map(c => `  - ${c.domain}: ${c.title}`).join('\n')
    : '  (sin datos del SERP)'

  const prompt = `Sos un estratega de contenidos SEO senior. Tenés que armar un BRIEF DE CONTENIDO para que un redactor escriba una página/artículo que rankee en Google para la keyword objetivo, y que también sea citable por buscadores con IA (ChatGPT, Perplexity, Google AI Overviews).

KEYWORD OBJETIVO: "${keyword}"
PROYECTO: "${project.name}"${project.websiteUrl ? ` (${project.websiteUrl})` : ''}

CONTEXTO DEL CLIENTE (brief SEO/SEM):
${seoCtx || '  (sin brief SEO cargado)'}

CONTEXTO DE MARCA (tono, público, diferencial):
${marcaCtx || '  (sin brief de marca cargado)'}

SERP ACTUAL para la keyword:
Preguntas que la gente también hace (People Also Ask):
${paaCtx}
Búsquedas relacionadas: ${relCtx}
Contenido que hoy rankea en el top (competidores a superar):
${compCtx}

INSTRUCCIONES:
- Definí la intención de búsqueda real y a quién le hablamos (usá el público del brief de marca si está).
- Proponé un ángulo diferencial concreto para superar a lo que ya rankea (no un clon).
- Armá una estructura de encabezados (H2/H3) exhaustiva que cubra el tema mejor que los competidores e incluya las preguntas del PAA.
- Estimá una longitud objetivo en palabras acorde a la intención y a lo que rankea.
- Listá las entidades/subtemas/keywords semánticas que el texto debe mencionar (usá las búsquedas relacionadas).
- Incluí una nota E-E-A-T aprovechando el autor/referente del brief si existe (cómo demostrar experiencia y autoridad).
- Respondé en español rioplatense, tono profesional.

Respondé SOLO con un JSON válido, sin markdown ni texto adicional:
{
  "titulo": "H1 / título sugerido (con la keyword, atractivo)",
  "metaDescription": "meta description sugerida, máx 155 caracteres",
  "intencion": "informacional|comercial|transaccional|navegacional",
  "audiencia": "a quién le habla el contenido (1 oración)",
  "anguloDiferencial": "el ángulo para superar a lo que rankea (1-2 oraciones)",
  "longitudObjetivo": 1500,
  "estructura": [ { "h": 2, "titulo": "Encabezado", "nota": "qué cubrir en esta sección (1 oración)" } ],
  "preguntas": ["pregunta del PAA a responder explícitamente", "..."],
  "entidades": ["entidad/subtema/keyword semántica a incluir", "..."],
  "enlacesInternos": "sugerencia de a qué páginas del sitio enlazar internamente (1-2 oraciones)",
  "notasEEAT": "cómo demostrar experiencia/autoridad, usando el autor del brief si existe (1-2 oraciones)"
}`

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    messages:   [{ role: 'user', content: prompt }],
  })

  logTokens('contentBrief', userId ?? null, response.usage, workspaceId)
    .catch(err => console.error('[ContentBrief] Error al registrar tokens de IA:', err.message))

  const parsed = parseAIJson(response.content[0].text)
  // Adjuntamos el contexto real del SERP para transparencia en la UI
  const content = { ...parsed, serp }

  const saved = await prisma.contentBrief.upsert({
    where:  { projectId_keyword: { projectId, keyword } },
    update: { content: JSON.stringify(content), workspaceId },
    create: { projectId, workspaceId, keyword, content: JSON.stringify(content) },
  })

  return { id: saved.id, keyword: saved.keyword, content, createdAt: saved.createdAt, updatedAt: saved.updatedAt }
}

module.exports = { generateContentBrief }
