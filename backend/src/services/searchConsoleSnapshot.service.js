const Anthropic = require('@anthropic-ai/sdk')
const prisma    = require('../lib/prisma')
const { fetchSearchConsoleData } = require('./googleSearchConsole.service')
const { logTokens }              = require('../lib/logTokens')
const { normalizeSiteUrl }       = require('../utils/seo')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  const pad     = n => String(n).padStart(2, '0')
  const lastDay = new Date(y, m, 0).getDate()
  return { startDate: `${y}-${pad(m)}-01`, endDate: `${y}-${pad(m)}-${pad(lastDay)}` }
}

// ─── Guardar snapshot mensual ─────────────────────────────────────────────────

/**
 * Obtiene y guarda (upsert) el snapshot mensual de GSC para un proyecto.
 * @param {number} projectId
 * @param {number} workspaceId
 * @param {string} month  — "YYYY-MM"
 * @returns {Promise<object|null>}
 */
async function saveMonthSnapshot(projectId, workspaceId, month) {
  const [project, integration] = await Promise.all([
    prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: { id: true, websiteUrl: true },
    }),
    prisma.projectIntegration.findUnique({
      where:  { projectId_type: { projectId, type: 'google_search_console' } },
      select: { id: true, status: true, propertyId: true, accessToken: true, refreshToken: true, expiresAt: true },
    }),
  ])

  if (!integration || integration.status !== 'active') return null

  const siteUrl = normalizeSiteUrl(integration.propertyId || project?.websiteUrl)
  if (!siteUrl) return null

  const { startDate, endDate } = monthBounds(month)
  const data = await fetchSearchConsoleData(integration, siteUrl, startDate, endDate, {
    device:  null,
    compare: false,
  })

  // Convertir devices array → objeto indexado por nombre de dispositivo
  const devicesMap = {}
  for (const d of data.devices ?? []) {
    devicesMap[d.device] = { clicks: d.clicks, impressions: d.impressions }
  }

  const payload = {
    clicks:      data.overview.clicks,
    impressions: data.overview.impressions,
    ctr:         data.overview.ctr,
    avgPosition: data.overview.position,
    devices:     JSON.stringify(devicesMap),
    countries:   JSON.stringify(data.countries  ?? []),
    topQueries:  JSON.stringify(data.topQueries ?? []),
    topPages:    JSON.stringify(data.topPages   ?? []),
    updatedAt:   new Date(),
  }

  return prisma.searchConsoleSnapshot.upsert({
    where:  { projectId_month: { projectId, month } },
    create: { workspaceId, projectId, month, ...payload },
    update: payload,
  })
}

// ─── Cron: guardar snapshots del mes anterior para todos los proyectos ────────

/**
 * Ejecutado el 1° de cada mes: guarda snapshot de GSC del mes anterior
 * para todos los proyectos con integración activa de Search Console.
 */
async function saveAllSearchConsoleSnapshots() {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() // 0-indexed: enero=0
  const prevM = month === 0 ? 12 : month
  const prevY = month === 0 ? year - 1 : year
  const targetMonth = `${prevY}-${String(prevM).padStart(2, '0')}`

  const integrations = await prisma.projectIntegration.findMany({
    where:   { type: 'google_search_console', status: 'active' },
    select:  { projectId: true, project: { select: { workspaceId: true } } },
  })

  let saved = 0, skipped = 0, failed = 0
  for (const intg of integrations) {
    try {
      const result = await saveMonthSnapshot(intg.projectId, intg.project.workspaceId, targetMonth)
      result ? saved++ : skipped++
    } catch (err) {
      console.error(`[SeoSnapshot] Error en proyecto ${intg.projectId}:`, err.message)
      failed++
    }
    // Pequeño delay para no saturar la API de Google
    await new Promise(r => setTimeout(r, 500))
  }
  console.log(`[SeoSnapshot] ${saved} guardados, ${skipped} sin datos, ${failed} errores. Mes: ${targetMonth}`)
}

// ─── Generar análisis IA ──────────────────────────────────────────────────────

