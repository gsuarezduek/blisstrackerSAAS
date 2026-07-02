const Anthropic = require('@anthropic-ai/sdk')
const prisma    = require('../lib/prisma')
const { fetchGA4Report, fetchAiTrafficData } = require('./googleAnalytics.service')
const { parseAIJson }    = require('../utils/parseAIJson')
const { logTokens }      = require('../lib/logTokens')
const { todayString }    = require('../utils/dates')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function delta(curr, prev) {
  if (prev == null || prev === 0) return null
  return Math.round(((curr - prev) / prev) * 100)
}

// ─── Guardar snapshot ─────────────────────────────────────────────────────────

/**
 * Guarda (o actualiza) el snapshot mensual de un proyecto para un mes dado.
 * @param {number} projectId
 * @param {number} workspaceId
 * @param {string} month  — "2026-04"
 * @returns {Promise<object|null>}
 */
async function saveMonthSnapshot(projectId, workspaceId, month) {
  const integration = await prisma.projectIntegration.findUnique({
    where:  { projectId_type: { projectId, type: 'google_analytics' } },
    select: { id: true, status: true, propertyId: true, accessToken: true, refreshToken: true, expiresAt: true },
  })
  if (!integration || integration.status !== 'active' || !integration.propertyId) return null

  const { startDate, endDate } = monthBounds(month)

  // Fetch GA4 overview + AI traffic en paralelo
  const [data, aiTrafficRaw] = await Promise.all([
    fetchGA4Report(integration, startDate, endDate),
    fetchAiTrafficData(integration, startDate, endDate).catch(err => {
      console.warn('[AnalyticsSnapshot] aiTraffic fetch failed (ignorado):', err.message)
      return {}
    }),
  ])

  const payload = {
    sessions:    Math.round(data.overview?.sessions             ?? 0),
    activeUsers: Math.round(data.overview?.activeUsers          ?? 0),
    newUsers:    Math.round(data.overview?.newUsers             ?? 0),
    pageviews:   Math.round(data.overview?.screenPageViews      ?? 0),
    bounceRate:  data.overview?.bounceRate                      ?? 0,
    avgDuration: data.overview?.averageSessionDuration          ?? 0,
    conversions: data.conversions?.total                        ?? 0,
    topChannels: JSON.stringify((data.channels ?? []).slice(0, 5)),
    topPages:    JSON.stringify((data.topPages ?? []).slice(0, 10)),
    topSources:  JSON.stringify((data.trafficSources ?? []).slice(0, 10)),
    aiTraffic:   JSON.stringify(aiTrafficRaw),
  }

  return prisma.analyticsSnapshot.upsert({
    where:  { projectId_month: { projectId, month } },
    create: { workspaceId, projectId, month, ...payload },
    update: { ...payload, updatedAt: new Date() },
  })
}

// ─── Generar insight IA ───────────────────────────────────────────────────────

/**
 * Genera (o regenera) un insight IA para el mes dado, usando el snapshot actual
 * y el del mes anterior como contexto de comparación.
 * @param {number} projectId
 * @param {number} workspaceId
 * @param {string} month  — "2026-04"
 * @returns {Promise<object>}  — { ...insight, content: parsedObject }
 */
