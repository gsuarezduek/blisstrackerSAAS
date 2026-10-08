const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { parseDate, resolveAndApplyTaxes } = require('./_shared')

const CHECK_INCLUDE = {
  movement: {
    include: {
      item:    { select: { id: true, name: true } },
      account: { select: { id: true, name: true, currency: true } },
    },
  },
  creditedAccount: { select: { id: true, name: true } },
}

// GET /api/finanzas/checks?status=pending — "Cheques en cartera" (sección 4.2)
async function listChecks(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { status } = req.query
    const where = { workspaceId, deletedAt: null }
    if (status) where.status = status
    const checks = await prisma.financeCheck.findMany({ where, orderBy: { estimatedCollectionDate: 'asc' }, include: CHECK_INCLUDE })
    res.json(checks)
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/checks/:id/credit — sección 4.8 "Acreditar cheque". Recién
// acá se confirma fecha real + cuenta + impuestos (3.4). El movimiento original
// se actualiza a esa fecha/cuenta (en vez de mantener la fecha de recepción),
// así el cálculo de "disponible" (balances.controller.js) no necesita lógica
// especial para cheques: un movimiento sin cheque pendiente simplemente cuenta.
async function creditCheck(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const { creditedAt, creditedAccountId, taxIds } = req.body

    const check = await prisma.financeCheck.findFirst({ where: { id, workspaceId }, include: { movement: true } })
    if (!check) return res.status(404).json({ error: 'Cheque no encontrado' })
    if (check.status !== 'pending') return res.status(409).json({ error: 'Este cheque ya fue acreditado o rechazado' })

    const parsedDate = parseDate(creditedAt)
    if (!parsedDate) return res.status(400).json({ error: 'Fecha de acreditación inválida' })
    if (!Number.isInteger(creditedAccountId)) return res.status(400).json({ error: 'Elegí en qué cuenta se acreditó' })
    const account = await prisma.financeAccount.findFirst({ where: { id: creditedAccountId, workspaceId } })
    if (!account) return res.status(400).json({ error: 'Cuenta no encontrada' })

    const cleanTaxIds = Array.isArray(taxIds) ? [...new Set(taxIds.filter(Number.isInteger))] : []

    await prisma.$transaction(async (tx) => {
      await tx.financeMovement.update({ where: { id: check.movementId }, data: { date: parsedDate, accountId: creditedAccountId } })
      await tx.financeCheck.update({ where: { id }, data: { status: 'credited', creditedAt: parsedDate, creditedAccountId } })
      if (cleanTaxIds.length > 0) {
        await resolveAndApplyTaxes(tx, {
          workspaceId, accountId: creditedAccountId, taxIds: cleanTaxIds, baseAmount: check.movement.amount, currency: account.currency,
          date: parsedDate, itemId: check.movement.itemId, movementId: check.movementId,
        })
      }
    })

    await logFinanceAudit({
      workspaceId, entityType: 'check', entityId: id, action: 'update', userId: req.user.userId,
      summary: `Acreditó el cheque N° ${check.number} en "${account.name}"`,
    })

    const full = await prisma.financeCheck.findUnique({ where: { id }, include: CHECK_INCLUDE })
    res.json(full)
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/checks/:id/reject — sección 3.4: soft-delete del
// movimiento origen (restaura el saldo del cliente y se desaplica de la
// factura automáticamente, vía el filtro deletedAt:null que ya usan todas las
// queries de saldo/factura — no hace falta lógica extra acá). La tarea
// "Resolver cheque rechazado" la genera el motor de reglas on-demand de
// Pendientes (Etapa 8), no se crea acá.
async function rejectCheck(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const check = await prisma.financeCheck.findFirst({ where: { id, workspaceId }, include: { movement: { include: { item: true } } } })
    if (!check) return res.status(404).json({ error: 'Cheque no encontrado' })
    if (check.status !== 'pending') return res.status(409).json({ error: 'Este cheque ya fue acreditado o rechazado' })

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.financeCheck.update({ where: { id }, data: { status: 'rejected', rejectedAt: now } })
      await tx.financeMovement.update({ where: { id: check.movementId }, data: { deletedAt: now, deletedById: req.user.userId } })
    })

    await logFinanceAudit({
      workspaceId, entityType: 'check', entityId: id, action: 'update', userId: req.user.userId,
      summary: `Rechazó el cheque N° ${check.number} de ${check.movement.item?.name || '—'}`,
    })

    const full = await prisma.financeCheck.findUnique({ where: { id }, include: CHECK_INCLUDE })
    res.json(full)
  } catch (err) { next(err) }
}

module.exports = { listChecks, creditCheck, rejectCheck, CHECK_INCLUDE }
