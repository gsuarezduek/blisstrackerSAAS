const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { toDecimal, roundForCurrency } = require('../../lib/financeMoney')
const { parseDate, businessError } = require('./_shared')
const { isValidExtraStatus } = require('../../lib/financeCatalog')

const EXTRA_INCLUDE = {
  item: { select: { id: true, name: true } },
  payments: { orderBy: { number: 'asc' }, include: { movement: { select: { id: true, date: true, amount: true } } } },
}

/**
 * Reparte `total` en `count` cuotas iguales (sección 2: "Default: pagos
 * iguales (ej. 2 pagos → 50% / 50%)"). Último pago se ajusta por redondeo
 * para que la suma cierre exacto contra `total` (con Decimal, nunca float).
 */
function splitEqualPayments(total, count) {
  const totalDecimal = toDecimal(total)
  const pct = toDecimal(100).dividedBy(count).toDecimalPlaces(3)
  const payments = []
  let assignedAmount = toDecimal(0)
  for (let i = 1; i <= count; i++) {
    const isLast = i === count
    const amount = isLast ? totalDecimal.minus(assignedAmount) : roundForCurrency(totalDecimal.times(pct).dividedBy(100), 'ARS')
    assignedAmount = assignedAmount.plus(amount)
    payments.push({ number: i, percentage: isLast ? toDecimal(100).minus(pct.times(count - 1)).toString() : pct.toString(), amount: amount.toString() })
  }
  return payments
}

// GET /api/finanzas/extras?from=&to=&itemId=&status=&payments=pending|complete
async function listExtras(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { from, to, itemId, status, payments } = req.query
    const where = { workspaceId, deletedAt: null }
    if (itemId) where.itemId = Number(itemId)
    if (status) where.status = status
    if (from || to) {
      const fromDate = parseDate(from)
      const toDate = parseDate(to)
      where.date = { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) }
    }

    let extras = await prisma.financeExtra.findMany({ where, orderBy: { date: 'desc' }, include: EXTRA_INCLUDE })
    if (payments === 'pending') extras = extras.filter(e => e.payments.some(p => !p.movementId))
    if (payments === 'complete') extras = extras.filter(e => e.payments.every(p => p.movementId))

    res.json(extras.map(e => ({
      ...e,
      paidCount: e.payments.filter(p => p.movementId).length,
      totalPayments: e.payments.length,
    })))
  } catch (err) { next(err) }
}

