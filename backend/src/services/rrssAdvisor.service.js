const prisma = require('../lib/prisma')
const { parseAIJson } = require('../utils/parseAIJson')
const { briefLines, briefDump } = require('../lib/briefContext')
const { createMessage } = require('../lib/claude')
const { todayString, DEFAULT_TZ } = require('../utils/dates')
const { computeObjectives } = require('./marketingObjectives.service')
const { enabledWorkspaceIds } = require('../lib/featureFlags')
const { hasTokenBudget } = require('../lib/tokenBudget')

const INTEGRATION_TYPE = { instagram: 'instagram', tiktok: 'tiktok', linkedin: 'linkedin', facebook: 'facebook', youtube: 'google_youtube' }
const SNAPSHOT_MODEL   = { instagram: 'instagramSnapshot', tiktok: 'tikTokSnapshot', linkedin: 'linkedinSnapshot', facebook: 'facebookSnapshot', youtube: 'youTubeSnapshot' }
const PLATFORM_LABEL   = { instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', facebook: 'Facebook', youtube: 'YouTube' }
// TikTok/YouTube no tienen scraper de competidores (ver competitorSnapshot.service.js PLATFORM_SCRAPERS)
const COMPETITOR_PLATFORMS = new Set(['instagram', 'linkedin', 'facebook'])
const PLATFORMS = Object.keys(INTEGRATION_TYPE)

// Etiquetas legibles de los campos del brief "Contenido Orgánico (RRSS)" que le
// interesan al prompt — mismo patrón que ADS_BRIEF_LABELS de adsAdvisor.service.js.
const ORGANICO_BRIEF_LABELS = {
  objetivos:          'Qué buscan lograr con redes',
  medicion_exito:      'Cómo miden el éxito de la gestión',
  tipo_contenido:      'Tipo de contenido preferido',
  temas_evitar:        'Temas a evitar',
  cuentas_referencia:  'Cuentas de referencia (estilo)',
  resultados:          'Resultados actuales — qué funciona y qué no',
}

function pct(curr, prev) {
  if (prev == null || prev === 0) return null
  return parseFloat(((curr - prev) / prev * 100).toFixed(1))
}

/**
 * Resuelve la integración de la red del proyecto y valida que esté activa. Mismo
 * criterio que adsAdvisor.service.js `resolveIntegration` — errores estructurados
 * con status/code.
 */
async function resolveIntegration(projectId, workspaceId, platform) {
  const integration = await prisma.projectIntegration.findUnique({
    where: { projectId_type: { projectId, type: INTEGRATION_TYPE[platform] } },
  })
  if (!integration) {
    const e = new Error(`${PLATFORM_LABEL[platform]} no está conectado para este proyecto.`)
    e.status = 400; e.code = 'NO_INTEGRATION'; throw e
  }
  if (integration.status !== 'active') {
    const e = new Error(`La integración de ${PLATFORM_LABEL[platform]} expiró o tiene un error. Reconectala desde su pestaña.`)
    e.status = 400; e.code = 'TOKEN_EXPIRED'; throw e
  }
  return integration
}

// Normaliza los campos (distintos por modelo) de un snapshot a un shape común.
function snapshotSummary(platform, snap) {
  if (!snap) return null
  if (platform === 'instagram') {
    return { month: snap.month, followers: snap.followersCount, engagementRate: snap.engagementRate, postsCount: snap.postsCount, avgLikes: snap.avgLikes }
  }
  if (platform === 'tiktok') {
    return { month: snap.month, followers: snap.followersCount, engagementRate: snap.engagementRate, postsCount: snap.postsThisMonth, avgLikes: snap.avgLikes }
  }
  if (platform === 'linkedin') {
    const avgLikes = snap.postsThisMonth > 0 ? Math.round(snap.totalLikes / snap.postsThisMonth) : null
    return { month: snap.month, followers: snap.followersCount, engagementRate: snap.engagementRate, postsCount: snap.postsThisMonth, avgLikes }
  }
  if (platform === 'facebook') {
    const avgLikes = snap.postsThisMonth > 0 ? Math.round(snap.totalLikes / snap.postsThisMonth) : null
    return { month: snap.month, followers: snap.followersCount, engagementRate: snap.engagementRate, postsCount: snap.postsThisMonth, avgLikes }
  }
  // youtube
  return { month: snap.month, followers: snap.subscriberCount, engagementRate: snap.engagementRate, postsCount: snap.videosThisMonth, avgLikes: snap.avgLikes }
}

function summaryLine(s) {
  if (!s) return null
  const parts = [`${s.followers ?? '—'} seguidores`]
  if (s.postsCount != null) parts.push(`${s.postsCount} publicaciones`)
  if (s.engagementRate != null) parts.push(`engagement ${s.engagementRate}%`)
  if (s.avgLikes != null) parts.push(`promedio ${s.avgLikes} likes`)
  return parts.join(', ')
}

/**
 * Compara la cuenta propia contra sus competidores cargados (CompetitorAccount) de la
 * misma plataforma. Solo devuelve texto si la cuenta propia LIDERA (rank #1,
 * estrictamente mejor que TODOS) en al menos una métrica — mismo criterio que
 * buildCompetitorComparison de monthlyReport.service.js, adaptado acá standalone
 * (self-contained, sin importar de ese archivo) para no acoplar el informe mensual
 * con el RRSS Advisor.
 */
async function competitorBlock({ projectId, platform, ownLatest, ownPrev }) {
  if (!COMPETITOR_PLATFORMS.has(platform) || !ownLatest) return null

  const accounts = await prisma.competitorAccount.findMany({
    where:  { projectId, platform },
    select: {
      username: true, displayName: true,
      snapshots: {
        where:  { month: { in: [ownLatest.month, ownPrev?.month].filter(Boolean) } },
        select: { month: true, followersCount: true, engagementRate: true, avgLikes: true },
      },
    },
  })
  if (accounts.length === 0) return null

  const competitors = accounts.map(c => {
    const cur = c.snapshots.find(s => s.month === ownLatest.month)
    if (!cur) return null
    const prv = ownPrev ? c.snapshots.find(s => s.month === ownPrev.month) : null
    return {
      name:       c.displayName || `@${c.username}`,
      engagement: cur.engagementRate ?? null,
      avgLikes:   cur.avgLikes ?? null,
      growth:     prv ? pct(cur.followersCount, prv.followersCount) : null,
    }
  }).filter(Boolean)
  if (competitors.length === 0) return null

  const own = {
    engagement: ownLatest.engagementRate ?? null,
    avgLikes:   ownLatest.avgLikes ?? null,
    growth:     ownPrev ? pct(ownLatest.followers, ownPrev.followers) : null,
  }

  const METRICS = [
    { key: 'engagement', label: 'engagement' },
    { key: 'growth',     label: 'crecimiento de seguidores' },
    { key: 'avgLikes',   label: 'promedio de likes' },
  ]

  const lines = []
  for (const m of METRICS) {
    const ownVal = own[m.key]
    if (ownVal == null) continue
    const withMetric = competitors.filter(c => c[m.key] != null)
    if (withMetric.length === 0) continue
    const best = Math.max(...withMetric.map(c => c[m.key]))
    if (ownVal > best) lines.push(`  - Lidera en ${m.label}: ${ownVal} vs. el mejor competidor con ${best}`)
    else if (ownVal < Math.min(...withMetric.map(c => c[m.key]))) lines.push(`  - Va perdiendo en ${m.label}: ${ownVal} vs. el mejor competidor con ${best}`)
  }
  if (lines.length === 0) return null
  return `Comparado con ${competitors.length} competidor(es) cargado(s) (${competitors.map(c => c.name).join(', ')}):\n${lines.join('\n')}`
}

/**
 * Genera un diagnóstico de IA para la cuenta de una red social de un proyecto, usando
 * los snapshots ya guardados (se actualizan en cada visita a la pestaña — ver
 * instagram.controller.js), sin pegarle en vivo a la API de la red (a diferencia de
 * adsAdvisor.service.js). No persiste nada más que el cache — se recalcula cada vez
 * que se pide.
 */
async function generateRrssAdvisor({ projectId, workspaceId, userId, platform, tz = DEFAULT_TZ }) {
  if (!PLATFORMS.includes(platform)) {
    const e = new Error('Red social inválida'); e.status = 400; e.code = 'INVALID_PLATFORM'; throw e
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true, name: true },
  })
  if (!project) { const e = new Error('Proyecto no encontrado'); e.status = 404; throw e }

  await resolveIntegration(projectId, workspaceId, platform)

  const model = prisma[SNAPSHOT_MODEL[platform]]
  const rows = await model.findMany({
    where:   { projectId, workspaceId },
    orderBy: { month: 'desc' },
    take:    2,
  })
  if (rows.length === 0) {
    const e = new Error(`Todavía no hay datos guardados de ${PLATFORM_LABEL[platform]} para este proyecto. Visitá la pestaña de ${PLATFORM_LABEL[platform]} al menos una vez antes de generar el análisis.`)
    e.status = 400; e.code = 'NO_SNAPSHOT'; throw e
  }
  const latest = snapshotSummary(platform, rows[0])
  const prev   = snapshotSummary(platform, rows[1])
  const growth = prev ? pct(latest.followers, prev.followers) : null

  const currentMonth = todayString(tz).slice(0, 7)

  const [compBlock, objectiveResults, briefs] = await Promise.all([
    competitorBlock({ projectId, platform, ownLatest: latest, ownPrev: prev }),
    computeObjectives({ projectId, workspaceId, dataMonth: currentMonth }).then(all => all.filter(o =>
      o.category === 'rrss' && (o.detail?.platform === platform || (platform === 'instagram' && ['alcance', 'visualizaciones'].includes(o.metric))),
    )),
    prisma.projectBrief.findMany({
      where:  { projectId, workspaceId, type: { in: ['organico', 'marca'] } },
      select: { type: true, answers: true },
    }),
  ])

  const organicoAnswers = briefs.find(b => b.type === 'organico')?.answers || {}
  const marcaAnswers    = briefs.find(b => b.type === 'marca')?.answers    || {}
  const organicoCtx = briefLines(organicoAnswers, ORGANICO_BRIEF_LABELS)
  const marcaCtx     = briefDump(marcaAnswers)

  const objectivesBlock = objectiveResults.length
    ? objectiveResults.map(o => `  - ${o.label}: objetivo ${o.target}${o.unit}, real ${o.actual ?? '—'}${o.unit} (${o.status}${o.pct != null ? `, ${o.pct}%` : ''})`).join('\n')
    : '  (sin objetivos configurados para esta red)'

  const prompt = `Sos un estratega de redes sociales senior de una agencia de marketing. Analizá la cuenta de ${PLATFORM_LABEL[platform]} de un cliente y dale al equipo interno un diagnóstico ACCIONABLE — no un resumen genérico de "publiquen más seguido".

PROYECTO: "${project.name}"
RED: ${PLATFORM_LABEL[platform]}

ESTADO MÁS RECIENTE DISPONIBLE (${latest.month}):
  ${summaryLine(latest)}

MES ANTERIOR A ESE${prev ? ` (${prev.month})` : ''}:
${prev ? `  ${summaryLine(prev)}` : '  (sin datos del mes anterior — es la primera vez que se analiza esta cuenta)'}

CRECIMIENTO DE SEGUIDORES: ${growth != null ? `${growth}%` : 'sin dato suficiente para calcularlo'}

COMPETENCIA:
${compBlock || '  (sin datos de competidores que muestren una diferencia relevante, o no hay competidores cargados para esta red)'}

OBJETIVOS CONFIGURADOS PARA ESTA RED:
${objectivesBlock}

CONTEXTO DE CONTENIDO ORGÁNICO (brief del cliente):
${organicoCtx || '  (sin brief de contenido orgánico cargado)'}

CONTEXTO DE MARCA (tono, público, diferencial):
${marcaCtx || '  (sin brief de marca cargado)'}

INSTRUCCIONES:
- "diagnostico": priorizá 3 a 6 hallazgos accionables sobre esta red concreta (qué está funcionando, qué está cayendo, alertas de tendencia, oportunidades frente a la competencia). Cada uno con "tipo" (alerta/oportunidad/ajustar/felicitar), "prioridad" (alta/media/baja), "titulo" corto y "detalle" de 1-3 oraciones citando los números reales de arriba (nunca inventes cifras que no estén acá).
- No propongas piezas de contenido específicas todavía (ideas creativas concretas) — enfocate en diagnóstico de performance y estrategia, no en creatividad.
- Si no hay datos suficientes de algo (ej. sin mes anterior, sin competidores), no inventes — decilo o simplemente no generes un hallazgo sobre eso.
- Respondé en español rioplatense, tono directo y profesional (le hablás al equipo de la agencia, no al cliente final).

Respondé SOLO con un JSON válido, sin markdown ni texto adicional:
{ "diagnostico": [ { "tipo": "alerta|oportunidad|ajustar|felicitar", "prioridad": "alta|media|baja", "titulo": "string corto", "detalle": "1-3 oraciones, con números reales" } ] }`

  const response = await createMessage(
    { model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] },
    { workspaceId, userId, source: 'rrssAdvisor' },
  )

  const textBlock = response.content.find(b => b.type === 'text')
  const parsed = parseAIJson(textBlock?.text ?? '')

  const result = {
    diagnostico: Array.isArray(parsed.diagnostico) ? parsed.diagnostico : [],
    generatedAt: new Date().toISOString(),
  }

  // Cachea el último resultado para que el panel "Prioridades" (marketingPending.service.js)
  // pueda leerlo sin volver a pegarle a Claude. Best-effort.
  await prisma.rrssAdvisorResult.upsert({
    where:  { projectId_platform: { projectId, platform } },
    create: { workspaceId, projectId, platform, diagnostico: JSON.stringify(result.diagnostico), generatedAt: new Date(result.generatedAt) },
    update: { diagnostico: JSON.stringify(result.diagnostico), generatedAt: new Date(result.generatedAt) },
  }).catch(() => {})

  return result
}

