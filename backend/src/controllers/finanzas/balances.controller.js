const prisma = require('../../lib/prisma')
const { toDecimal } = require('../../lib/financeMoney')
const { parseDate, transfersAfterValuation } = require('./_shared')

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
 * ± ajustes de saldo (FinanceBalanceAdjustment, con signo)
 * (excluyendo `toIsFund`/`fromIsFund`, que son fondos, no disponible), sin
 * contar movimientos de cheques todavía `pending` (al acreditar, el
 * movimiento se actualiza a la fecha/cuenta real — ver checks.controller.js
 * `creditCheck` — así que acá "pending" es el único caso a excluir).
 *
 * Fondos (3.1) = el `value` de la última FinanceFundValuation registrada (es
 * un snapshot absoluto, no un delta) + aportes − rescates posteriores a ella.
 * Si todavía no hay ninguna, aportes − rescates acumulados.
 *
 * Totales por moneda: las cuentas `balanceGroup: 'investment'` (largo plazo)
 * NO suman al disponible/fondos/total — van a `inversion` (su disponible +
 * fondos), con `investmentAccounts` = cuántas hay. Los cheques pendientes
 * cuentan en su moneda sea cual sea la cuenta.
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

    const accounts = await prisma.financeAccount.findMany({ where: { workspaceId, active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })

    const accountResults = await Promise.all(accounts.map(async (account) => {
      const [
        incomePeriodAgg, expensePeriodAgg, transfersInPeriodAgg, transfersOutPeriodAgg,
        allTimeIncomeAgg, allTimeExpenseAgg, allTimeTransfersInAgg, allTimeTransfersOutAgg,
        lastValuation, pendingChecksAgg,
        adjustmentsPeriodAgg, allTimeAdjustmentsAgg,
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
        account.hasInvestments ? prisma.financeFundValuation.findFirst({ where: { workspaceId, accountId: account.id, deletedAt: null }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }) : null,
        prisma.financeMovement.aggregate({ where: { workspaceId, accountId: account.id, deletedAt: null, check: { status: 'pending' } }, _sum: { amount: true }, _count: true }),
        prisma.financeBalanceAdjustment.aggregate({ where: { workspaceId, accountId: account.id, deletedAt: null, ...periodDateFilter }, _sum: { amount: true } }),
        prisma.financeBalanceAdjustment.aggregate({ where: { workspaceId, accountId: account.id, deletedAt: null }, _sum: { amount: true } }),
      ])

      const disponible = toDecimal(account.initialBalance)
        .plus(toDecimal(allTimeIncomeAgg._sum.amount || 0))
        .minus(toDecimal(allTimeExpenseAgg._sum.amount || 0))
        .plus(toDecimal(allTimeTransfersInAgg._sum.toAmount || 0))
        .minus(toDecimal(allTimeTransfersOutAgg._sum.fromAmount || 0))
        .plus(toDecimal(allTimeAdjustmentsAgg._sum.amount || 0))

      let fondos = null
      if (account.hasInvestments) {
        const sinceValuation = transfersAfterValuation(lastValuation)
        const [aportesAgg, rescatesAgg] = await Promise.all([
          prisma.financeTransfer.aggregate({ where: { workspaceId, toAccountId: account.id, toIsFund: true, deletedAt: null, ...sinceValuation }, _sum: { toAmount: true } }),
          prisma.financeTransfer.aggregate({ where: { workspaceId, fromAccountId: account.id, fromIsFund: true, deletedAt: null, ...sinceValuation }, _sum: { fromAmount: true } }),
        ])
        fondos = toDecimal(lastValuation?.value || 0)
          .plus(toDecimal(aportesAgg._sum.toAmount || 0))
          .minus(toDecimal(rescatesAgg._sum.fromAmount || 0))
      }

      return {
        id: account.id, name: account.name, type: account.type, currency: account.currency, hasInvestments: account.hasInvestments,
        balanceGroup: account.balanceGroup || 'available',
        incomePeriod: toDecimal(incomePeriodAgg._sum.amount || 0).toString(),
        expensePeriod: toDecimal(expensePeriodAgg._sum.amount || 0).toString(),
        internalPeriod: toDecimal(transfersInPeriodAgg._sum.toAmount || 0).minus(toDecimal(transfersOutPeriodAgg._sum.fromAmount || 0)).toString(),
        adjustmentsPeriod: toDecimal(adjustmentsPeriodAgg._sum.amount || 0).toString(),
        disponible: disponible.toString(),
        fondos: fondos != null ? fondos.toString() : null,
        pendingChecks: { amount: toDecimal(pendingChecksAgg._sum.amount || 0).toString(), count: pendingChecksAgg._count },
      }
    }))

    // Totales por moneda — "una tarjeta por moneda existente" (4.2). No hay
    // conversión de FX entre monedas: cada una se totaliza por separado.
    const byCurrency = {}
    for (const r of accountResults) {
      const bucket = byCurrency[r.currency] || {
        disponible: toDecimal(0), fondos: toDecimal(0), inversion: toDecimal(0), investmentAccounts: 0,
        pendingChecksAmount: toDecimal(0), pendingChecksCount: 0,
      }
      if (r.balanceGroup === 'investment') {
        bucket.inversion = bucket.inversion.plus(r.disponible).plus(r.fondos ?? 0)
        bucket.investmentAccounts++
      } else {
        bucket.disponible = bucket.disponible.plus(r.disponible)
        if (r.fondos != null) bucket.fondos = bucket.fondos.plus(r.fondos)
      }
      bucket.pendingChecksAmount = bucket.pendingChecksAmount.plus(r.pendingChecks.amount)
      bucket.pendingChecksCount += r.pendingChecks.count
      byCurrency[r.currency] = bucket
    }
    const totalsByCurrency = Object.fromEntries(Object.entries(byCurrency).map(([cur, b]) => [cur, {
      disponible: b.disponible.toString(),
      fondos: b.fondos.toString(),
      total: b.disponible.plus(b.fondos).toString(),
      inversion: b.inversion.toString(),
      investmentAccounts: b.investmentAccounts,
      pendingChecks: { amount: b.pendingChecksAmount.toString(), count: b.pendingChecksCount },
    }]))

    res.json({ accounts: accountResults, totalsByCurrency })
  } catch (err) { next(err) }
}

