const prisma = require('../../lib/prisma')
const { toDecimal } = require('../../lib/financeMoney')
const { parseDate } = require('./_shared')

/**
 * GET /api/finanzas/summary/breakdown?month=YYYY-MM&currency=ARS — sección
 * 4.3: "Gastos por categoría" / "Ingresos por categoría" del mes, por moneda.
 * Transferencias y valuaciones no entran (son modelos aparte, ni se
 * consultan). Los egresos de "Impuestos bancarios" generados por un impuesto
 * SÍ entran — son egresos reales, categorizados igual que cualquier otro.
 */
async function getBreakdown(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { month, currency = 'ARS' } = req.query
    if (!/^\d{4}-\d{2}$/.test(month || '')) return res.status(400).json({ error: 'Mes inválido (YYYY-MM)' })
    const [y, m] = month.split('-').map(Number)
    const from = new Date(Date.UTC(y, m - 1, 1))
    const to = new Date(Date.UTC(y, m, 1)) // primer día del mes siguiente (límite exclusivo)

    const movements = await prisma.financeMovement.findMany({
      where: { workspaceId, deletedAt: null, date: { gte: from, lt: to }, account: { currency } },
      select: { type: true, amount: true, categoryId: true, category: { select: { name: true } } },
    })

    function buildBreakdown(type) {
      const byCategory = new Map()
      let total = toDecimal(0)
      for (const mv of movements) {
        if (mv.type !== type) continue
        const amt = toDecimal(mv.amount)
        total = total.plus(amt)
        const entry = byCategory.get(mv.categoryId) || { categoryId: mv.categoryId, name: mv.category.name, amount: toDecimal(0) }
        entry.amount = entry.amount.plus(amt)
        byCategory.set(mv.categoryId, entry)
      }
      const rows = [...byCategory.values()]
        .map(e => ({
          categoryId: e.categoryId, name: e.name, amount: e.amount.toString(),
          pct: total.isZero() ? 0 : e.amount.dividedBy(total).times(100).toDecimalPlaces(1).toNumber(),
        }))
        .sort((a, b) => Number(b.amount) - Number(a.amount))
      return { total: total.toString(), rows }
    }

    res.json({ month, currency, income: buildBreakdown('income'), expense: buildBreakdown('expense') })
  } catch (err) { next(err) }
}

/**
 * GET /api/finanzas/summary/chart?from=&to=&currency=ARS — gráfico de barras
 * agrupadas ingresos vs. egresos por mes, con su propio filtro de fechas.
 */
async function getChart(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { currency = 'ARS' } = req.query
    const fromDate = parseDate(req.query.from)
    const toDate = parseDate(req.query.to)
    if (fromDate === undefined || toDate === undefined) return res.status(400).json({ error: 'Fecha inválida' })

    const movements = await prisma.financeMovement.findMany({
      where: {
        workspaceId, deletedAt: null, account: { currency },
        ...(fromDate || toDate ? { date: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}),
      },
      select: { type: true, amount: true, date: true },
    })

    const byMonth = new Map()
    for (const mv of movements) {
      const key = mv.date.toISOString().slice(0, 7)
      const entry = byMonth.get(key) || { month: key, income: toDecimal(0), expense: toDecimal(0) }
      entry[mv.type] = entry[mv.type].plus(toDecimal(mv.amount))
      byMonth.set(key, entry)
    }
    const series = [...byMonth.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(e => ({ month: e.month, income: e.income.toString(), expense: e.expense.toString(), diff: e.income.minus(e.expense).toString() }))

    res.json({ series, currency })
  } catch (err) { next(err) }
}

module.exports = { getBreakdown, getChart }