/**
 * Corre generateRrssAdvisor() automáticamente para todos los proyectos con alguna
 * integración de RRSS activa, en workspaces con Marketing habilitado y el toggle
 * `rrssAdvisorAutoEnabled` prendido (default on, opt-out). Invocada por el cron
 * semanal de index.js. Mismo criterio que runWeeklyAdsAdvisor.
 */
async function runWeeklyRrssAdvisor() {
  const enabled = await enabledWorkspaceIds('marketing')
  if (enabled.size === 0) { console.log('[RrssAdvisorWeekly] Sin workspaces con Marketing habilitado.'); return }

  const workspaces = await prisma.workspace.findMany({
    where:  { id: { in: [...enabled] }, rrssAdvisorAutoEnabled: true },
    select: { id: true, timezone: true },
  })
  if (workspaces.length === 0) { console.log('[RrssAdvisorWeekly] Ningún workspace con el toggle prendido.'); return }
  const wsById = new Map(workspaces.map(w => [w.id, w]))
  const wsIds = [...wsById.keys()]

  const integrationTypes = await prisma.projectIntegration.findMany({
    where:  { type: { in: Object.values(INTEGRATION_TYPE) }, status: 'active', workspaceId: { in: wsIds } },
    select: { projectId: true, workspaceId: true, type: true },
  })
  const TYPE_TO_PLATFORM = Object.fromEntries(Object.entries(INTEGRATION_TYPE).map(([k, v]) => [v, k]))
  const jobs = integrationTypes.map(i => ({ ...i, platform: TYPE_TO_PLATFORM[i.type] }))

  let ok = 0, skipped = 0, failed = 0
  for (const job of jobs) {
    if (!(await hasTokenBudget(job.workspaceId))) {
      skipped++
      console.log(`[RrssAdvisorWeekly] Workspace ${job.workspaceId} sin presupuesto de tokens — se omite proyecto ${job.projectId}.`)
      continue
    }
    try {
      await generateRrssAdvisor({
        projectId: job.projectId, workspaceId: job.workspaceId, userId: null,
        platform: job.platform, tz: wsById.get(job.workspaceId)?.timezone,
      })
      ok++
    } catch (err) {
      failed++
      console.error(`[RrssAdvisorWeekly] Proyecto ${job.projectId} (${job.platform}):`, err.message)
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  console.log(`[RrssAdvisorWeekly] ok=${ok} skipped=${skipped} failed=${failed} (de ${jobs.length} integraciones)`)
}

module.exports = { generateRrssAdvisor, runWeeklyRrssAdvisor, PLATFORMS }
