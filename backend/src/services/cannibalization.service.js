const prisma     = require('../lib/prisma')
const cheerio     = require('cheerio')
const { logTokens }           = require('../lib/logTokens')
const { getValidAccessToken } = require('./tokenRefresh.service')
const { querySearchConsole }  = require('./googleSearchConsole.service')
const { normalizeSiteUrl }    = require('../utils/seo')
const { fetchPublicUrl }      = require('../lib/safeUrl')
const { detectLanguage, classifyJunkUrl, groupConflicts, summarizeConflicts } = require('../lib/cannibalAnalysis')
const {
  conflictKey, postFixWindow, verifyResolution, splitByResolution, MIN_VERIFY_DAYS,
} = require('../lib/cannibalResolution')

const { anthropic, assertTokenBudget } = require('../lib/claude')

// Convierte "90d" → objeto { startDate, endDate } en YYYY-MM-DD
function dateRangeBounds(range) {
  const days = parseInt(range) || 90
  const end   = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate:   end.toISOString().slice(0, 10),
  }
}

const LANG_FETCH_MAX_URLS  = 30   // tope de páginas a fetchear (costo/latencia acotados)
const LANG_FETCH_CONCURRENCY = 5
const LANG_FETCH_TIMEOUT_MS  = 8000

/**
 * Para URLs sin prefijo de idioma reconocible en la ruta (detectLanguage ===
 * 'default'), intenta un fetch liviano de la página y lee <html lang="...">
 * como señal secundaria. Best-effort: cualquier fallo (timeout, 404, bloqueo,
 * sin atributo lang) deja la URL en 'default', nunca rompe el análisis.
 * Devuelve un Map<url, lang> solo con las URLs donde se detectó un idioma
 * distinto de 'default'.
 */
async function resolveLanguageOverrides(rows, junkUrls) {
  const byUrlImpressions = new Map()
  for (const row of rows) {
    if (junkUrls.has(row.page)) continue
    if (detectLanguage(row.page) !== 'default') continue
    byUrlImpressions.set(row.page, (byUrlImpressions.get(row.page) || 0) + row.impressions)
  }

  const candidates = [...byUrlImpressions.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, LANG_FETCH_MAX_URLS)
    .map(([url]) => url)

  const overrides = new Map()
  for (let i = 0; i < candidates.length; i += LANG_FETCH_CONCURRENCY) {
    const batch = candidates.slice(i, i + LANG_FETCH_CONCURRENCY)
    await Promise.all(batch.map(async url => {
      try {
        const res = await fetchPublicUrl(url, {
          timeout: LANG_FETCH_TIMEOUT_MS,
          headers: { 'User-Agent': 'BlissTrackerBot/1.0 (+https://blisstracker.app)' },
        })
        const $ = cheerio.load(res.data)
        const lang = ($('html').attr('lang') || '').trim().slice(0, 2).toLowerCase()
        if (lang && lang !== 'default') overrides.set(url, lang)
      } catch { /* best-effort: se queda en 'default' */ }
    }))
  }
  return overrides
}

const VERIFY_MAX_PER_RUN  = 25 // tope de consultas extra a GSC por run (latencia acotada)
const VERIFY_CONCURRENCY  = 5

/**
 * Revisa los conflictos ya marcados como resueltos que SIGUEN apareciendo en este run
 * y decide si alguno volvió de verdad.
 *
 * El reporte mira 30/90/180 días hacia atrás, así que un 301 hecho hace una semana
 * sigue produciendo el conflicto: los datos previos al arreglo están en la ventana.
 * Por eso cada resolución se verifica con una consulta propia a Search Console,
 * acotada a su keyword y a los días POSTERIORES al arreglo (ver lib/cannibalResolution.js).
 *
 * Best-effort, como el fetch de idioma: un fallo por resolución no corta el análisis.
 * Devuelve las filas vigentes (con el status ya actualizado) para aplicarlas al reporte.
 */
