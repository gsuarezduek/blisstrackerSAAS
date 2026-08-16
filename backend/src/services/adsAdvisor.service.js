const prisma = require('../lib/prisma')
const { parseAIJson } = require('../utils/parseAIJson')
const { briefLines, briefDump } = require('../lib/briefContext')
const { createMessage } = require('../lib/claude')
const { todayString, DEFAULT_TZ } = require('../utils/dates')
const { getValidFbToken, fetchMetaAdsData } = require('./metaAds.service')
const { fetchGoogleAdsData } = require('./googleAds.service')
const { computeObjectives } = require('./marketingObjectives.service')

const PLATFORM_LABEL = { meta_ads: 'Meta Ads (Facebook/Instagram)', google_ads: 'Google Ads' }

// Etiquetas legibles de los campos del brief "Performance / Meta Ads" que le interesan
// al prompt (objetivo real, economía del negocio, tono) — mismo patrón que SEO_LABELS
// de contentBrief.service.js. Se usa para ambas plataformas: aunque el brief se llama
// "meta_ads", el contexto de negocio (ticket, margen, oferta) aplica igual a Google Ads.
const ADS_BRIEF_LABELS = {
  objetivo:             'Objetivo principal de la pauta',
  cierre_ventas:        'Dónde se cierran las ventas',
  presupuesto:          'Presupuesto mensual de inversión',
  meta_facturacion:     'Meta de facturación/consultas por mes',
  ticket_promedio:      'Ticket promedio',
  margen:               'Margen de contribución',
  tasa_conversion:      'Tasa de conversión estimada actual',
  ciclo_venta:          'Duración del ciclo de venta',
  producto_promocionar: 'Producto/servicio a promocionar primero',
  oferta_gancho:        'Oferta/gancho disponible',
  fechas_importantes:   'Promociones / fechas importantes',
  material_audiovisual: 'Material audiovisual disponible',
  resena_ideal:         'Reseña ideal de un cliente (tono)',
  marcas_anuncios:      'Marcas cuyos anuncios les llaman la atención (referencia de estilo)',
}

/**
 * Resuelve la integración de ads del proyecto y valida que esté activa. Errores
 * estructurados con `status`/`code`, mismo criterio que el resto de Marketing
 * (ver seoOpportunities.controller.js `resolveGsc`).
 */
async function resolveIntegration(projectId, workspaceId, platform) {
  const integration = await prisma.projectIntegration.findUnique({
    where: { projectId_type: { projectId, type: platform } },
  })
  if (!integration) {
    const e = new Error(`${PLATFORM_LABEL[platform]} no está conectado para este proyecto.`)
    e.status = 400; e.code = 'NO_INTEGRATION'; throw e
  }
  if (integration.status !== 'active') {
    const e = new Error(`La integración de ${PLATFORM_LABEL[platform]} expiró o tiene un error. Reconectala desde su pestaña.`)
    e.status = 400; e.code = 'TOKEN_EXPIRED'; throw e
  }
  if (platform === 'meta_ads' && !integration.propertyId) {
    const e = new Error('Falta la cuenta publicitaria de Meta Ads. Configurala desde la pestaña Meta Ads.')
    e.status = 400; e.code = 'NO_INTEGRATION'; throw e
  }
  if (platform === 'google_ads' && !integration.customerId) {
    const e = new Error('Falta el Customer ID de Google Ads. Configuralo desde la pestaña Google Ads.')
    e.status = 400; e.code = 'NO_INTEGRATION'; throw e
  }
  return integration
}

async function fetchLiveData(integration, platform, datePreset) {
  if (platform === 'meta_ads') {
    const token = await getValidFbToken(integration)
    return fetchMetaAdsData(integration.propertyId, token, datePreset)
  }
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    const e = new Error('GOOGLE_ADS_DEVELOPER_TOKEN no configurado en el servidor.')
    e.status = 500; throw e
  }
  return fetchGoogleAdsData(integration, datePreset)
}

// Bloque de tendencia: hasta 3 meses anteriores ya guardados en AdsSnapshot (spend/ctr/
// conversiones). Puede venir vacío (proyecto nuevo / nunca se guardó un snapshot) — el
// prompt lo indica en vez de fallar.
function trendBlock(snapshots) {
  if (!snapshots.length) return '(sin historial de meses anteriores todavía — es la primera vez que se analiza esta cuenta)'
  return snapshots
    .map(s => `  - ${s.month}: gasto $${s.spend.toFixed(0)}, CTR ${s.ctr.toFixed(2)}%, conversiones ${s.conversions ?? 'sin dato'}`)
    .join('\n')
}

