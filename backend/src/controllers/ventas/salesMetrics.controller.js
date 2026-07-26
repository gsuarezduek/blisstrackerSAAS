const prisma = require('../../lib/prisma')
const { todayString } = require('../../utils/dates')
const { LEAD_STATUSES } = require('../../lib/salesCatalog')

const PROB = Object.fromEntries(LEAD_STATUSES.map(s => [s.key, s.prob]))
const isOpen = status => { const m = LEAD_STATUSES.find(s => s.key === status); return m && !m.isWon && !m.isLost }

function monthStart(tz) {
  const [y, m] = todayString(tz).slice(0, 7).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1))
}

// GET /api/ventas/metrics — forecast del pipeline + métricas comerciales (todo derivado, sin persistir).
async function getMetrics(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const mStart = monthStart(tz)

    const leads = await prisma.lead.findMany({
      where: { workspaceId },
      select: {
        id: true, status: true, estimatedValue: true, currency: true, origin: true,
        ownerId: true, createdAt: true, wonAt: true, lostAt: true,
        owner: { select: { id: true, name: true, avatar: true } },
      },
    })

    const val = l => (l.estimatedValue != null ? Number(l.estimatedValue) : 0)

    // Forecast + funnel por etapa (solo abiertos para pipeline/forecast).
    let pipelineValue = 0, weightedForecast = 0
    const byStage = LEAD_STATUSES.map(s => ({ key: s.key, label: s.label, count: 0, value: 0 }))
    const stageIdx = Object.fromEntries(byStage.map((s, i) => [s.key, i]))

    // Cierres (win rate, ciclo, ticket promedio) + este mes.
    let wonCount = 0, lostCount = 0, wonValueSum = 0, wonValueN = 0, cycleSum = 0, cycleN = 0
    let wonThisMonth = 0, lostThisMonth = 0, wonValueThisMonth = 0

    // Agregados por responsable y por origen.
    const owners = new Map() // ownerId → { id, name, avatar, openCount, openValue, wonCount, wonValue }
    const origins = new Map() // origin → { origin, count, won }

    for (const l of leads) {
      const v = val(l)
      const bi = stageIdx[l.status]
      if (bi != null) { byStage[bi].count++; byStage[bi].value += v }

      if (isOpen(l.status)) {
        pipelineValue += v
        weightedForecast += v * ((PROB[l.status] ?? 0) / 100)
      }
      if (l.wonAt) {
        wonCount++; if (v) { wonValueSum += v; wonValueN++ }
        cycleSum += (new Date(l.wonAt) - new Date(l.createdAt)) / 86400000; cycleN++
        if (l.wonAt >= mStart) { wonThisMonth++; wonValueThisMonth += v }
      }
      if (l.lostAt) { lostCount++; if (l.lostAt >= mStart) lostThisMonth++ }

      // Por responsable
      if (l.ownerId) {
        if (!owners.has(l.ownerId)) owners.set(l.ownerId, { id: l.ownerId, name: l.owner?.name || '—', avatar: l.owner?.avatar, openCount: 0, openValue: 0, wonCount: 0, wonValue: 0 })
        const o = owners.get(l.ownerId)
        if (isOpen(l.status)) { o.openCount++; o.openValue += v }
        if (l.wonAt) { o.wonCount++; o.wonValue += v }
      }

      // Por origen
      const ok = l.origin || 'otro'
      if (!origins.has(ok)) origins.set(ok, { origin: ok, count: 0, won: 0 })
      const og = origins.get(ok); og.count++; if (l.wonAt) og.won++
    }

    const closed = wonCount + lostCount

    // Moneda mostrada en el resumen: la más usada entre los leads con presupuesto
    // cargado — no la del primer lead encontrado, que podía quedar en el default
    // (USD) aunque la enorme mayoría de los presupuestos reales esté en otra
    // moneda, mostrando una etiqueta que no corresponde a los montos sumados.
    const currencyCounts = new Map()
    for (const l of leads) {
      if (l.estimatedValue == null) continue
      currencyCounts.set(l.currency, (currencyCounts.get(l.currency) || 0) + 1)
    }
    let currency = 'ARS'
    let bestCount = 0
    for (const [c, n] of currencyCounts) {
      if (n > bestCount) { currency = c; bestCount = n }
    }

    res.json({
      currency,
      pipelineValue,
      weightedForecast: Math.round(weightedForecast),
      openCount: leads.filter(l => isOpen(l.status)).length,
      winRate: closed ? Math.round((wonCount / closed) * 100) : null,
      avgDealSize: wonValueN ? Math.round(wonValueSum / wonValueN) : null,
      avgCycleDays: cycleN ? Math.round(cycleSum / cycleN) : null,
      wonThisMonth, lostThisMonth, wonValueThisMonth,
      byStage,
      byOwner: [...owners.values()].sort((a, b) => b.openValue - a.openValue),
      byOrigin: [...origins.values()].sort((a, b) => b.count - a.count),
    })
  } catch (err) { next(err) }
}

module.exports = { getMetrics }
