const prisma    = require('../lib/prisma')
const { MARKETING_PROJECT_WHERE } = require('../lib/projectModules')
const { fetchGA4Report, fetchAiTrafficData, isGA4PermissionDenied, computePreviousPeriod } = require('./googleAnalytics.service')
const { parseAIJson }    = require('../utils/parseAIJson')
const { logTokens }      = require('../lib/logTokens')
const { todayString, dateStringInTz } = require('../utils/dates')
const { MONTH_NAMES }    = require('../lib/monthUtils')

const { anthropic, assertTokenBudget } = require('../lib/claude')

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

/**
 * Avance de un mes contra "hoy" en la timezone del workspace.
 *
 * Existe porque el mes EN CURSO no es un mes: el 13 de noviembre, el snapshot de
 * "2026-11" tiene 13 días de datos y el de octubre tiene 31. Compararlos de
 * frente (lo que hacía el insight) daba siempre una caída inventada de ~60%.
 * Todo lo que necesita saber de eso sale de acá.
 *
 * @param {string} month      — "YYYY-MM"
 * @param {string} [timezone] — tz del workspace (default: Buenos Aires)
 * @param {string} [todayStr] — inyectable en tests ("YYYY-MM-DD")
 */
function monthProgress(month, timezone, todayStr) {
  const today        = todayStr || todayString(timezone)
  const currentMonth = today.slice(0, 7)
  const { startDate, endDate } = monthBounds(month)
  const daysInMonth  = Number(endDate.slice(8, 10))

  if (month < currentMonth) {
    return { isPartial: false, isFuture: false, daysElapsed: daysInMonth, daysInMonth, from: startDate, to: endDate }
  }
  if (month > currentMonth) {
    return { isPartial: false, isFuture: true, daysElapsed: 0, daysInMonth, from: startDate, to: endDate }
  }
  return {
    isPartial:   true,
    isFuture:    false,
    daysElapsed: Number(today.slice(8, 10)),
    daysInMonth,
    from:        startDate,
    to:          today,
  }
}

/**
 * Proyección simple a ritmo actual: lo que cerraría el mes si el resto de los
 * días se parecieran a los que ya pasaron. Es la única comparación honesta
 * contra un mes anterior COMPLETO — y por eso se rotula siempre como proyección
 * (ignora estacionalidad y la mezcla de días de semana).
 */
function projectMonthValue(value, daysElapsed, daysInMonth) {
  if (value == null || !daysElapsed || daysElapsed <= 0) return null
  if (daysElapsed >= daysInMonth) return Math.round(value)
  return Math.round((value / daysElapsed) * daysInMonth)
}