// POST /api/finanzas/extras — { itemId, date, action, total, companyAmount, numberOfPayments }
async function createExtra(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { itemId, date, action, total, companyAmount, numberOfPayments } = req.body

    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Cliente requerido' })
    const item = await prisma.financeItem.findFirst({ where: { id: itemId, workspaceId } })
    if (!item) return res.status(400).json({ error: 'Cliente no encontrado' })
    if (!action?.trim()) return res.status(400).json({ error: 'Acción requerida' })
    const parsedDate = parseDate(date)
    if (!parsedDate) return res.status(400).json({ error: 'Fecha inválida' })

    let totalDecimal, companyDecimal
    try { totalDecimal = toDecimal(total); companyDecimal = toDecimal(companyAmount) } catch { return res.status(400).json({ error: 'Montos inválidos' }) }
    if (!totalDecimal.isFinite() || totalDecimal.lessThanOrEqualTo(0)) return res.status(400).json({ error: 'Total inválido' })
    if (!companyDecimal.isFinite() || companyDecimal.lessThan(0) || companyDecimal.greaterThan(totalDecimal)) {
      return res.status(400).json({ error: 'Monto de la empresa inválido' })
    }
    const teamDecimal = totalDecimal.minus(companyDecimal)

    const count = Number.isInteger(numberOfPayments) && numberOfPayments > 0 ? numberOfPayments : 1
    const splits = splitEqualPayments(totalDecimal, count)

    const extra = await prisma.$transaction(async (tx) => {
      const created = await tx.financeExtra.create({
        data: {
          workspaceId, itemId, date: parsedDate, action: action.trim(),
          total: totalDecimal.toString(), companyAmount: companyDecimal.toString(), teamAmount: teamDecimal.toString(),
          createdById: req.user.userId,
        },
      })
      await tx.financeExtraPayment.createMany({
        data: splits.map(s => ({ workspaceId, extraId: created.id, number: s.number, percentage: s.percentage, amount: s.amount })),
      })
      return created
    })

    await logFinanceAudit({ workspaceId, entityType: 'extra', entityId: extra.id, action: 'create', userId: req.user.userId, entityLabel: `extra "${extra.action}" de ${item.name}` })
    const full = await prisma.financeExtra.findUnique({ where: { id: extra.id }, include: EXTRA_INCLUDE })
    res.status(201).json(full)
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/extras/:id — { action?, status?, teamPaid?, notes?, payments?: [{number,percentage,amount}] }
// `payments` reemplaza SOLO las cuotas sin cobrar (sección "decisiones menores":
// las ya cobradas quedan fijas) — valida que la suma de montos no cambie el total.
async function updateExtra(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeExtra.findFirst({ where: { id, workspaceId, deletedAt: null }, include: { item: { select: { name: true } }, payments: true } })
    if (!existing) return res.status(404).json({ error: 'Extra no encontrado' })

    const { action, status, teamPaid, notes, payments } = req.body
    const data = {}
    if (action !== undefined) { if (!action.trim()) return res.status(400).json({ error: 'Acción requerida' }); data.action = action.trim() }
    if (status !== undefined) { if (!isValidExtraStatus(status)) return res.status(400).json({ error: 'Estado inválido' }); data.status = status }
    if (teamPaid !== undefined) data.teamPaid = !!teamPaid
    if (notes !== undefined) data.notes = notes?.trim() || null

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.financeExtra.update({ where: { id }, data })

      if (Array.isArray(payments)) {
        const paidNumbers = new Set(existing.payments.filter(p => p.movementId).map(p => p.number))
        const unpaidPayments = payments.filter(p => !paidNumbers.has(p.number))
        const paidTotal = existing.payments.filter(p => p.movementId).reduce((s, p) => s.plus(toDecimal(p.amount)), toDecimal(0))
        const newUnpaidTotal = unpaidPayments.reduce((s, p) => s.plus(toDecimal(p.amount || 0)), toDecimal(0))
        if (!paidTotal.plus(newUnpaidTotal).equals(toDecimal(existing.total))) {
          throw businessError(400, 'La suma de las cuotas no cobradas debe completar el total del extra')
        }
        await tx.financeExtraPayment.deleteMany({ where: { extraId: id, movementId: null } })
        if (unpaidPayments.length) {
          await tx.financeExtraPayment.createMany({
            data: unpaidPayments.map(p => ({ workspaceId, extraId: id, number: p.number, percentage: String(p.percentage ?? 0), amount: String(p.amount) })),
          })
        }
      }
    })

    await logFinanceAudit({ workspaceId, entityType: 'extra', entityId: id, action: 'update', userId: req.user.userId, entityLabel: `extra "${existing.action}" de ${existing.item.name}` })
    const full = await prisma.financeExtra.findUnique({ where: { id }, include: EXTRA_INCLUDE })
    res.json(full)
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/extras/:id
async function deleteExtra(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeExtra.findFirst({ where: { id, workspaceId, deletedAt: null }, include: { item: { select: { name: true } } } })
    if (!existing) return res.status(404).json({ error: 'Extra no encontrado' })
    await prisma.financeExtra.update({ where: { id }, data: { deletedAt: new Date(), deletedById: req.user.userId } })
    await logFinanceAudit({ workspaceId, entityType: 'extra', entityId: id, action: 'delete', userId: req.user.userId, entityLabel: `extra "${existing.action}" de ${existing.item.name}` })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listExtras, createExtra, updateExtra, deleteExtra, EXTRA_INCLUDE }