async function verifyResolutions({ projectId, workspaceId, accessToken, siteUrl, conflicts, endDate, rangeDays }) {
  const resolutions = await prisma.cannibalResolution.findMany({ where: { projectId, workspaceId } })
  if (resolutions.length === 0) return resolutions

  // Solo lo que todavía aparece detectado: si el conflicto ya no está en los datos,
  // no hay nada que reabrir.
  const detected = new Set(conflicts.map(c => conflictKey(c.query, c.language)))
  const pending = resolutions
    .filter(r => r.status === 'resolved' && detected.has(conflictKey(r.query, r.language)))
    .slice(0, VERIFY_MAX_PER_RUN)

  const byId = new Map(resolutions.map(r => [r.id, r]))

  for (let i = 0; i < pending.length; i += VERIFY_CONCURRENCY) {
    const batch = pending.slice(i, i + VERIFY_CONCURRENCY)
    await Promise.all(batch.map(async row => {
      try {
        const window = postFixWindow(row.resolvedAt, endDate)
        // Search Console publica con 2-3 días de atraso: sin ventana suficiente no se
        // decide nada (y no se gasta la consulta), el conflicto sigue resuelto.
        if (!window || window.days < MIN_VERIFY_DAYS) {
          const updated = await prisma.cannibalResolution.update({
            where: { id: row.id }, data: { lastCheckedAt: new Date() },
          })
          byId.set(row.id, updated)
          return
        }

        const rawRows = await querySearchConsole(accessToken, siteUrl, {
          startDate:  window.startDate,
          endDate:    window.endDate,
          type:       'web',
          dimensions: ['page'],
          dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'equals', expression: row.query }] }],
          rowLimit:   100,
        })

        let knownUrls = []
        try { knownUrls = JSON.parse(row.urls || '[]') } catch { /* ignore */ }

        const result = verifyResolution({
          rows: (rawRows || []).map(r => ({ url: r.keys[0], impressions: r.impressions, clicks: r.clicks })),
          language: row.language,
          knownUrls,
          windowDays: window.days,
          rangeDays,
        })

        const data = result.decision === 'reopen'
          ? {
              status:      'reopened',
              reopenedAt:  new Date(),
              reopenCount: { increment: 1 },
              lastCheckedAt: new Date(),
              reopenEvidence: JSON.stringify({
                from: window.startDate, to: window.endDate, days: window.days,
                totalImpressions: result.totalImpressions, urls: result.urls,
              }),
            }
          : { lastCheckedAt: new Date() }

        const updated = await prisma.cannibalResolution.update({ where: { id: row.id }, data })
        byId.set(row.id, updated)
        if (result.decision === 'reopen') {
          console.log(`[Cannibalization] Reabierto "${row.query}" (${row.language}) — ${result.urls.length} URLs compiten desde ${window.startDate}`)
        }
      } catch (err) {
        console.error(`[Cannibalization] Error verificando resolución ${row.id}:`, err.message)
      }
    }))
  }

  return [...byId.values()]
}

/**
 * Ejecuta el análisis de canibalización para un proyecto.
 * Se llama de forma async (setImmediate) desde el controller.
 */
