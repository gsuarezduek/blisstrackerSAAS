const prisma = require('../../lib/prisma')
const { getSettings } = require('../../lib/platformSettings')
const { DEFAULT_TZ } = require('../../utils/dates')

// Pricing de Claude Haiku — funciones puras; los costos vienen de PlatformSetting.
function calcTokenCost(inputTokens, outputTokens, costs) {
  return (inputTokens / 1_000_000) * costs.haikuInputCostPer1M
       + (outputTokens / 1_000_000) * costs.haikuOutputCostPer1M
}

/**
 * GET /api/superadmin/ai-tokens
 * Estadísticas de uso de tokens de IA.
 * Query params:
 *   ?period=all|30d|7d  (default: all)
 */
async function getAiTokenStats(req, res, next) {
  try {
    const { period = 'all' } = req.query
    let dateFilter = {}
    if (period === '30d') {
      const from = new Date(); from.setDate(from.getDate() - 30)
      dateFilter = { createdAt: { gte: from } }
    } else if (period === '7d') {
      const from = new Date(); from.setDate(from.getDate() - 7)
      dateFilter = { createdAt: { gte: from } }
    }

    const costs = await getSettings(['haikuInputCostPer1M', 'haikuOutputCostPer1M'])

    const [globalByService, workspaces, byWorkspaceAndService, dailySeries] = await Promise.all([
      // Totales globales agrupados por servicio
      prisma.aiTokenLog.groupBy({
        by: ['service'],
        where: dateFilter,
        _sum: { inputTokens: true, outputTokens: true },
        orderBy: { _sum: { inputTokens: 'desc' } },
      }),

      // Info de todos los workspaces (para enriquecer resultados)
      prisma.workspace.findMany({
        select: { id: true, name: true, slug: true, status: true },
      }),

      // Totales por workspace + servicio
      prisma.aiTokenLog.groupBy({
        by: ['workspaceId', 'service'],
        where: dateFilter,
        _sum: { inputTokens: true, outputTokens: true },
      }),

      // Serie diaria (últimos 30 días siempre) para el gráfico de evolución
      prisma.aiTokenLog.groupBy({
        by: ['service'],
        where: { createdAt: { gte: (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d })() } },
        _sum: { inputTokens: true, outputTokens: true },
      }),
    ])

    const wsMap = Object.fromEntries(workspaces.map(w => [w.id, w]))

    // Calcular totales globales
    const totalInput  = globalByService.reduce((s, r) => s + (r._sum.inputTokens  || 0), 0)
    const totalOutput = globalByService.reduce((s, r) => s + (r._sum.outputTokens || 0), 0)

    // Armar breakdown por servicio
    const byService = globalByService.map(r => ({
      service:       r.service,
      inputTokens:   r._sum.inputTokens  || 0,
      outputTokens:  r._sum.outputTokens || 0,
      total:         (r._sum.inputTokens || 0) + (r._sum.outputTokens || 0),
      estimatedCost: calcTokenCost(r._sum.inputTokens || 0, r._sum.outputTokens || 0, costs),
    }))

    // Agrupar por workspace
    const byWorkspaceMap = {}
    for (const row of byWorkspaceAndService) {
      const wid = row.workspaceId
      if (!byWorkspaceMap[wid]) {
        byWorkspaceMap[wid] = {
          workspaceId:   wid,
          name:          wsMap[wid]?.name  ?? `Workspace #${wid}`,
          slug:          wsMap[wid]?.slug  ?? '',
          status:        wsMap[wid]?.status ?? 'unknown',
          inputTokens:   0,
          outputTokens:  0,
          total:         0,
          estimatedCost: 0,
          byService:     [],
        }
      }
      const inp  = row._sum.inputTokens  || 0
      const out  = row._sum.outputTokens || 0
      byWorkspaceMap[wid].inputTokens  += inp
      byWorkspaceMap[wid].outputTokens += out
      byWorkspaceMap[wid].total        += inp + out
      byWorkspaceMap[wid].estimatedCost += calcTokenCost(inp, out, costs)
      byWorkspaceMap[wid].byService.push({
        service:       row.service,
        inputTokens:   inp,
        outputTokens:  out,
        total:         inp + out,
        estimatedCost: calcTokenCost(inp, out, costs),
      })
    }

    // Incluir workspaces sin uso (total = 0) no tiene sentido, solo los que tienen logs
    const byWorkspace = Object.values(byWorkspaceMap)
      .sort((a, b) => b.total - a.total)

    res.json({
      period,
      totalInputTokens:  totalInput,
      totalOutputTokens: totalOutput,
      totalTokens:       totalInput + totalOutput,
      estimatedCostUsd:  calcTokenCost(totalInput, totalOutput, costs),
      byService,
      byWorkspace,
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/whatsapp-usage?month=YYYY-MM
 * Uso de WhatsApp por workspace/mes (Fase 6 del plan) — mirror de
 * getAiTokenStats. El costo es una ESTIMACIÓN simple (costo fijo por
 * plantilla × cantidad enviada) porque Meta cobra por conversación con
 * precio variable por país/categoría, no expone eso vía la API del BSP —
 * ver PlatformSetting `whatsappTemplateCostUsd`. Con el setting en 0
 * (default, "sin configurar") no se calcula costo, solo volumen.
 */
async function getWhatsappUsageStats(req, res, next) {
  try {
    const { computeAllWorkspacesWhatsappUsage } = require('../../services/whatsappUsage.service')
    const { todayString } = require('../../utils/dates')
    const month = req.query.month || todayString(DEFAULT_TZ).slice(0, 7)

    const [rows, { whatsappTemplateCostUsd: costPerTemplate }, workspaces] = await Promise.all([
      computeAllWorkspacesWhatsappUsage(month),
      getSettings(['whatsappTemplateCostUsd']),
      prisma.workspace.findMany({ select: { id: true, name: true, slug: true, status: true } }),
    ])
    const wsMap = Object.fromEntries(workspaces.map(w => [w.id, w]))

    const byWorkspace = rows
      .map(r => ({
        ...r,
        name: wsMap[r.workspaceId]?.name ?? `Workspace #${r.workspaceId}`,
        slug: wsMap[r.workspaceId]?.slug ?? '',
        status: wsMap[r.workspaceId]?.status ?? 'unknown',
        estimatedCostUsd: Math.round(r.templatesSent * costPerTemplate * 100) / 100,
      }))
      .sort((a, b) => b.templatesSent - a.templatesSent)

    const totals = byWorkspace.reduce((acc, w) => ({
      messagesIn: acc.messagesIn + w.messagesIn,
      messagesOut: acc.messagesOut + w.messagesOut,
      templatesSent: acc.templatesSent + w.templatesSent,
      conversationsActive: acc.conversationsActive + w.conversationsActive,
      estimatedCostUsd: Math.round((acc.estimatedCostUsd + w.estimatedCostUsd) * 100) / 100,
    }), { messagesIn: 0, messagesOut: 0, templatesSent: 0, conversationsActive: 0, estimatedCostUsd: 0 })

    res.json({ month, costPerTemplate, totals, byWorkspace })
  } catch (err) { next(err) }
}

module.exports = { getAiTokenStats, getWhatsappUsageStats }