/**
 * Genera sugerencias SEO con Claude Haiku a partir de datos live de GSC.
 * Guarda el resultado en SeoAiInsight (upsert por projectId).
 *
 * @param {number} projectId
 * @param {number} workspaceId
 * @param {object} liveData — resultado de fetchSearchConsoleData (últimos 30 días)
 * @returns {Promise<object>} — el JSON de sugerencias
 */
async function generateSeoAiInsights(projectId, workspaceId, liveData) {
  const ov = liveData.overview ?? {}

  const queriesText = (liveData.topQueries ?? []).slice(0, 8).map(q =>
    `- "${q.query}": ${q.clicks} clicks, ${q.impressions} impres., pos. ${q.position.toFixed(1)}, CTR ${(q.ctr * 100).toFixed(1)}%`
  ).join('\n')

  const oppsText = (liveData.opportunityPages ?? []).slice(0, 6).map(p =>
    `- ${p.page}: ${p.impressions} impres., CTR ${(p.ctr * 100).toFixed(1)}%, pos. ${p.position.toFixed(1)}`
  ).join('\n')

  const trendsText = (liveData.topQueriesComparison ?? [])
    .filter(c => c.positionDelta != null)
    .slice(0, 5)
    .map(c =>
      `- "${c.query}": posición ${c.positionDelta > 0 ? '↓' : '↑'} ${Math.abs(c.positionDelta).toFixed(1)} puestos, clicks ${c.clicksDelta >= 0 ? '+' : ''}${c.clicksDelta}`
    ).join('\n')

  const prompt = `Sos un experto SEO analizando datos reales de Google Search Console.

MÉTRICAS DE LOS ÚLTIMOS 30 DÍAS:
- Clicks: ${ov.clicks}, Impresiones: ${ov.impressions}
- CTR promedio: ${((ov.ctr ?? 0) * 100).toFixed(1)}%, Posición media: ${(ov.position ?? 0).toFixed(1)}

TOP CONSULTAS:
${queriesText || 'Sin datos'}

PÁGINAS CON OPORTUNIDAD DE CTR (muchas impresiones, CTR bajo):
${oppsText || 'Sin datos'}

${trendsText ? `TENDENCIAS VS PERÍODO ANTERIOR:\n${trendsText}` : ''}

Analizá estos datos y generá sugerencias accionables priorizando:
1. Páginas con muchas impresiones y CTR bajo → mejorar title/description
2. Queries en posición 5-15 con potencial de subir al top 3
3. Quick wins técnicos o de contenido de bajo esfuerzo y alto impacto

Respondé SOLO con un JSON (sin texto antes ni después):
{
  "titulo": "string breve (ej: 'Oportunidades SEO detectadas')",
  "resumen": "2-3 frases con el diagnóstico principal del sitio",
  "oportunidades": [
    {
      "pagina": "URL o descripción de la página",
      "accion": "qué hacer exactamente, específico",
      "impacto": "alto|medio|bajo",
      "razon": "por qué esta acción va a generar resultados (con número de impresiones u otro dato concreto)"
    }
  ],
  "quickWins": [
    {
      "titulo": "título corto de la acción",
      "descripcion": "descripción breve de qué hacer y por qué",
      "tarea": "texto listo para crear como tarea (empezar con verbo: Optimizar, Agregar, Revisar...)"
    }
  ]
}

Máximo 3 oportunidades y 3 quickWins. Sé específico con URLs y acciones concretas.`

  const message = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages:   [{ role: 'user', content: prompt }],
  })

  logTokens('seoAiInsight', null, message.usage, workspaceId)
    .catch(err => console.error('[SeoAiInsight] Error al registrar tokens:', err.message))

  const raw       = message.content[0].text.trim()
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Respuesta de IA no es JSON válido')
  const parsed = JSON.parse(jsonMatch[0])

  await prisma.seoAiInsight.upsert({
    where:  { projectId },
    create: { projectId, workspaceId, content: JSON.stringify(parsed) },
    update: { content: JSON.stringify(parsed), generatedAt: new Date() },
  })

  return parsed
}

module.exports = { saveMonthSnapshot, saveAllSearchConsoleSnapshots, generateSeoAiInsights }
