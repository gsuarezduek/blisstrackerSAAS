const Anthropic = require('@anthropic-ai/sdk')
const prisma    = require('../lib/prisma')
const { parseAIJson }         = require('../utils/parseAIJson')
const { logTokens }           = require('../lib/logTokens')
const { normalizeSiteUrl }    = require('../utils/seo')
const { querySearchConsole }  = require('./googleSearchConsole.service')
const { getValidAccessToken } = require('./tokenRefresh.service')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonthStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function prevMonth(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  const pad     = n => String(n).padStart(2, '0')
  const lastDay = new Date(y, m, 0).getDate()
  return { startDate: `${y}-${pad(m)}-01`, endDate: `${y}-${pad(m)}-${pad(lastDay)}` }
}

// ─── Guardar rankings del mes ──────────────────────────────────────────────────

/**
 * Obtiene los datos GSC del mes, hace match con las keywords trackeadas
 * y hace upsert de KeywordRanking para cada una.
 */
async function saveMonthKeywordRankings(projectId, workspaceId, month) {
  const tracked = await prisma.trackedKeyword.findMany({
    where: { projectId, workspaceId },
  })
  if (!tracked.length) return

  const [integration, project] = await Promise.all([
    prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'google_search_console' } },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { websiteUrl: true },
    }),
  ])

  if (!integration || integration.status !== 'active') return

  const siteUrl = normalizeSiteUrl(integration.propertyId || project?.websiteUrl)
  if (!siteUrl) return

  const accessToken = await getValidAccessToken(integration)
  const { startDate, endDate } = monthBounds(month)
  const country = integration.country || 'arg'

  // Una sola query para top 100 queries del mes, filtrada por país
  let rows = []
  try {
    rows = await querySearchConsole(accessToken, siteUrl, {
      startDate,
      endDate,
      type: 'web',
      dimensions: ['query'],
      rowLimit: 100,
      ...(country !== 'all' ? {
        dimensionFilterGroups: [{ filters: [{ dimension: 'country', operator: 'equals', expression: country }] }],
      } : {}),
    })
  } catch (err) {
    console.error(`[KeywordTracking] Error GSC proyecto ${projectId}:`, err.message)
    return
  }

  // Mapa query.toLowerCase() → row
  const rowMap = {}
  for (const r of rows) {
    rowMap[r.keys[0].toLowerCase()] = r
  }

  for (const kw of tracked) {
    const row = rowMap[kw.query.toLowerCase()]
    await prisma.keywordRanking.upsert({
      where: { trackedKeywordId_month: { trackedKeywordId: kw.id, month } },
      create: {
        trackedKeywordId: kw.id,
        projectId,
        workspaceId,
        month,
        clicks:      row ? Math.round(row.clicks)      : 0,
        impressions: row ? Math.round(row.impressions)  : 0,
        ctr:         row ? row.ctr                      : 0,
        position:    row ? row.position                 : 0,
      },
      update: {
        clicks:      row ? Math.round(row.clicks)      : 0,
        impressions: row ? Math.round(row.impressions)  : 0,
        ctr:         row ? row.ctr                      : 0,
        position:    row ? row.position                 : 0,
      },
    })
  }
}

// ─── Análisis IA (SKILL.md) ───────────────────────────────────────────────────

/**
 * Genera análisis estratégico de una keyword con Claude Haiku.
 * Incluye: intención, dificultad, Opportunity Score, potencial GEO,
 * topic cluster, variantes long-tail y recomendaciones.
 */
