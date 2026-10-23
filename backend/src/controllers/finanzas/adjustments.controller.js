const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { toDecimal } = require('../../lib/financeMoney')
const { parseDate } = require('./_shared')

const ADJUSTMENT_INCLUDE = {
  account:   { select: { id: true, name: true, currency: true } },
  createdBy: { select: { id: true, name: true, avatar: true } },
}

// GET /api/finanzas/adjustments?accountId=
async function listAdjustments(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const where = { workspaceId, deletedAt: null }
    if (req.query.accountId) where.accountId = Number(req.query.accountId)
    const adjustments = await prisma.financeBalanceAdjustment.findMany({ where, orderBy: { date: 'desc' }, include: ADJUSTMENT_INCLUDE })
    res.json(adjustments)
  } catch (err) { next(err) }
}

// POST /api/finanzas/adjustments — "Ajustar saldo": { accountId, date, amount, note }.
// `amount` es el AJUSTE en sí (positivo suma, negativo resta), no el saldo real.
// Mueve el Disponible de la cuenta pero no cuenta como ingreso ni egreso.
async function createAdjustment(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { accountId, date, amount, note } = req.body

    if (!Number.isInteger(accountId)) return res.status(400).json({ error: 'Cuenta requerida' })
    const account = await prisma.financeAccount.findFirst({ where: { id: accountId, workspaceId } })
    if (!account) return res.status(400).json({ error: 'Cuenta no encontrada' })
    const parsedDate = parseDate(date)
    if (!parsedDate) return res.status(400).json({ error: 'Fecha inválida' })
    if (!note?.trim()) return res.status(400).json({ error: 'Contá el motivo del ajuste' })

    let amountDecimal
    try { amountDecimal = toDecimal(amount) } catch { return res.status(400).json({ error: 'Monto inválido' }) }
    if (!amountDecimal.isFinite() || amountDecimal.isZero()) return res.status(400).json({ error: 'El ajuste no puede ser 0' })

    const adjustment = await prisma.financeBalanceAdjustment.create({
      data: { workspaceId, accountId, date: parsedDate, amount: amountDecimal.toString(), note: note.trim(), createdById: req.user.userId },
      include: ADJUSTMENT_INCLUDE,
    })

    await logFinanceAudit({
      workspaceId, entityType: 'adjustment', entityId: adjustment.id, action: 'create', userId: req.user.userId,
      entityLabel: `ajuste de saldo de "${account.name}" (${amountDecimal.isPositive() ? '+' : ''}${amountDecimal.toFixed(2)})`,
    })
    res.status(201).json(adjustment)
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/adjustments/:id — soft-delete
async function deleteAdjustment(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeBalanceAdjustment.findFirst({ where: { id, workspaceId, deletedAt: null }, include: ADJUSTMENT_INCLUDE })
    if (!existing) return res.status(404).json({ error: 'Ajuste no encontrado' })
    await prisma.financeBalanceAdjustment.update({ where: { id }, data: { deletedAt: new Date(), deletedById: req.user.userId } })
    await logFinanceAudit({
      workspaceId, entityType: 'adjustment', entityId: id, action: 'delete', userId: req.user.userId,
      entityLabel: `ajuste de saldo de "${existing.account.name}"`,
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listAdjustments, createAdjustment, deleteAdjustment }
