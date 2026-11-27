const prisma = require('../../lib/prisma')
const { Decimal, toDecimal } = require('../../lib/financeMoney')
const { parseDate, computeInvoiceStatus, todayUTCNoon } = require('./_shared')
const { buildTextSearchFilters } = require('../../lib/textSearch')

const INVOICE_WITH_COLLECTIONS = {
  where: { deletedAt: null },
  include: {
    collections: { where: { deletedAt: null }, select: { amount: true } },
    attachments: { where: { deletedAt: null, status: 'ready' }, select: { id: true, name: true } },
  },
  // `id` como segundo criterio: todas las facturas emitidas hoy comparten la
  // misma `issueDate` (solo fecha, sin hora) — sin esto el orden entre ellas
  // queda indefinido y una recién creada podía aparecer a la mitad.
  orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
}

function shapeInvoice(inv) {
  const collected = inv.collections.reduce((s, m) => s.plus(toDecimal(m.amount)), toDecimal(0))
  const { collections, ...rest } = inv
  return { ...rest, collected: collected.toString(), status: computeInvoiceStatus(inv, collected) }
}

// El monto de un comprobante siempre se guarda positivo (ver schema) — acá se
// le aplica el signo según kind: una nota de crédito resta de "facturado"
// (es plata que se le devuelve al cliente), una de débito suma igual que una
// factura normal.
function signedAmount(inv) {
  // Un comprobante que ARCA rechazó nunca llegó a existir legalmente — no
  // suma al "facturado" del cliente (si no, infla el saldo con algo que
  // nunca se le pudo cobrar). Ver mismo criterio en computeInvoiceStatus.
  if (inv.arcaStatus === 'rejected') return toDecimal(0)
  const amount = toDecimal(inv.amount)
  return inv.kind === 'credit_note' ? amount.negated() : amount
}

// Resume facturado/cobrado/saldo/estado de un item con sus facturas +
// cobranzas ya cargadas (invoices: INVOICE_WITH_COLLECTIONS, onAccountMovements).
function summarizeCustomer(item) {
  const invoices = item.invoices.map(shapeInvoice)
  const facturado = invoices.reduce((s, i) => s.plus(signedAmount(i)), toDecimal(0))
  const onAccount = (item.onAccountMovements || []).reduce((s, m) => s.plus(toDecimal(m.amount)), toDecimal(0))
  const fromInvoices = invoices.reduce((s, i) => s.plus(toDecimal(i.collected)), toDecimal(0))
  const cobrado = fromInvoices.plus(onAccount)
  const saldo = facturado.minus(cobrado)
  const hasOverdue = invoices.some(i => i.status === 'overdue')
  const status = saldo.lessThanOrEqualTo(0) ? 'current' : (hasOverdue ? 'overdue' : 'pending')
  return { invoices, facturado: facturado.toString(), cobrado: cobrado.toString(), saldo: saldo.toString(), status }
}

