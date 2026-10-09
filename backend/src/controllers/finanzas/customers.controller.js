const prisma = require('../../lib/prisma')
const { toDecimal } = require('../../lib/financeMoney')
const { parseDate, computeInvoiceStatus } = require('./_shared')

const INVOICE_WITH_COLLECTIONS = {
  where: { deletedAt: null },
  include: {
    collections: { where: { deletedAt: null }, select: { amount: true } },
    attachments: { where: { deletedAt: null, status: 'ready' }, select: { id: true, name: true } },
  },
  orderBy: { issueDate: 'desc' },
}

function shapeInvoice(inv) {
  const collected = inv.collections.reduce((s, m) => s.plus(toDecimal(m.amount)), toDecimal(0))
  const { collections, ...rest } = inv
  return { ...rest, collected: collected.toString(), status: computeInvoiceStatus(inv, collected) }
}

// Resume facturado/cobrado/saldo/estado de un item con sus facturas +
// cobranzas ya cargadas (invoices: INVOICE_WITH_COLLECTIONS, onAccountMovements).
function summarizeCustomer(item) {
  const invoices = item.invoices.map(shapeInvoice)
  const facturado = invoices.reduce((s, i) => s.plus(toDecimal(i.amount)), toDecimal(0))
  const onAccount = (item.onAccountMovements || []).reduce((s, m) => s.plus(toDecimal(m.amount)), toDecimal(0))
  const fromInvoices = invoices.reduce((s, i) => s.plus(toDecimal(i.collected)), toDecimal(0))
  const cobrado = fromInvoices.plus(onAccount)
  const saldo = facturado.minus(cobrado)
  const hasOverdue = invoices.some(i => i.status === 'overdue')
  const status = saldo.lessThanOrEqualTo(0) ? 'current' : (hasOverdue ? 'overdue' : 'pending')
  return { invoices, facturado: facturado.toString(), cobrado: cobrado.toString(), saldo: saldo.toString(), status }
}

// GET /api/finanzas/customers?search=&onlyWithBalance=true — sección 4.4
async function listCustomers(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { search, onlyWithBalance } = req.query
    const where = { workspaceId, tracksAccount: true, active: true }
    if (search && search.trim()) where.name = { contains: search.trim(), mode: 'insensitive' }

    const items = await prisma.financeItem.findMany({
      where,
      include: { invoices: INVOICE_WITH_COLLECTIONS },
    })
    // Cobros "a cuenta" (genéricos, no atados a una factura puntual): no hay
    // relación declarada para esto en FinanceItem — se resuelve con un
    // groupBy aparte y se mergea acá.
    const onAccountByItem = await prisma.financeMovement.groupBy({
      by: ['itemId'],
      where: { workspaceId, type: 'income', accountApplication: 'on_account', deletedAt: null, itemId: { in: items.map(i => i.id) } },
      _sum: { amount: true },
    })
    const onAccountMap = new Map(onAccountByItem.map(r => [r.itemId, r._sum.amount]))

    const results = items.map(item => {
      const summary = summarizeCustomer({ ...item, onAccountMovements: onAccountMap.has(item.id) ? [{ amount: onAccountMap.get(item.id) }] : [] })
      const lastInvoice = item.invoices[0] || null // ya viene ordenado desc por issueDate
      return {
        id: item.id, name: item.name, email: item.email,
        facturado: summary.facturado, cobrado: summary.cobrado, saldo: summary.saldo, status: summary.status,
        lastInvoice: lastInvoice ? { id: lastInvoice.id, number: lastInvoice.number, issueDate: lastInvoice.issueDate } : null,
      }
    })
      .filter(c => onlyWithBalance !== 'true' || Number(c.saldo) !== 0)
      .sort((a, b) => {
        if (a.status === 'overdue' && b.status !== 'overdue') return -1
        if (b.status === 'overdue' && a.status !== 'overdue') return 1
        return Number(b.saldo) - Number(a.saldo)
      })

    res.json(results)
  } catch (err) { next(err) }
}