async function generateInsight(projectId, workspaceId, month) {
  const pm = prevMonth(month)

  const [current, previous, project] = await Promise.all([
    prisma.analyticsSnapshot.findUnique({ where: { projectId_month: { projectId, month } } }),
    prisma.analyticsSnapshot.findUnique({ where: { projectId_month: { projectId, month: pm } } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
  ])

  if (!current) throw new Error('No hay snapshot guardado para este mes. Guardalo primero.')

  const [mY, mM] = month.split('-')
  const monthLabel = new Date(Number(mY), Number(mM) - 1, 1)
    .toLocaleString('es-AR', { month: 'long', year: 'numeric' })

  const prevLabel = previous
    ? (() => {
        const [py, pm2] = pm.split('-')
        return new Date(Number(py), Number(pm2) - 1, 1)
          .toLocaleString('es-AR', { month: 'long', year: 'numeric' })
      })()
    : null

  const fmtBounce = v => `${(v * 100).toFixed(1)}%`
  const fmtDur    = v => `${Math.round(v)}s`

  const compBlock = previous
    ? `Datos del mes anterior (${prevLabel}):
- Sesiones: ${previous.sessions}
- Usuarios activos: ${previous.activeUsers}
- Nuevos usuarios: ${previous.newUsers}
- Páginas vistas: ${previous.pageviews}
- Tasa de rebote: ${fmtBounce(previous.bounceRate)}
- Duración media: ${fmtDur(previous.avgDuration)}
- Conversiones: ${previous.conversions}`
    : 'No hay datos del mes anterior para comparar.'

  const tendencias = [
    { metrica: 'Sesiones',         delta: delta(current.sessions,    previous?.sessions),    positivo: delta(current.sessions, previous?.sessions) >= 0 },
    { metrica: 'Usuarios activos', delta: delta(current.activeUsers, previous?.activeUsers), positivo: delta(current.activeUsers, previous?.activeUsers) >= 0 },
    { metrica: 'Nuevos usuarios',  delta: delta(current.newUsers,    previous?.newUsers),    positivo: delta(current.newUsers, previous?.newUsers) >= 0 },
    { metrica: 'Tasa de rebote',   delta: delta(current.bounceRate,  previous?.bounceRate),  positivo: delta(current.bounceRate, previous?.bounceRate) <= 0 },
    { metrica: 'Conversiones',     delta: delta(current.conversions, previous?.conversions), positivo: delta(current.conversions, previous?.conversions) >= 0 },
  ].filter(t => t.delta !== null)

  const prompt = `Sos un analista de marketing digital. Analizá los datos de Google Analytics del proyecto "${project.name}" para ${monthLabel}.

Datos de ${monthLabel}:
- Sesiones: ${current.sessions}
- Usuarios activos: ${current.activeUsers}
- Nuevos usuarios: ${current.newUsers}
- Páginas vistas: ${current.pageviews}
- Tasa de rebote: ${fmtBounce(current.bounceRate)}
- Duración media de sesión: ${fmtDur(current.avgDuration)}
- Conversiones: ${current.conversions}
- Canales principales: ${current.topChannels}

${compBlock}

${tendencias.length > 0 ? `Variaciones calculadas respecto al mes anterior:
${tendencias.map(t => `- ${t.metrica}: ${t.delta > 0 ? '+' : ''}${t.delta}% (${t.positivo ? 'positivo' : 'negativo'})`).join('\n')}` : ''}

Respondé SOLO con un JSON válido, sin markdown ni explicaciones:
{
  "titulo": "Título corto y descriptivo (máx 65 caracteres)",
  "resumen": "2-3 oraciones sobre el estado general. Mencioná lo más importante.",
  "tendencias": [
    { "metrica": "nombre", "delta": número_o_null, "positivo": true/false }
  ],
  "recomendaciones": [
    "Recomendación concreta y accionable (mencioná números cuando sea posible)"
  ]
}

Incluí las ${tendencias.length > 0 ? tendencias.length : '3-5'} tendencias principales y 2-3 recomendaciones accionables.`

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 700,
    messages:   [{ role: 'user', content: prompt }],
  })

  await logTokens({
    workspaceId,
    service:      'analyticsInsight',
    model:        'claude-haiku-4-5-20251001',
    inputTokens:  response.usage?.input_tokens  ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  }).catch(err => console.error('[AnalyticsSnapshot] Error al registrar tokens de IA:', err.message))

  const parsed = parseAIJson(response.content[0].text)

  const saved = await prisma.analyticsInsight.upsert({
    where:  { projectId_month: { projectId, month } },
    create: { workspaceId, projectId, month, content: JSON.stringify(parsed) },
    update: { content: JSON.stringify(parsed), generatedAt: new Date() },
  })

  return { ...saved, content: parsed }
}

// ─── Auto-guardado al conectar ───────────────────────────────────────────────