async function generateKeywordAnalysis(trackedKeywordId, workspaceId) {
  const kw = await prisma.trackedKeyword.findUnique({
    where: { id: trackedKeywordId },
    include: {
      rankings: {
        orderBy: { month: 'desc' },
        take: 6,
      },
      project: { select: { name: true, websiteUrl: true } },
    },
  })
  if (!kw) throw new Error('Keyword no encontrada')

  const siteUrl = kw.project?.websiteUrl || '(sin URL)'

  // Construir tabla de historial para el prompt
  const historyLines = kw.rankings.length
    ? kw.rankings.map(r =>
        `  ${r.month} | pos: ${r.position.toFixed(1)} | clicks: ${r.clicks} | impresiones: ${r.impressions}`
      ).join('\n')
    : '  (sin datos históricos aún — keyword recién agregada)'

  const latestRanking = kw.rankings[0]
  const prevRanking   = kw.rankings[1]
  const avgImpressions = kw.rankings.length
    ? Math.round(kw.rankings.reduce((s, r) => s + r.impressions, 0) / kw.rankings.length)
    : 0

  const tendenciaCtx = latestRanking && prevRanking
    ? latestRanking.position < prevRanking.position
      ? 'mejorando (posición bajando en número = subiendo en ranking)'
      : latestRanking.position > prevRanking.position
        ? 'bajando'
        : 'estable'
    : latestRanking
      ? 'nueva (primer mes de datos)'
      : 'sin datos'

  const prompt = `Sos un experto en SEO y GEO (Generative Engine Optimization). Analizá la keyword "${kw.query}" para el sitio ${siteUrl} del proyecto "${kw.project?.name}".

Datos de Search Console (últimos meses, del más reciente al más antiguo):
${historyLines}

Tendencia actual: ${tendenciaCtx}
Impresiones promedio: ${avgImpressions}

Tu análisis debe seguir la metodología del SKILL de keyword research:
- Clasificar la intención de búsqueda y asignar un valor numérico (informacional=1, navegacional=1, comercial=2, transaccional=3)
- Estimar la dificultad de ranking en escala 1-100 basándote en el tipo de keyword, su longitud, especificidad y competencia esperada en el mercado hispanohablante
- Calcular el Opportunity Score con la fórmula: (impresiones_promedio × intentValue) / dificultad
- Evaluar el potencial GEO: ¿es esta keyword del tipo que los sistemas de IA (ChatGPT, Perplexity, Google SGE) podrían responder directamente? (preguntas, definiciones, comparaciones → alto potencial)
- Sugerir un topic cluster con contenido pilar y subtemas satélite
- Generar 3 variantes long-tail
- Dar 2 recomendaciones concretas para mejorar el posicionamiento

Respondé SOLO con un JSON válido, sin markdown ni texto adicional:
{
  "intencion": "informacional|navegacional|comercial|transaccional",
  "intentValue": 1,
  "dificultad": 45,
  "opportunityScore": 14.2,
  "potencialGeo": "alto|medio|bajo",
  "motivoGeo": "string corto (1 oración) explicando por qué tiene ese potencial GEO",
  "tendencia": "mejorando|estable|bajando|nueva",
  "resumen": "2-3 oraciones sobre el estado actual de esta keyword y su oportunidad",
  "tipoContenido": "guía|comparativa|landing|post|faq|otro",
  "topicCluster": {
    "pillar": "Título sugerido para el contenido pilar (H1)",
    "clusters": ["Subtema 1", "Subtema 2", "Subtema 3"]
  },
  "longTail": ["variante long-tail 1", "variante long-tail 2", "variante long-tail 3"],
  "recomendaciones": ["Acción concreta 1 (mencioná números si es posible)", "Acción concreta 2"]
}`

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 900,
    messages:   [{ role: 'user', content: prompt }],
  })

  logTokens('keywordAnalysis', null, response.usage, workspaceId)
    .catch(err => console.error('[KeywordTracking] Error al registrar tokens de IA:', err.message))

  const parsed = parseAIJson(response.content[0].text)

  await prisma.trackedKeyword.update({
    where: { id: trackedKeywordId },
    data: {
      analysisContent:   JSON.stringify(parsed),
      analysisUpdatedAt: new Date(),
    },
  })

  return parsed
}

// ─── Cron: guardar rankings del mes anterior ──────────────────────────────────

/**
 * Ejecutado el 1° de cada mes: guarda rankings del mes que acaba de cerrar
 * para todos los proyectos con GSC activo y al menos 1 keyword trackeada.
 */
async function saveAllKeywordRankings() {
  const now   = new Date()
  const month = prevMonth(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  )

  // Proyectos con keywords trackeadas + GSC activo
  const projects = await prisma.trackedKeyword.findMany({
    where:   {},
    select:  { projectId: true, workspaceId: true },
    distinct: ['projectId'],
  })

  console.log(`[KeywordTracking] Guardando rankings de ${month} para ${projects.length} proyecto(s)...`)
  let saved = 0
  for (const { projectId, workspaceId } of projects) {
    try {
      await saveMonthKeywordRankings(projectId, workspaceId, month)
      saved++
    } catch (err) {
      console.error(`[KeywordTracking] Error en proyecto ${projectId}:`, err.message)
    }
  }
  console.log(`[KeywordTracking] ${saved}/${projects.length} proyectos procesados.`)
}

module.exports = {
  saveMonthKeywordRankings,
  generateKeywordAnalysis,
  saveAllKeywordRankings,
  currentMonthStr,
}