// GET /api/finanzas/customers?search=&onlyWithBalance=true&sort=name|balance — sección 4.4.
// Orden por defecto alfabético (`sort=balance`: vencidos primero, después por saldo).
// La búsqueda matchea nombre o razón social.
async function listCustomers(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { search, onlyWithBalance, sort } = req.query
    const where = { workspaceId, tracksAccount: true, active: true }
    if (search && search.trim()) {
      const q = search.trim()
      where.AND = buildTextSearchFilters(q, ['name', 'legalName'])
    }

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
        id: item.id, name: item.name, legalName: item.legalName, email: item.email,
        facturado: summary.facturado, cobrado: summary.cobrado, saldo: summary.saldo, status: summary.status,
        lastInvoice: lastInvoice ? { id: lastInvoice.id, number: lastInvoice.number, issueDate: lastInvoice.issueDate } : null,
      }
    })
      .filter(c => onlyWithBalance !== 'true' || Number(c.saldo) !== 0)
      .sort((a, b) => {
        if (sort !== 'balance') return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
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
        defaultIssuer: { select: { id: true, name: true, taxCondition: true } },
        invoices: INVOICE_WITH_COLLECTIONS,
        // Uso real del item, sin el filtro de `deletedAt` — mismo criterio que
        // `deleteItem` usa para decidir si todavía se puede borrar (una factura
        // en la papelera sigue siendo historial). El frontend lo necesita para
        // ofrecer "Eliminar" o solamente "Desactivar".
        _count: { select: { movements: true, invoices: true, extras: true, nextActions: true } },
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
      legalName: item.legalName, contactName: item.contactName, phone: item.phone, email: item.email, taxId: item.taxId, address: item.address,
      contractedService: item.contractedService, notes: item.notes,
      ivaCondition: item.ivaCondition, defaultIssuer: item.defaultIssuer,
      invoices: summary.invoices, facturado: summary.facturado, cobrado: summary.cobrado, saldo: summary.saldo, status: summary.status,
      metrics: { invoiceCount, avgDaysToCollect, lastPaymentAt: lastPayment?.date || null },
      counts: item._count,
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
      prisma.financeInvoice.findMany({ where: { workspaceId, itemId, deletedAt: null }, select: { id: true, number: true, concept: true, amount: true, kind: true, arcaStatus: true, issueDate: true, attachments: { where: { deletedAt: null, status: 'ready' }, select: { id: true, name: true } } } }),
      prisma.financeMovement.findMany({
        where: { workspaceId, itemId, type: 'income', accountApplication: { in: ['invoice', 'on_account'] }, deletedAt: null },
        include: { account: { select: { name: true } }, check: true, invoice: { select: { number: true } } },
      }),
    ])

    // `kind` acá es el tipo de FILA del ledger ('invoice'|'payment', para que el
    // frontend elija ícono/comportamiento) — no confundir con FinanceInvoice.kind
    // ('invoice'|'credit_note'|'debit_note', el documento fiscal real), que se
    // expone aparte como `docKind` y es lo que define el signo de `facturado`.
    const DOC_KIND_LABEL = { credit_note: 'NC', debit_note: 'ND' }
    const rows = [
      ...invoices.map(inv => ({
        date: inv.issueDate, kind: 'invoice', docKind: inv.kind, id: `inv${inv.id}`,
        concept: `${inv.arcaStatus === 'rejected' ? '[Rechazada] ' : (DOC_KIND_LABEL[inv.kind] ? `[${DOC_KIND_LABEL[inv.kind]}] ` : '')}${inv.number || '(pendiente de ARCA)'} · ${inv.concept}`, attachments: inv.attachments,
        // Rechazada por ARCA = nunca existió legalmente, no pesa en el saldo (ver signedAmount).
        facturado: signedAmount(inv).toString(), cobrado: '0',
      })),
      ...movements.map(mv => ({
        date: mv.date, kind: 'payment', id: `mov${mv.id}`,
        concept: mv.check ? `Cobro · Cheque N° ${mv.check.number}` : `Cobro · ${mv.account.name}`,
        checkPending: mv.check?.status === 'pending', checkDate: mv.check?.estimatedCollectionDate || null, checkId: mv.check?.id || null,
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

// ─── Antigüedad de saldos ───────────────────────────────────────────────
const AGING_BUCKETS = [
  { key: 'current',  label: 'Al día',         maxDays: 0 },
  { key: 'd1_30',    label: '1–30 días',      maxDays: 30 },
  { key: 'd31_60',   label: '31–60 días',     maxDays: 60 },
  { key: 'd61_90',   label: '61–90 días',     maxDays: 90 },
  { key: 'd90_plus', label: 'Más de 90 días', maxDays: Infinity },
]
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Reparte lo que debe cada cliente por antigüedad de vencimiento. Pura (la
 * usa el endpoint y se testea sola).
 *
 * Por cliente y moneda: cada factura/ND aporta su pendiente (monto − lo
 * cobrado imputado a ella); las notas de crédito, los cobros "a cuenta" y lo
 * cobrado de más en una factura son crédito sin factura, y se aplican **a lo
 * más viejo primero** (FIFO por vencimiento) — así la suma de los tramos da
 * el saldo del cliente, no el bruto de facturas impagas. Un cliente con saldo
 * a favor no aparece. Las rechazadas por ARCA no pesan (mismo criterio que
 * `signedAmount`). Lo cobrado incluye cheques pendientes, igual que el saldo.
 *
 * @param {Array} items   clientes con `invoices[{ amount, kind, arcaStatus, currency, dueDate, collections[{amount}] }]`
 * @param {Array} onAccount cobros a cuenta `{ itemId, amount, currency }`
 * @param {Date} today   hoy a mediodía UTC
 */
function computeAging(items, onAccount, today) {
  const onAccountByItem = new Map()
  for (const mv of onAccount) {
    const key = `${mv.itemId}|${mv.currency}`
    onAccountByItem.set(key, (onAccountByItem.get(key) || toDecimal(0)).plus(toDecimal(mv.amount)))
  }

  const byCurrency = new Map()
  const bucketsFor = (currency) => {
    if (!byCurrency.has(currency)) {
      byCurrency.set(currency, AGING_BUCKETS.map(b => ({ key: b.key, label: b.label, amount: toDecimal(0), customers: new Map() })))
    }
    return byCurrency.get(currency)
  }

  for (const item of items) {
    const perCurrency = new Map()
    const slot = (cur) => {
      if (!perCurrency.has(cur)) perCurrency.set(cur, { debits: [], credit: onAccountByItem.get(`${item.id}|${cur}`) || toDecimal(0) })
      return perCurrency.get(cur)
    }
    for (const [key, amount] of onAccountByItem) if (key.startsWith(`${item.id}|`)) slot(key.split('|')[1]).credit = amount
    for (const inv of item.invoices) {
      if (inv.arcaStatus === 'rejected') continue
      const c = slot(inv.currency || 'ARS')
      const amount = toDecimal(inv.amount)
      if (inv.kind === 'credit_note') { c.credit = c.credit.plus(amount); continue }
      const collected = (inv.collections || []).reduce((t, m) => t.plus(toDecimal(m.amount)), toDecimal(0))
      const pending = amount.minus(collected)
      if (pending.greaterThan(0)) c.debits.push({ dueDate: new Date(inv.dueDate), pending })
      else c.credit = c.credit.plus(pending.negated())
    }

    for (const [currency, c] of perCurrency) {
      c.debits.sort((a, b) => a.dueDate - b.dueDate)
      let credit = c.credit
      const buckets = bucketsFor(currency)
      for (const d of c.debits) {
        let pending = d.pending
        if (credit.greaterThan(0)) {
          const used = Decimal.min(credit, pending)
          pending = pending.minus(used)
          credit = credit.minus(used)
        }
        if (pending.lessThanOrEqualTo(0)) continue
        const days = Math.floor((today - d.dueDate) / DAY_MS)
        const idx = AGING_BUCKETS.findIndex(b => days <= b.maxDays)
        const bucket = buckets[idx]
        bucket.amount = bucket.amount.plus(pending)
        const prev = bucket.customers.get(item.id)
        bucket.customers.set(item.id, { id: item.id, name: item.name, amount: (prev?.amount || toDecimal(0)).plus(pending) })
      }
    }
  }

  return [...byCurrency.entries()]
    .map(([currency, buckets]) => {
      const total = buckets.reduce((t, b) => t.plus(b.amount), toDecimal(0))
      return {
        currency, total: total.toString(),
        buckets: buckets.map(b => ({
          key: b.key, label: b.label, amount: b.amount.toString(),
          customers: [...b.customers.values()].sort((x, y) => y.amount.comparedTo(x.amount)).map(x => ({ ...x, amount: x.amount.toString() })),
        })),
      }
    })
    .filter(c => Number(c.total) > 0)
    .sort((a, b) => (a.currency === 'ARS' ? -1 : b.currency === 'ARS' ? 1 : a.currency.localeCompare(b.currency)))
}

// GET /api/finanzas/customers/aging — antigüedad de lo que deben los clientes
// activos, por moneda y por tramo de vencimiento (ver computeAging).
async function getAging(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const items = await prisma.financeItem.findMany({
      where: { workspaceId, tracksAccount: true, active: true },
      select: {
        id: true, name: true,
        invoices: {
          where: { deletedAt: null },
          select: { amount: true, kind: true, arcaStatus: true, currency: true, dueDate: true, collections: { where: { deletedAt: null }, select: { amount: true } } },
        },
      },
    })
    const onAccount = await prisma.financeMovement.findMany({
      where: { workspaceId, type: 'income', accountApplication: 'on_account', deletedAt: null, itemId: { in: items.map(i => i.id) } },
      select: { itemId: true, amount: true, account: { select: { currency: true } } },
    })
    const today = todayUTCNoon()
    const currencies = computeAging(items, onAccount.map(m => ({ itemId: m.itemId, amount: m.amount, currency: m.account?.currency || 'ARS' })), today)
    res.json({ asOf: today.toISOString().slice(0, 10), currencies })
  } catch (err) { next(err) }
}

module.exports = { listCustomers, getCustomer, getLedger, getAging, computeAging, AGING_BUCKETS, shapeInvoice }
