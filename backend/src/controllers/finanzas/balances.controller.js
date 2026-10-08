const prisma = require('../../lib/prisma')
const { toDecimal } = require('../../lib/financeMoney')
const { parseDate } = require('./_shared')

/**
 * GET /api/finanzas/balances?from=&to= — sección 4.2 del spec.
 *
 * `Ingresos`/`Egresos`/`Internos` por cuenta son del PERÍODO (filtro desde/
 * hasta, como en Ingresos/Egresos). `Disponible`/`En fondos`/`Cheques en
 * cartera` son el saldo ACTUAL (todo el histórico, no acotado al período) —
 * mismo criterio que un resumen bancario real: podés ver la actividad de un
 * mes junto al saldo corriente de hoy.
 *
 * Disponible (3.1) = saldo_inicial + ingresos − egresos ± transferencias
 * (excluyendo `toIsFund`/`fromIsFund`, que son fondos, no disponible), sin
 * contar movimientos de cheques todavía `pending` (al acreditar, el
 * movimiento se actualiza a la fecha/cuenta real — ver checks.controller.js
 * `creditCheck` — así que acá "pending" es el único caso a excluir).
 *
 * Fondos (3.1) = el `value` de la última FinanceFundValuation registrada (es
 * un snapshot absoluto, no un delta) — si todavía no hay ninguna, aportes −
 * rescates acumulados (sin resultado de valuación todavía).
 */
async function getBalances(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const fromDate = parseDate(req.query.from)
    const toDate = parseDate(req.query.to)
    if (fromDate === undefined || toDate === undefined) return res.status(400).json({ error: 'Fecha inválida' })
    const periodDateFilter = (fromDate || toDate)
      ? { date: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
      : {}

    const accounts = await prisma.financeAccount.findMany({ where: { workspaceId, active: true }, orderBy: { name: 'asc' } })

    const accountResults = await Promise.all(accounts.map(async (account) => {
      const [
        incomePeriodAgg, expensePeriodAgg, transfersInPeriodAgg, transfersOutPeriodAgg,
        allTimeIncomeAgg, allTimeExpenseAgg, allTimeTransfersInAgg, allTimeTransfersOutAgg,
        lastValuation, aportesAgg, rescatesAgg, pendingChecksAgg,
      ] = await Promise.all([
        prisma.financeMovement.aggregate({ where: { workspaceId, accountId: account.id, type: 'income', deletedAt: null, ...periodDateFilter }, _sum: { amount: true } }),
        prisma.financeMovement.aggregate({ where: { workspaceId, accountId: account.id, type: 'expense', deletedAt: null, ...periodDateFilter }, _sum: { amount: true } }),
        prisma.financeTransfer.aggregate({ where: { workspaceId, toAccountId: account.id, toIsFund: false, deletedAt: null, ...periodDateFilter }, _sum: { toAmount: true } }),
        prisma.financeTransfer.aggregate({ where: { workspaceId, fromAccountId: account.id, fromIsFund: false, deletedAt: null, ...periodDateFilter }, _sum: { fromAmount: true } }),
        prisma.financeMovement.aggregate({
          where: { workspaceId, accountId: account.id, type: 'income', deletedAt: null, NOT: { check: { status: 'pending' } } },
          _sum: { amount: true },
        }),
        prisma.financeMovement.aggregate({ where: { workspaceId, accountId: account.id, type: 'expense', deletedAt: null }, _sum: { amount: true } }),
        prisma.financeTransfer.aggregate({ where: { workspaceId, toAccountId: account.id, toIsFund: false, deletedAt: null }, _sum: { toAmount: true } }),
        prisma.financeTransfer.aggregate({ where: { workspaceId, fromAccountId: account.id, fromIsFund: false, deletedAt: null }, _sum: { fromAmount: true } }),
        account.hasInvestments ? prisma.financeFundValuation.findFirst({ where: { workspaceId, accountId: account.id, deletedAt: null }, orderBy: { date: 'desc' } }) : null,
        account.hasInvestments ? prisma.financeTransfer.aggregate({ where: { workspaceId, toAccountId: account.id, toIsFund: true, deletedAt: null }, _sum: { toAmount: true } }) : null,
        account.hasInvestments ? prisma.financeTransfer.aggregate({ where: { workspaceId, fromAccountId: account.id, fromIsFund: true, deletedAt: null }, _sum: { fromAmount: true } }) : null,
        prisma.financeMovement.aggregate({ where: { workspaceId, accountId: account.id, deletedAt: null, check: { status: 'pending' } }, _sum: { amount: true }, _count: true }),
      ])

      const disponible = toDecimal(account.initialBalance)
        .plus(toDecimal(allTimeIncomeAgg._sum.amount || 0))
        .minus(toDecimal(allTimeExpenseAgg._sum.amount || 0))
        .plus(toDecimal(allTimeTransfersInAgg._sum.toAmount || 0))
        .minus(toDecimal(allTimeTransfersOutAgg._sum.fromAmount || 0))

      let fondos = null
      if (account.hasInvestments) {
        fondos = lastValuation
          ? toDecimal(lastValuation.value)
          : toDecimal(aportesAgg._sum.toAmount || 0).minus(toDecimal(rescatesAgg._sum.fromAmount || 0))
      }

      return {
        id: account.id, name: account.name, type: account.type, currency: account.currency, hasInvestments: account.hasInvestments,
        incomePeriod: toDecimal(incomePeriodAgg._sum.amount || 0).toString(),
        expensePeriod: toDecimal(expensePeriodAgg._sum.amount || 0).toString(),
        internalPeriod: toDecimal(transfersInPeriodAgg._sum.toAmount || 0).minus(toDecimal(transfersOutPeriodAgg._sum.fromAmount || 0)).toString(),
        disponible: disponible.toString(),
        fondos: fondos != null ? fondos.toString() : null,
        pendingChecks: { amount: toDecimal(pendingChecksAgg._sum.amount || 0).toString(), count: pendingChecksAgg._count },
      }
    }))

    // Totales por moneda — "una tarjeta por moneda existente" (4.2). No hay
    // conversión de FX entre monedas: cada una se totaliza por separado.
    const byCurrency = {}
    for (const r of accountResults) {
      const bucket = byCurrency[r.currency] || { disponible: toDecimal(0), fondos: toDecimal(0), pendingChecksAmount: toDecimal(0), pendingChecksCount: 0 }
      bucket.disponible = bucket.disponible.plus(r.disponible)
      if (r.fondos != null) bucket.fondos = bucket.fondos.plus(r.fondos)
      bucket.pendingChecksAmount = bucket.pendingChecksAmount.plus(r.pendingChecks.amount)
      bucket.pendingChecksCount += r.pendingChecks.count
      byCurrency[r.currency] = bucket
    }
    const totalsByCurrency = Object.fromEntries(Object.entries(byCurrency).map(([cur, b]) => [cur, {
      disponible: b.disponible.toString(),
      fondos: b.fondos.toString(),
      total: b.disponible.plus(b.fondos).toString(),
      pendingChecks: { amount: b.pendingChecksAmount.toString(), count: b.pendingChecksCount },
    }]))

    res.json({ accounts: accountResults, totalsByCurrency })
  } catch (err) { next(err) }
}

module.exports = { getBalances }
