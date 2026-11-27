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

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) }
}

// Mismo criterio que `signedAmount` de customers.controller: la nota de
// crédito resta, la de débito suma, la rechazada por ARCA nunca existió.
function signedInvoiceAmount(inv) {
  if (inv.arcaStatus === 'rejected') return toDecimal(0)
  const amount = toDecimal(inv.amount)
  return inv.kind === 'credit_note' ? amount.negated() : amount
}

/**
 * GET /api/finanzas/summary/entities?month=YYYY-MM&currency=ARS — una tarjeta
 * por entidad de facturación (FinanceIssuer): lo que facturó en el mes
 * (por fecha de emisión, neto de notas de crédito) y lo que entró y salió por
 * las cuentas asociadas a ella (`FinanceAccount.issuerId`). "Sin entidad"
 * (`issuerId: null`) junta las facturas informativas y las cuentas sin
 * entidad.
 *
 * - Ingresos excluyen cheques todavía `pending` (no entraron a la cuenta; se
 *   informan aparte en `pendingChecks`, mismo criterio que Saldos).
 * - Transferencias entre cuentas y ajustes de saldo no entran (no son ni
 *   ingreso ni egreso). Los egresos hijos de un impuesto sí.
 * - `crossCollections`: cobros del mes imputados a una factura de una entidad
 *   que entraron en una cuenta de OTRA entidad. Solo cuando las dos puntas
 *   tienen entidad (una factura informativa o una cuenta sin entidad no dicen
 *   nada). No se filtra por moneda: es un aviso, no un total.
 */