/** "1 al 13 de noviembre" / "octubre completo" — para el prompt y la UI. */
function windowLabel(from, to) {
  const [, m1, d1] = from.split('-').map(Number)
  const [, m2, d2] = to.split('-').map(Number)
  const name = n => MONTH_NAMES[n - 1].toLowerCase()
  if (m1 === m2) return `${d1} al ${d2} de ${name(m1)}`
  return `${d1} de ${name(m1)} al ${d2} de ${name(m2)}`
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
      if (!isGA4PermissionDenied(err)) console.warn('[AnalyticsSnapshot] aiTraffic fetch failed (ignorado):', err.message)
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

/** Trae la ventana comparable del mes anterior desde GA4 y la deja con la forma del snapshot. */
async function fetchBaselineWindow(integration, from, to) {
  const data = await fetchGA4Report(integration, from, to)
  return {
    from,
    to,
    days:        Number(to.slice(8, 10)),
    sessions:    Math.round(data.overview?.sessions        ?? 0),
    activeUsers: Math.round(data.overview?.activeUsers     ?? 0),
    newUsers:    Math.round(data.overview?.newUsers        ?? 0),
    pageviews:   Math.round(data.overview?.screenPageViews ?? 0),
    bounceRate:  data.overview?.bounceRate                 ?? 0,
    avgDuration: data.overview?.averageSessionDuration     ?? 0,
    conversions: data.conversions?.total                   ?? 0,
  }
}

/**
 * Genera (o regenera) un insight IA para el mes dado.
 *
 * **El mes EN CURSO no se compara contra el mes anterior completo.** Es el bug que
 * tenía esta función: el 13 de noviembre ponía en el prompt 13 días de noviembre
 * y 31 de octubre como si fueran dos meses, y la IA reportaba una caída del ~60%
 * que nunca ocurrió (las tarjetas de arriba de la pantalla ya estaban bien: GA4
 * compara "mismos días ordinales" vía `computePreviousPeriod`). Para un mes en curso:
 *
 *   1. Se **refresca el snapshot** antes de analizar — lo mantiene un cron semanal,
 *      así que podía estar días atrasado y el análisis ni siquiera cubría hasta hoy.
 *   2. La base de comparación son **los mismos días del mes anterior** (1–13 oct),
 *      traídos en vivo de GA4 con el MISMO criterio que usan las tarjetas.
 *   3. El mes anterior completo entra sólo contra una **proyección a ritmo actual**,
 *      rotulada como proyección.
 *
 * Un mes cerrado sigue el camino de siempre: snapshot vs snapshot, sin tocar GA4.
 *
 * @param {number} projectId
 * @param {number} workspaceId
 * @param {string} month  — "2026-04"
 * @returns {Promise<object>}  — { ...insight, content: parsedObject }
 */
async function generateInsight(projectId, workspaceId, month) {
  await assertTokenBudget(workspaceId) // 429 si el workspace agotó su presupuesto mensual de IA
  const pm = prevMonth(month)

  const [snapshot, previous, project, workspace] = await Promise.all([
    prisma.analyticsSnapshot.findUnique({ where: { projectId_month: { projectId, month } } }),
    prisma.analyticsSnapshot.findUnique({ where: { projectId_month: { projectId, month: pm } } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } }),
  ])

  const tz       = workspace?.timezone
  const progress = monthProgress(month, tz)

  let current  = snapshot
  let baseline = null   // mismos días del mes anterior (sólo mes en curso)

  if (progress.isPartial) {
    const integration = await prisma.projectIntegration.findUnique({
      where:  { projectId_type: { projectId, type: 'google_analytics' } },
      select: { id: true, status: true, propertyId: true, accessToken: true, refreshToken: true, expiresAt: true },
    })
    const ga4Ready = integration?.status === 'active' && !!integration.propertyId

    if (ga4Ready) {
      const refreshed = await saveMonthSnapshot(projectId, workspaceId, month)
        .catch(err => { console.warn('[AnalyticsSnapshot] no se pudo refrescar el mes en curso:', err.message); return null })
      if (refreshed) current = refreshed
    }

    if (!current) throw new Error('No hay snapshot guardado para este mes. Guardalo primero.')

    // Hasta dónde llegan de verdad los datos: si el refresco falló, el snapshot puede
    // ser de días atrás y decir "1 al 13" sería mentir sobre la ventana analizada.
    const snapDate   = dateStringInTz(current.updatedAt, tz)
    const throughDay = snapDate && snapDate >= progress.from && snapDate <= progress.to ? snapDate : progress.to
    progress.to          = throughDay
    progress.daysElapsed = Number(throughDay.slice(8, 10))

    // Con 1 solo día no hay nada comparable (la pantalla también suprime el delta ese día).
    if (ga4Ready && progress.daysElapsed >= 2) {
      const prevWindow = computePreviousPeriod(progress.from, throughDay)
      baseline = await fetchBaselineWindow(integration, prevWindow.startDate, prevWindow.endDate)
        .catch(err => { console.warn('[AnalyticsSnapshot] no se pudo traer la ventana comparable:', err.message); return null })
    }
  }

  if (!current) throw new Error('No hay snapshot guardado para este mes. Guardalo primero.')

  const monthName  = `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
  const prevName   = `${MONTH_NAMES[Number(pm.slice(5, 7)) - 1]} ${pm.slice(0, 4)}`
  const curWindow  = progress.isPartial ? windowLabel(progress.from, progress.to) : `${monthName} completo`

  const fmtBounce = v => `${(v * 100).toFixed(1)}%`
  const fmtDur    = v => `${Math.round(v)}s`

  // Contra qué se compara: la ventana equivalente si el mes está en curso, el mes
  // anterior completo si ya cerró. NUNCA 13 días contra 31.
  const comparison = progress.isPartial ? baseline : previous
  const comparisonLabel = progress.isPartial
    ? (baseline ? `${windowLabel(baseline.from, baseline.to)} (mismos ${baseline.days} días del mes anterior)` : null)
    : (previous ? `${prevName} completo` : null)

  const block = (title, d) => `${title}:
- Sesiones: ${d.sessions}
- Usuarios activos: ${d.activeUsers}
- Nuevos usuarios: ${d.newUsers}
- Páginas vistas: ${d.pageviews}
- Tasa de rebote: ${fmtBounce(d.bounceRate)}
- Duración media: ${fmtDur(d.avgDuration)}
- Eventos clave (conversiones): ${d.conversions}`

  const tendencias = comparison ? [
    { metrica: 'Sesiones',         delta: delta(current.sessions,    comparison.sessions),    positivo: delta(current.sessions, comparison.sessions) >= 0 },
    { metrica: 'Usuarios activos', delta: delta(current.activeUsers, comparison.activeUsers), positivo: delta(current.activeUsers, comparison.activeUsers) >= 0 },
    { metrica: 'Nuevos usuarios',  delta: delta(current.newUsers,    comparison.newUsers),    positivo: delta(current.newUsers, comparison.newUsers) >= 0 },
    { metrica: 'Tasa de rebote',   delta: delta(current.bounceRate,  comparison.bounceRate),  positivo: delta(current.bounceRate, comparison.bounceRate) <= 0 },
    { metrica: 'Conversiones',     delta: delta(current.conversions, comparison.conversions), positivo: delta(current.conversions, comparison.conversions) >= 0 },
  ].filter(t => t.delta !== null) : []

  // Proyección a fin de mes (sólo mes en curso): lo único comparable contra un mes cerrado.
  const projection = progress.isPartial ? {
    sessions:    projectMonthValue(current.sessions,    progress.daysElapsed, progress.daysInMonth),
    activeUsers: projectMonthValue(current.activeUsers, progress.daysElapsed, progress.daysInMonth),
    conversions: projectMonthValue(current.conversions, progress.daysElapsed, progress.daysInMonth),
  } : null

  const partialBlock = progress.isPartial ? `
AVISO IMPORTANTE — EL MES ESTÁ EN CURSO:
- Los datos de ${monthName} cubren sólo del ${curWindow} (${progress.daysElapsed} de ${progress.daysInMonth} días).
- ${comparison
    ? `La comparación de abajo es contra ${comparisonLabel}, o sea una ventana del MISMO largo. Las variaciones son válidas.`
    : `NO hay una ventana comparable disponible, así que NO compares números todavía: devolvé "tendencias": [] y decilo en el resumen.`}
- El último día puede estar incompleto (Google todavía procesa el día en curso): una baja de pocos puntos no es una tendencia.
- ${previous
    ? `Contra ${prevName} completo (${previous.sessions} sesiones, ${previous.conversions} eventos clave) comparás SÓLO la proyección: a este ritmo ${monthName} cerraría en ~${projection?.sessions ?? '?'} sesiones y ~${projection?.conversions ?? '?'} eventos clave. Es una proyección simple (no considera estacionalidad): usala con esa palabra.`
    : `No hay datos de ${prevName} para comparar.`}
- PROHIBIDO decir que el mes "cayó" o "bajó" comparando un mes incompleto contra un mes completo.
` : ''

  const prompt = `Sos un analista de marketing digital. Analizá los datos de Google Analytics del proyecto "${project.name}" para ${monthName}.
${partialBlock}
${block(`Datos de ${monthName} (${curWindow})`, current)}
- Canales principales: ${current.topChannels}

${comparison ? block(`Datos de referencia — ${comparisonLabel}`, comparison) : `No hay datos de referencia para comparar.`}

${tendencias.length > 0 ? `Variaciones calculadas (ventanas equivalentes):
${tendencias.map(t => `- ${t.metrica}: ${t.delta > 0 ? '+' : ''}${t.delta}% (${t.positivo ? 'positivo' : 'negativo'})`).join('\n')}` : ''}

Respondé SOLO con un JSON válido, sin markdown ni explicaciones:
{
  "titulo": "Título corto y descriptivo (máx 65 caracteres)",
  "resumen": "2-3 oraciones sobre el estado general. Mencioná lo más importante.${progress.isPartial ? ' Aclará que el mes está en curso y qué período cubre.' : ''}",
  "tendencias": [
    { "metrica": "nombre", "delta": número_o_null, "positivo": true/false }
  ],
  "recomendaciones": [
    "Recomendación concreta y accionable (mencioná números cuando sea posible)"
  ]
}

Incluí ${tendencias.length > 0 ? `las ${tendencias.length}` : 'las'} tendencias principales y 2-3 recomendaciones accionables.`

  const response = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 700,
    messages:   [{ role: 'user', content: prompt }],
  })

  // logTokens es posicional: (service, userId, usage, workspaceId). Antes se llamaba con
  // forma de objeto → usage venía undefined y estos tokens NUNCA se contabilizaban.
  await logTokens('analyticsInsight', null, response.usage, workspaceId)
    .catch(err => console.error('[AnalyticsSnapshot] Error al registrar tokens de IA:', err.message))

  const parsed = parseAIJson(response.content[0].text)

  // `periodo` viaja con el insight para que la pantalla pueda rotular QUÉ se analizó.
  // Sin esto, un análisis del mes en curso generado el día 5 y leído el día 20 se lee
  // como si fuera el mes entero.
  parsed.periodo = {
    mes:         month,
    etiqueta:    monthName,
    parcial:     progress.isPartial,
    desde:       progress.from,
    hasta:       progress.to,
    dias:        progress.daysElapsed,
    diasDelMes:  progress.daysInMonth,
    comparado:   comparison
      ? { desde: comparison.from ?? `${pm}-01`, hasta: comparison.to ?? monthBounds(pm).endDate, etiqueta: comparisonLabel }
      : null,
    proyeccion:  projection,
    mesAnterior: previous ? { mes: pm, etiqueta: prevName, sessions: previous.sessions, conversions: previous.conversions } : null,
  }

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
    where:  { type: 'google_analytics', status: 'active', propertyId: { not: null }, project: { active: true, ...MARKETING_PROJECT_WHERE } },
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
    where:  { type: 'google_analytics', status: 'active', propertyId: { not: null }, project: { active: true, ...MARKETING_PROJECT_WHERE } },
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
  monthProgress,
  projectMonthValue,
  windowLabel,
  saveAllPreviousMonthSnapshots,
  saveCurrentMonthSnapshotSafe,
  refreshAllCurrentMonthSnapshots,
}
