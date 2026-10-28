const prisma     = require('../lib/prisma')
const cheerio     = require('cheerio')
const { logTokens }           = require('../lib/logTokens')
const { getValidAccessToken } = require('./tokenRefresh.service')
const { querySearchConsole }  = require('./googleSearchConsole.service')
const { normalizeSiteUrl }    = require('../utils/seo')
const { fetchPublicUrl }      = require('../lib/safeUrl')
const { detectLanguage, classifyJunkUrl, groupConflicts } = require('../lib/cannibalAnalysis')

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
      criticalCount, warningCount, lowCount, trafficAtRisk,
      hreflangCount, indexedByMistakeCount,
    } = groupConflicts(rows, { protectedUrls, languageFilter: language || null, languageOverrides })

    // ── 5. Análisis IA (solo si hay conflictos) ───────────────────────────────
    let resumenGeneral = null
    if (conflicts.length > 0) {
      const top5 = conflicts.slice(0, 5).map(c => (
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

Total de conflictos: ${conflicts.length} (Alta: ${criticalCount}, Media: ${warningCount}, Baja: ${lowCount})
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

    // ── 6. Guardar resultado ──────────────────────────────────────────────────
    await prisma.cannibalReport.update({
      where: { id: reportId },
      data:  {
        status:                'completed',
        totalConflicts:        conflicts.length,
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

    console.log(`[Cannibalization] Completado reportId=${reportId}: ${conflicts.length} conflictos, ${hreflangCount} hreflang, ${indexedByMistakeCount} indexadas por error`)
  } catch (err) {
    console.error('[Cannibalization] Error fatal:', err.message)
    await prisma.cannibalReport.update({
      where: { id: reportId },
      data:  { status: 'failed', errorMsg: err.message, updatedAt: new Date() },
    }).catch(() => {})
  }
}

module.exports = { runCannibalizationAnalysis }