async function getEntities(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { month, currency = 'ARS' } = req.query
    if (!/^\d{4}-\d{2}$/.test(month || '')) return res.status(400).json({ error: 'Mes inválido (YYYY-MM)' })
    const range = monthBounds(month)

    const [issuers, accounts, invoices, movements, collections] = await Promise.all([
      prisma.financeIssuer.findMany({ where: { workspaceId }, select: { id: true, name: true, cuit: true, active: true }, orderBy: { name: 'asc' } }),
      prisma.financeAccount.findMany({ where: { workspaceId, currency }, select: { id: true, name: true, issuerId: true, active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      prisma.financeInvoice.findMany({
        where: { workspaceId, deletedAt: null, currency, issueDate: range },
        select: { issuerId: true, amount: true, kind: true, arcaStatus: true },
      }),
      prisma.financeMovement.findMany({
        where: { workspaceId, deletedAt: null, date: range, account: { currency } },
        select: { type: true, amount: true, accountId: true, check: { select: { status: true } } },
      }),
      prisma.financeMovement.findMany({
        where: {
          workspaceId, deletedAt: null, type: 'income', date: range,
          invoice: { issuerId: { not: null } }, account: { issuerId: { not: null } },
        },
        select: {
          id: true, date: true, amount: true,
          item: { select: { name: true } },
          check: { select: { status: true } },
          account: { select: { id: true, name: true, currency: true, issuerId: true, issuer: { select: { name: true } } } },
          invoice: { select: { id: true, number: true, kind: true, issuerId: true, issuer: { select: { name: true } } } },
        },
        orderBy: { date: 'asc' },
      }),
    ])

    const entities = new Map()
    const entityFor = (issuerId) => {
      const key = issuerId ?? 'none'
      if (!entities.has(key)) {
        entities.set(key, {
          issuerId: issuerId ?? null, invoiced: toDecimal(0), invoiceCount: 0,
          income: toDecimal(0), expense: toDecimal(0), movementCount: 0,
          pendingChecks: { amount: toDecimal(0), count: 0 }, accounts: [], crossCount: 0,
        })
      }
      return entities.get(key)
    }

    const accountIssuer = new Map(accounts.map(a => [a.id, a.issuerId]))
    for (const a of accounts) if (a.active) entityFor(a.issuerId).accounts.push({ id: a.id, name: a.name })
    for (const inv of invoices) {
      const e = entityFor(inv.issuerId)
      e.invoiced = e.invoiced.plus(signedInvoiceAmount(inv))
      e.invoiceCount++
    }
    for (const mv of movements) {
      const e = entityFor(accountIssuer.get(mv.accountId))
      e.movementCount++
      if (mv.type === 'expense') e.expense = e.expense.plus(toDecimal(mv.amount))
      else if (mv.check?.status === 'pending') {
        e.pendingChecks.amount = e.pendingChecks.amount.plus(toDecimal(mv.amount))
        e.pendingChecks.count++
      } else e.income = e.income.plus(toDecimal(mv.amount))
    }

    const crossCollections = collections
      .filter(mv => mv.invoice.issuerId !== mv.account.issuerId)
      .map(mv => ({
        movementId: mv.id, date: mv.date, amount: mv.amount.toString(), currency: mv.account.currency,
        itemName: mv.item?.name || null, pendingCheck: mv.check?.status === 'pending',
        account: { id: mv.account.id, name: mv.account.name, issuerId: mv.account.issuerId, issuerName: mv.account.issuer?.name || null },
        invoice: { id: mv.invoice.id, number: mv.invoice.number, kind: mv.invoice.kind, issuerId: mv.invoice.issuerId, issuerName: mv.invoice.issuer?.name || null },
      }))
    for (const c of crossCollections) {
      if (c.currency !== currency) continue
      entityFor(c.invoice.issuerId).crossCount++
      entityFor(c.account.issuerId).crossCount++
    }

    const shape = (e, issuer) => ({
      issuerId: e.issuerId,
      name: issuer ? issuer.name : 'Sin entidad',
      cuit: issuer?.cuit || null,
      active: issuer ? issuer.active : true,
      invoiced: e.invoiced.toString(), invoiceCount: e.invoiceCount,
      income: e.income.toString(), expense: e.expense.toString(),
      net: e.income.minus(e.expense).toString(),
      pendingChecks: { amount: e.pendingChecks.amount.toString(), count: e.pendingChecks.count },
      accounts: e.accounts, crossCount: e.crossCount,
    })
    const hasData = e => e.invoiceCount > 0 || e.movementCount > 0 || e.crossCount > 0

    // Entidades activas siempre (aunque estén en cero: es la foto del mes);
    // desactivadas y "Sin entidad" solo si tienen algo que mostrar.
    const rows = []
    for (const issuer of issuers) {
      const e = entities.get(issuer.id) || entityFor(issuer.id)
      if (issuer.active || hasData(e)) rows.push(shape(e, issuer))
    }
    const none = entities.get('none')
    if (none && (hasData(none) || none.accounts.length > 0)) rows.push(shape(none, null))

    res.json({ month, currency, entities: rows, crossCollections })
  } catch (err) { next(err) }
}

/**
 * GET /api/finanzas/first-month?source=movements|invoices — el mes ("YYYY-MM")
 * del primer movimiento (por fecha) o la primera factura (por emisión) vivos
 * del workspace, o null si no hay. Arma los selectores de mes de
 * Ingresos/Egresos/Facturas: arrancan ahí en vez de ofrecer meses vacíos.
 */
async function getFirstMonth(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { source = 'movements' } = req.query
    let first
    if (source === 'movements') {
      const agg = await prisma.financeMovement.aggregate({ where: { workspaceId, deletedAt: null }, _min: { date: true } })
      first = agg._min.date
    } else if (source === 'invoices') {
      const agg = await prisma.financeInvoice.aggregate({ where: { workspaceId, deletedAt: null }, _min: { issueDate: true } })
      first = agg._min.issueDate
    } else {
      return res.status(400).json({ error: 'source inválido (movements|invoices)' })
    }
    res.json({ month: first ? new Date(first).toISOString().slice(0, 7) : null })
  } catch (err) { next(err) }
}

module.exports = { getBreakdown, getChart, getEntities, getFirstMonth }