// GET /api/finanzas/customers/:id — sección 4.5, columna "Datos" + saldo + facturas
async function getCustomer(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const item = await prisma.financeItem.findFirst({
      where: { id, workspaceId, tracksAccount: true },
      include: {
        category: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        invoices: INVOICE_WITH_COLLECTIONS,
      },
    })
    if (!item) return res.status(404).json({ error: 'Cliente no encontrado' })

    const onAccountAgg = await prisma.financeMovement.aggregate({
      where: { workspaceId, itemId: id, type: 'income', accountApplication: 'on_account', deletedAt: null },
      _sum: { amount: true },
    })
    const summary = summarizeCustomer({ ...item, onAccountMovements: [{ amount: onAccountAgg._sum.amount || 0 }] })

    const [invoiceCount, lastPayment] = await Promise.all([
      prisma.financeInvoice.count({ where: { itemId: id, deletedAt: null } }),
      prisma.financeMovement.findFirst({
        where: { workspaceId, itemId: id, type: 'income', accountApplication: { in: ['invoice', 'on_account'] }, deletedAt: null },
        orderBy: { date: 'desc' }, select: { date: true },
      }),
    ])
    // Días promedio de cobro: promedio (fecha de un cobro aplicado a factura −
    // emisión de esa factura). `collections` de INVOICE_WITH_COLLECTIONS solo
    // trae `amount` (alcanza para el saldo) — para la fecha del cobro hace
    // falta esta query aparte.
    const invoiceCollections = await prisma.financeMovement.findMany({
      where: { workspaceId, itemId: id, type: 'income', accountApplication: 'invoice', deletedAt: null, invoiceId: { not: null } },
      select: { date: true, invoiceId: true },
    })
    const issueDateByInvoice = new Map(item.invoices.map(i => [i.id, i.issueDate]))
    const spans = invoiceCollections
      .map(mv => {
        const issueDate = issueDateByInvoice.get(mv.invoiceId)
        if (!issueDate) return null
        return Math.round((new Date(mv.date) - new Date(issueDate)) / 86400000)
      })
      .filter(d => d != null && d >= 0)
    const avgDaysToCollect = spans.length ? Math.round(spans.reduce((s, d) => s + d, 0) / spans.length) : null

    res.json({
      id: item.id, name: item.name, category: item.category, project: item.project,
      contactName: item.contactName, phone: item.phone, email: item.email, taxId: item.taxId,
      contractedService: item.contractedService, notes: item.notes,
      invoices: summary.invoices, facturado: summary.facturado, cobrado: summary.cobrado, saldo: summary.saldo, status: summary.status,
      metrics: { invoiceCount, avgDaysToCollect, lastPaymentAt: lastPayment?.date || null },
    })
  } catch (err) { next(err) }
}

// GET /api/finanzas/customers/:id/ledger?from=&to= — sección 4.5a "Movimientos":
// saldo anterior + filas cronológicas de facturas + cobros. Los "no_effect"
// (ej. reintegro de pauta) no tocan la cuenta corriente — quedan afuera.
async function getLedger(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const itemId = Number(req.params.id)
    const item = await prisma.financeItem.findFirst({ where: { id: itemId, workspaceId, tracksAccount: true }, select: { id: true } })
    if (!item) return res.status(404).json({ error: 'Cliente no encontrado' })

    const fromDate = parseDate(req.query.from)
    const toDate = parseDate(req.query.to)
    if (fromDate === undefined || toDate === undefined) return res.status(400).json({ error: 'Fecha inválida' })

    const [invoices, movements] = await Promise.all([
      prisma.financeInvoice.findMany({ where: { workspaceId, itemId, deletedAt: null }, select: { id: true, number: true, concept: true, amount: true, issueDate: true, attachments: { where: { deletedAt: null, status: 'ready' }, select: { id: true, name: true } } } }),
      prisma.financeMovement.findMany({
        where: { workspaceId, itemId, type: 'income', accountApplication: { in: ['invoice', 'on_account'] }, deletedAt: null },
        include: { account: { select: { name: true } }, check: true, invoice: { select: { number: true } } },
      }),
    ])

    const rows = [
      ...invoices.map(inv => ({
        date: inv.issueDate, kind: 'invoice', id: `inv${inv.id}`,
        concept: `${inv.number} · ${inv.concept}`, attachments: inv.attachments,
        facturado: inv.amount.toString(), cobrado: '0',
      })),
      ...movements.map(mv => ({
        date: mv.date, kind: 'payment', id: `mov${mv.id}`,
        concept: mv.check ? `Cobro · Cheque N° ${mv.check.number}` : `Cobro · ${mv.account.name}`,
        checkPending: mv.check?.status === 'pending', checkDate: mv.check?.estimatedCollectionDate || null,
        appliedTo: mv.invoice?.number || null,
        facturado: '0', cobrado: mv.amount.toString(),
      })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date))

    let opening = toDecimal(0)
    const visible = []
    for (const row of rows) {
      const inRange = (!fromDate || new Date(row.date) >= fromDate) && (!toDate || new Date(row.date) <= toDate)
      if (!inRange) {
        if (fromDate && new Date(row.date) < fromDate) opening = opening.plus(toDecimal(row.facturado)).minus(toDecimal(row.cobrado))
        continue
      }
      visible.push(row)
    }

    let running = opening
    const shaped = visible.map(row => {
      running = running.plus(toDecimal(row.facturado)).minus(toDecimal(row.cobrado))
      return { ...row, balance: running.toString() }
    })

    res.json({ openingBalance: opening.toString(), rows: shaped })
  } catch (err) { next(err) }
}

module.exports = { listCustomers, getCustomer, getLedger, shapeInvoice }