// Objetivos de ads configurados para este proyecto+plataforma (inversión/clicks/CTR),
// vía el mismo motor que ya usa el resto de Marketing (marketingObjectives.service.js).
function objectivesBlock(results) {
  if (!results.length) return '(sin objetivos de inversión/clicks/CTR configurados para esta cuenta)'
  return results
    .map(o => `  - ${o.label}: objetivo ${o.target}${o.unit}, real ${o.actual ?? '—'}${o.unit} (${o.status}${o.pct != null ? `, ${o.pct}%` : ''})`)
    .join('\n')
}

function campaignsBlock(campaigns) {
  if (!campaigns?.length) return '  (sin campañas con actividad en el período)'
  return campaigns.slice(0, 8).map(c => {
    const convTxt = c.conversions != null ? `, conversiones ${c.conversions}` : ''
    return `  - "${c.name}" (${c.status}): gasto $${c.spend.toFixed(0)}, clicks ${c.clicks}, CTR ${c.ctr.toFixed(2)}%${convTxt}`
  }).join('\n')
}

function adsBlockMeta(topAds) {
  if (!topAds?.length) return '  (sin anuncios individuales con actividad en el período)'
  return topAds.slice(0, 6).map(a =>
    `  - "${a.name}": gasto $${a.spend.toFixed(0)}, alcance ${a.reach}, CTR ${a.ctr.toFixed(2)}%, conversiones ${a.conversions}`
  ).join('\n')
}

function adsBlockGoogle(topAds) {
  if (!topAds?.length) return '  (sin anuncios individuales con actividad en el período)'
  return topAds.slice(0, 6).map(a =>
    `  - [${a.campaignName}] "${a.headline || a.name}": impresiones ${a.impressions}, clicks ${a.clicks}, CTR ${a.ctr.toFixed(2)}%, conversiones ${a.conversions}`
  ).join('\n')
}

/**
 * Genera un análisis de IA (diagnóstico + ideas de anuncios nuevos) para la cuenta de
 * Ads (Meta o Google) de un proyecto, usando los datos en vivo ya disponibles + el
 * historial guardado + los objetivos configurados + el brief comercial del cliente.
 * No persiste nada — se recalcula cada vez que se pide (mismo criterio que
 * generateSchemaOrg/generateLlmsTxt en geo.controller.js).
 */
