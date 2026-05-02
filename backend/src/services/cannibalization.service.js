const prisma     = require('../lib/prisma')
const Anthropic  = require('@anthropic-ai/sdk')
const { logTokens }           = require('../lib/logTokens')
const { getValidAccessToken } = require('./tokenRefresh.service')
const { querySearchConsole }  = require('./googleSearchConsole.service')
const { normalizeSiteUrl }    = require('../utils/seo')

const anthropic = new Anthropic()

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

/**
 * Calcula severidad de un conflicto de canibalización.
 * Retorna: { label: 'Alta'|'Media'|'Baja', score: 0-100 }
 */
function calcSeverity(urls, totalImpressions) {
  const positions = urls.map(u => u.position).filter(Boolean)
  const positionSpread = positions.length >= 2
    ? Math.max(...positions) - Math.min(...positions)
    : 0

  const maxCTR = Math.max(...urls.map(u => u.ctr || 0))

  const impressionsScore = Math.min(totalImpressions / 200, 40)          // 0-40
  const spreadScore      = Math.min(positionSpread * 4, 30)              // 0-30
  const urlBonus         = Math.min((urls.length - 2) * 10, 20)         // 0-20
  const ctrPenalty       = maxCTR < 0.02 ? 15 : maxCTR < 0.05 ? 8 : 0  // 0-15

  const score = Math.min(Math.round(impressionsScore + spreadScore + urlBonus + ctrPenalty), 100)

  const label = score >= 55 ? 'Alta' : score >= 25 ? 'Media' : 'Baja'
  return { label, score }
}

/**
 * Ejecuta el análisis de canibalización para un proyecto.
 * Se llama de forma async (setImmediate) desde el controller.
 */
async function runCannibalizationAnalysis(reportId, projectId, workspaceId, dateRange) {
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
      select: { websiteUrl: true, name: true },
    })
    const siteUrl = normalizeSiteUrl(integration.propertyId || project?.websiteUrl || '')
    if (!siteUrl) {
      await prisma.cannibalReport.update({
        where: { id: reportId },
        data:  { status: 'failed', errorMsg: 'No hay URL de sitio configurada' },
      })
      return
    }

    const accessToken = await getValidAccessToken(integration)
    const { startDate, endDate } = dateRangeBounds(dateRange)

    // ── 2. Consultar GSC: query + page ────────────────────────────────────────
    const rows = await querySearchConsole(accessToken, siteUrl, {
      startDate,
      endDate,
      type:       'web',
      dimensions: ['query', 'page'],
      rowLimit:   5000,
    })

    // ── 3. Agrupar por query → detectar queries con ≥ 2 URLs ─────────────────
    const byQuery = new Map()
    for (const row of rows) {
      const [query, page] = row.keys
      if (!byQuery.has(query)) byQuery.set(query, [])
      byQuery.get(query).push({
        url:         page,
        clicks:      row.clicks,
        impressions: row.impressions,
        ctr:         row.ctr,
        position:    row.position,
      })
    }

    const conflicts = []
    for (const [query, urls] of byQuery) {
      if (urls.length < 2) continue

      const totalImpressions = urls.reduce((s, u) => s + u.impressions, 0)
      const totalClicks      = urls.reduce((s, u) => s + u.clicks, 0)
      if (totalImpressions < 50) continue  // descarta queries con muy poco volumen

      const positions     = urls.map(u => u.position).filter(Boolean)
      const positionSpread = positions.length >= 2
        ? Math.max(...positions) - Math.min(...positions)
        : 0

      const { label: severity, score: severityScore } = calcSeverity(urls, totalImpressions)

      // Ordenar URLs por impresiones desc
      const urlsSorted = [...urls].sort((a, b) => b.impressions - a.impressions)

      conflicts.push({
        query,
        urls:            urlsSorted,
        severity,
        severityScore,
        totalImpressions,
        totalClicks,
        positionSpread:  Math.round(positionSpread * 10) / 10,
      })
    }

    // Ordenar por severityScore desc
    conflicts.sort((a, b) => b.severityScore - a.severityScore)

    const criticalCount = conflicts.filter(c => c.severity === 'Alta').length
    const warningCount  = conflicts.filter(c => c.severity === 'Media').length
    const lowCount      = conflicts.filter(c => c.severity === 'Baja').length
    const trafficAtRisk = conflicts
      .filter(c => c.severity === 'Alta' || c.severity === 'Media')
      .reduce((s, c) => s + c.totalImpressions, 0)

    // ── 4. Análisis IA (solo si hay conflictos) ───────────────────────────────
    let resumenGeneral = null
    if (conflicts.length > 0) {
      const top5 = conflicts.slice(0, 5).map(c => (
        `- "${c.query}": ${c.urls.length} URLs compitiendo, ` +
        `impresiones=${c.totalImpressions}, spread posiciones=${c.positionSpread}, ` +
        `severidad=${c.severity}`
      )).join('\n')

      try {
        const message = await anthropic.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `Eres un experto en SEO técnico. Analiza este resumen de canibalización de keywords del sitio "${siteUrl}":

Total de conflictos: ${conflicts.length} (Alta: ${criticalCount}, Media: ${warningCount}, Baja: ${lowCount})
Impresiones en riesgo: ${trafficAtRisk}
Período analizado: últimos ${dateRange}

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

    // ── 5. Guardar resultado ──────────────────────────────────────────────────
    await prisma.cannibalReport.update({
      where: { id: reportId },
      data:  {
        status:         'completed',
        totalConflicts: conflicts.length,
        criticalCount,
        warningCount,
        lowCount,
        trafficAtRisk,
        conflicts:      JSON.stringify(conflicts),
        resumenGeneral,
        errorMsg:       null,
        updatedAt:      new Date(),
      },
    })

    console.log(`[Cannibalization] Completado reportId=${reportId}: ${conflicts.length} conflictos`)
  } catch (err) {
    console.error('[Cannibalization] Error fatal:', err.message)
    await prisma.cannibalReport.update({
      where: { id: reportId },
      data:  { status: 'failed', errorMsg: err.message, updatedAt: new Date() },
    }).catch(() => {})
  }
}

module.exports = { runCannibalizationAnalysis }