async function runCannibalizationAnalysis(reportId, projectId, workspaceId, dateRange, language = null) {
  const updateStatus = (status, errorMsg = null) =>
    prisma.cannibalReport.update({
      where: { id: reportId },
      data:  { status, errorMsg, updatedAt: new Date() },
    })

  try {
    await updateStatus('running')

    // ── 1. Obtener integración GSC ────────────────────────────────────────────
    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'google_search_console' } },
    })
    if (!integration || integration.status !== 'active') {
      await prisma.cannibalReport.update({
        where: { id: reportId },
        data:  { status: 'failed', errorMsg: 'Search Console no conectado o inactivo' },
      })
      return
    }

    const project = await prisma.project.findUnique({
      where:  { id: projectId },
      select: { websiteUrl: true, name: true, cannibalProtectedUrls: true },
    })
    const siteUrl = normalizeSiteUrl(integration.propertyId || project?.websiteUrl || '')
    if (!siteUrl) {
      await prisma.cannibalReport.update({
        where: { id: reportId },
        data:  { status: 'failed', errorMsg: 'No hay URL de sitio configurada' },
      })
      return
    }

    let protectedUrls = []
    try { protectedUrls = JSON.parse(project?.cannibalProtectedUrls || '[]') } catch { /* ignore */ }

    const accessToken = await getValidAccessToken(integration)
    const { startDate, endDate } = dateRangeBounds(dateRange)

    // ── 2. Consultar GSC: query + page + country ──────────────────────────────
    // rowLimit subido de 5000 a 10000: la dimensión `country` multiplica filas
    // por (query,page) — sigue siendo un tope manual, no el máximo real de GSC
    // (25000); sitios muy grandes pueden seguir truncando datos.
    const rawRows = await querySearchConsole(accessToken, siteUrl, {
      startDate,
      endDate,
      type:       'web',
      dimensions: ['query', 'page', 'country'],
      rowLimit:   10000,
    })
    const rows = (rawRows || []).map(row => ({
      query:       row.keys[0],
      page:        row.keys[1],
      country:     row.keys[2],
      clicks:      row.clicks,
      impressions: row.impressions,
      ctr:         row.ctr,
      position:    row.position,
    }))

    // ── 3. Idioma por prefijo + fallback por fetch para URLs sin prefijo ──────
    const junkUrls = new Set(rows.filter(r => classifyJunkUrl(r.page)).map(r => r.page))
    const languageOverrides = await resolveLanguageOverrides(rows, junkUrls)

    // ── 4. Agrupar conflictos / hreflang / URLs indexadas por error ──────────
    const {
      conflicts, hreflangIssues, indexedByMistake,
      hreflangCount, indexedByMistakeCount,
    } = groupConflicts(rows, { protectedUrls, languageFilter: language || null, languageOverrides })

    // ── 5. Verificar lo que ya se arregló ─────────────────────────────────────
    // Los conflictos marcados como resueltos salen de los conteos y del resumen IA:
    // lo que el equipo tiene que mirar son los ABIERTOS. El JSON guarda igual TODOS
    // los detectados, así que desmarcar una resolución los devuelve a la lista sin
    // re-correr el análisis (el split se vuelve a aplicar en cada lectura, ver
    // cannibalization.controller.js `getReport`).
    const resolutions = await verifyResolutions({
      projectId, workspaceId, accessToken, siteUrl, conflicts, endDate,
      rangeDays: parseInt(dateRange) || 90,
    })
    const { open: openConflicts, resolved: resolvedConflicts } = splitByResolution(conflicts, resolutions)
    const { criticalCount, warningCount, lowCount, trafficAtRisk } = summarizeConflicts(openConflicts)

    // ── 6. Análisis IA (solo si hay conflictos abiertos) ──────────────────────
    let resumenGeneral = null
    if (openConflicts.length > 0) {
      const top5 = openConflicts.slice(0, 5).map(c => (
        `- "${c.query}": ${c.urls.length} URLs compitiendo, ` +
        `impresiones=${c.totalImpressions}, spread posiciones=${c.positionSpread}, ` +
        `severidad=${c.severity}`
      )).join('\n')

      try {
        await assertTokenBudget(workspaceId) // si se agotó el presupuesto, se omite solo el resumen IA
        const message = await anthropic.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `Eres un experto en SEO técnico. Analiza este resumen de canibalización de keywords del sitio "${siteUrl}":

Total de conflictos abiertos: ${openConflicts.length} (Alta: ${criticalCount}, Media: ${warningCount}, Baja: ${lowCount})${resolvedConflicts.length > 0 ? `
Además hay ${resolvedConflicts.length} conflicto(s) que el equipo ya marcó como resueltos (301/canonical aplicado) y que todavía aparecen en los datos porque la ventana analizada incluye días previos al arreglo — no los menciones como pendientes.` : ''}
Impresiones en riesgo: ${trafficAtRisk}
Período analizado: últimos ${dateRange}
Además se detectaron ${hreflangCount} posibles problemas de hreflang y ${indexedByMistakeCount} URLs indexadas por error (fuera de este conteo de conflictos).

Top 5 conflictos más críticos:
${top5}

Escribí un resumen ejecutivo de 2-3 oraciones explicando el impacto en el posicionamiento SEO y las prioridades de acción. Sé directo y específico. Sin bullets, solo texto corrido.`,
          }],
        })
        resumenGeneral = message.content[0].text.trim()
        logTokens('cannibalization', null, message.usage, workspaceId)
      } catch (err) {
        console.error('[Cannibalization] Error generando análisis IA:', err.message)
      }
    }

    // ── 7. Guardar resultado ──────────────────────────────────────────────────
    await prisma.cannibalReport.update({
      where: { id: reportId },
      data:  {
        status:                'completed',
        // Abiertos, no detectados: los resueltos salen del conteo (el array `conflicts`
        // de abajo igual los guarda todos).
        totalConflicts:        openConflicts.length,
        criticalCount,
        warningCount,
        lowCount,
        trafficAtRisk,
        languageFilter:        language || 'all',
        conflicts:             JSON.stringify(conflicts),
        hreflangIssues:        JSON.stringify(hreflangIssues),
        indexedByMistake:      JSON.stringify(indexedByMistake),
        hreflangCount,
        indexedByMistakeCount,
        resumenGeneral,
        errorMsg:              null,
        updatedAt:             new Date(),
      },
    })

    console.log(`[Cannibalization] Completado reportId=${reportId}: ${openConflicts.length} conflictos abiertos (${resolvedConflicts.length} resueltos), ${hreflangCount} hreflang, ${indexedByMistakeCount} indexadas por error`)
  } catch (err) {
    console.error('[Cannibalization] Error fatal:', err.message)
    await prisma.cannibalReport.update({
      where: { id: reportId },
      data:  { status: 'failed', errorMsg: err.message, updatedAt: new Date() },
    }).catch(() => {})
  }
}

module.exports = { runCannibalizationAnalysis }