async function generateAdsAdvisor({ projectId, workspaceId, userId, platform, datePreset = 'this_month', tz = DEFAULT_TZ }) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true, name: true },
  })
  if (!project) { const e = new Error('Proyecto no encontrado'); e.status = 404; throw e }

  const integration = await resolveIntegration(projectId, workspaceId, platform)
  const liveData     = await fetchLiveData(integration, platform, datePreset)

  const currentMonth = todayString(tz).slice(0, 7)

  const [snapshots, briefs] = await Promise.all([
    prisma.adsSnapshot.findMany({
      where:   { projectId, workspaceId, type: platform, month: { lt: currentMonth } },
      orderBy: { month: 'desc' },
      take:    3,
      select:  { month: true, spend: true, ctr: true, conversions: true },
    }),
    prisma.projectBrief.findMany({
      where:  { projectId, workspaceId, type: { in: ['meta_ads', 'marca'] } },
      select: { type: true, answers: true },
    }),
  ])

  const objectiveResults = await computeObjectives({
    projectId, workspaceId, dataMonth: currentMonth,
    googleAds: platform === 'google_ads' ? liveData : null,
    metaAds:   platform === 'meta_ads'   ? liveData : null,
  }).then(all => all.filter(o => o.category === 'ads' && o.detail?.platform === platform))

  const adsAnswers   = briefs.find(b => b.type === 'meta_ads')?.answers || {}
  const marcaAnswers = briefs.find(b => b.type === 'marca')?.answers   || {}
  const briefCtx      = briefLines(adsAnswers, ADS_BRIEF_LABELS)
  const marcaCtx       = briefDump(marcaAnswers)

  const isGoogle = platform === 'google_ads'
  const spend    = isGoogle ? liveData.cost : liveData.spend

  const copyInstructions = isGoogle
    ? 'Para "nuevosCopys": son anuncios de búsqueda de texto (Responsive Search Ads). "headline" debe tener HASTA 30 caracteres y "texto" (la descripción) HASTA 90 caracteres — son límites duros de Google Ads, respetalos estrictamente.'
    : 'Para "nuevosCopys": son anuncios de Meta (Facebook/Instagram). No generás la imagen/video — "headline" es el título corto del anuncio y "texto" es el texto principal (primary text). Si el cliente no tiene material audiovisual propio (ver brief), decilo en "motivo" para que se sepa que hay que producir el creativo.'

  const prompt = `Sos un media buyer senior especializado en ${PLATFORM_LABEL[platform]}. Analizá la cuenta publicitaria de un cliente de una agencia de marketing y dale al equipo interno recomendaciones ACCIONABLES para el día a día — no un resumen genérico de "optimizá tus anuncios".

PROYECTO: "${project.name}"

DATOS DEL PERÍODO ACTUAL (${liveData.datePreset}):
Gasto: $${spend?.toFixed(0) ?? 0} | Impresiones: ${liveData.impressions} | Clicks: ${liveData.clicks} | CTR: ${liveData.ctr?.toFixed(2)}% | Conversiones: ${liveData.conversions ?? 'sin dato'}

CAMPAÑAS:
${campaignsBlock(liveData.campaigns)}

ANUNCIOS INDIVIDUALES:
${isGoogle ? adsBlockGoogle(liveData.topAds) : adsBlockMeta(liveData.topAds)}

TENDENCIA (meses anteriores ya cerrados):
${trendBlock(snapshots)}

OBJETIVOS CONFIGURADOS PARA ESTA CUENTA:
${objectivesBlock(objectiveResults)}

CONTEXTO COMERCIAL DEL CLIENTE (brief):
${briefCtx || '  (sin brief de Meta Ads/Performance cargado — no asumas ticket/margen que no estén acá)'}

CONTEXTO DE MARCA (tono, público, diferencial):
${marcaCtx || '  (sin brief de marca cargado)'}

INSTRUCCIONES:
- "diagnostico": priorizá 3 a 8 hallazgos accionables (qué pausar, qué escalar, qué ajustar, alertas de pacing vs objetivo, oportunidades). Cada uno con "ambito" (cuenta/campania/anuncio), "referencia" (nombre exacto de la campaña/anuncio si aplica, si no null), "tipo" (pausar/escalar/ajustar/alerta/oportunidad), "prioridad" (alta/media/baja) y "detalle" concreto citando los números reales de arriba (nunca inventes cifras). Si hay ticket promedio y margen en el brief, podés estimar rentabilidad aproximada; si no hay, no la inventes.
- "nuevosCopys": proponé 3 a 5 ideas de anuncios nuevos, con ángulos DISTINTOS entre sí y distintos a lo que ya está corriendo (mirá los anuncios individuales de arriba para no repetir). Usá la oferta/gancho y el tono de marca del brief si están. ${copyInstructions}
- Respondé en español rioplatense, tono directo y profesional (le hablás al equipo de la agencia, no al cliente final).

Respondé SOLO con un JSON válido, sin markdown ni texto adicional:
{
  "diagnostico": [ { "ambito": "cuenta|campania|anuncio", "referencia": "string o null", "tipo": "pausar|escalar|ajustar|alerta|oportunidad", "prioridad": "alta|media|baja", "titulo": "string corto", "detalle": "1-3 oraciones, con números reales" } ],
  "nuevosCopys": [ { "angulo": "string corto", "headline": "string", "texto": "string", "motivo": "1 oración de por qué este ángulo" } ]
}`

  const response = await createMessage(
    { model: 'claude-haiku-4-5-20251001', max_tokens: 3000, messages: [{ role: 'user', content: prompt }] },
    { workspaceId, userId, source: 'adsAdvisor' },
  )

  const textBlock = response.content.find(b => b.type === 'text')
  const parsed = parseAIJson(textBlock?.text ?? '')

  return {
    diagnostico: Array.isArray(parsed.diagnostico) ? parsed.diagnostico : [],
    nuevosCopys: Array.isArray(parsed.nuevosCopys) ? parsed.nuevosCopys : [],
    generatedAt: new Date().toISOString(),
  }
}

module.exports = { generateAdsAdvisor }