/**
 * Guarda el snapshot del MES EN CURSO de un proyecto de forma segura (fire-and-forget).
 * Nunca lanza ni bloquea: se dispara vía setImmediate y aísla todo error en un warn.
 * No-op si GA4 no está activo o no tiene propertyId (saveMonthSnapshot devuelve null).
 * Se llama al conectar/actualizar GA4 para que el proyecto no quede "sin datos" en la
 * lista cross-proyecto hasta que corra el cron (semanal o mensual).
 * @param {number} projectId
 * @param {number} workspaceId
 * @param {string} [timezone]  — si no se pasa, se resuelve desde el workspace.
 */
function saveCurrentMonthSnapshotSafe(projectId, workspaceId, timezone) {
  setImmediate(async () => {
    try {
      const tz = timezone || (await prisma.workspace.findUnique({
        where:  { id: workspaceId },
        select: { timezone: true },
      }))?.timezone
      const month = todayString(tz).slice(0, 7)
      const snap  = await saveMonthSnapshot(projectId, workspaceId, month)
      if (snap) console.log(`[AnalyticsSnapshot] Auto-snapshot ${month} guardado (proyecto ${projectId}).`)
    } catch (err) {
      console.warn(`[AnalyticsSnapshot] Auto-snapshot falló (proyecto ${projectId}):`, err.message)
    }
  })
}

// ─── Cron: guardar snapshots del mes anterior ────────────────────────────────

/**
 * Ejecutado el 1° de cada mes: guarda el snapshot del mes que acaba de cerrar
 * para todos los proyectos con GA4 activo.
 */
async function saveAllPreviousMonthSnapshots() {
  const now  = new Date()
  const month = prevMonth(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  )

  const integrations = await prisma.projectIntegration.findMany({
    where:  { type: 'google_analytics', status: 'active', propertyId: { not: null } },
    select: { projectId: true, workspaceId: true },
  })

  console.log(`[AnalyticsSnapshot] Guardando snapshot de ${month} para ${integrations.length} proyecto(s)...`)
  let saved = 0
  for (const { projectId, workspaceId } of integrations) {
    try {
      await saveMonthSnapshot(projectId, workspaceId, month)
      saved++
    } catch (err) {
      console.error(`[AnalyticsSnapshot] Error en proyecto ${projectId}:`, err.message)
    }
  }
  console.log(`[AnalyticsSnapshot] ${saved}/${integrations.length} snapshots guardados.`)
}

/**
 * Cron semanal (lunes): refresca el snapshot del MES EN CURSO de todos los proyectos
 * con GA4 activo. Mantiene la lista cross-proyecto al día entre el 1° (cron mensual, que
 * cierra el mes anterior) y el fin del mes en curso, y evita que un proyecto recién
 * conectado quede en "sin datos". No consume tokens de IA (solo pega a GA4).
 * El mes se calcula por la timezone de cada workspace.
 */
async function refreshAllCurrentMonthSnapshots() {
  const integrations = await prisma.projectIntegration.findMany({
    where:  { type: 'google_analytics', status: 'active', propertyId: { not: null } },
    select: { projectId: true, workspaceId: true, workspace: { select: { timezone: true } } },
  })

  console.log(`[AnalyticsSnapshot] Refrescando snapshot del mes en curso para ${integrations.length} proyecto(s)...`)
  let saved = 0
  for (const { projectId, workspaceId, workspace } of integrations) {
    try {
      const month = todayString(workspace?.timezone).slice(0, 7)
      await saveMonthSnapshot(projectId, workspaceId, month)
      saved++
    } catch (err) {
      console.error(`[AnalyticsSnapshot] Error refrescando proyecto ${projectId}:`, err.message)
    }
  }
  console.log(`[AnalyticsSnapshot] ${saved}/${integrations.length} snapshots del mes en curso refrescados.`)
}

module.exports = {
  saveMonthSnapshot,
  generateInsight,
  saveAllPreviousMonthSnapshots,
  saveCurrentMonthSnapshotSafe,
  refreshAllCurrentMonthSnapshots,
}