function monthKeyOf(date) { return new Date(date).toISOString().slice(0, 7) }
function shiftMonthKey(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * GET /api/finanzas/balances/history?months=12 — el disponible operativo al
 * cierre de cada mes, por moneda: los `months` meses que terminan en el mes
 * en curso. Mismo criterio que la tarjeta "Disponible" de Saldos — saldo
 * inicial + ingresos (sin cheques pendientes) − egresos ± transferencias de/
 * hacia disponible ± ajustes —, solo cuentas activas y operativas
 * (`balanceGroup` ≠ investment: la inversión va aparte) y sin fondos.
 *
 * El último punto es el saldo de hoy con TODO lo cargado (también lo fechado
 * más adelante), para que coincida exacto con la tarjeta de arriba; los
 * anteriores son cierres de mes (todo lo de fecha anterior al 1° del
 * siguiente). El saldo inicial no tiene fecha: cuenta desde el principio.
 */
async function getBalanceHistory(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const months = Math.min(24, Math.max(2, Number(req.query.months) || 12))
    const now = new Date()
    const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const keys = Array.from({ length: months }, (_, i) => shiftMonthKey(current, i - months + 1))

    const accounts = await prisma.financeAccount.findMany({
      where: { workspaceId, active: true, NOT: { balanceGroup: 'investment' } },
      select: { id: true, currency: true, initialBalance: true },
    })
    const ids = accounts.map(a => a.id)
    const currencyOf = new Map(accounts.map(a => [a.id, a.currency]))
    if (ids.length === 0) return res.json({ months: keys, currencies: [] })

    const [movements, transfersIn, transfersOut, adjustments] = await Promise.all([
      prisma.financeMovement.findMany({
        where: { workspaceId, deletedAt: null, accountId: { in: ids }, NOT: { check: { status: 'pending' } } },
        select: { accountId: true, type: true, amount: true, date: true },
      }),
      prisma.financeTransfer.findMany({
        where: { workspaceId, deletedAt: null, toAccountId: { in: ids }, toIsFund: false },
        select: { toAccountId: true, toAmount: true, date: true },
      }),
      prisma.financeTransfer.findMany({
        where: { workspaceId, deletedAt: null, fromAccountId: { in: ids }, fromIsFund: false },
        select: { fromAccountId: true, fromAmount: true, date: true },
      }),
      prisma.financeBalanceAdjustment.findMany({
        where: { workspaceId, deletedAt: null, accountId: { in: ids } },
        select: { accountId: true, amount: true, date: true },
      }),
    ])

    // Por moneda: lo previo a la ventana (apertura), el cambio de cada mes de
    // la ventana y lo fechado después del mes en curso.
    const byCurrency = new Map()
    const bucket = (cur) => {
      if (!byCurrency.has(cur)) byCurrency.set(cur, { opening: toDecimal(0), deltas: new Map(keys.map(k => [k, toDecimal(0)])), later: toDecimal(0) })
      return byCurrency.get(cur)
    }
    const add = (accountId, date, amount) => {
      const b = bucket(currencyOf.get(accountId))
      const key = monthKeyOf(date)
      if (key < keys[0]) b.opening = b.opening.plus(amount)
      else if (key > current) b.later = b.later.plus(amount)
      else b.deltas.set(key, b.deltas.get(key).plus(amount))
    }
    for (const a of accounts) bucket(a.currency).opening = bucket(a.currency).opening.plus(toDecimal(a.initialBalance))
    for (const m of movements) add(m.accountId, m.date, m.type === 'income' ? toDecimal(m.amount) : toDecimal(m.amount).negated())
    for (const t of transfersIn) add(t.toAccountId, t.date, toDecimal(t.toAmount))
    for (const t of transfersOut) add(t.fromAccountId, t.date, toDecimal(t.fromAmount).negated())
    for (const a of adjustments) add(a.accountId, a.date, toDecimal(a.amount))

    const currencies = [...byCurrency.entries()].map(([currency, b]) => {
      let running = b.opening
      const points = keys.map((k, i) => {
        running = running.plus(b.deltas.get(k))
        const balance = i === keys.length - 1 ? running.plus(b.later) : running
        return { month: k, balance: balance.toString() }
      })
      return { currency, points }
    }).sort((a, b) => (a.currency === 'ARS' ? -1 : b.currency === 'ARS' ? 1 : a.currency.localeCompare(b.currency)))

    res.json({ months: keys, currencies })
  } catch (err) { next(err) }
}

module.exports = { getBalances, getBalanceHistory }
