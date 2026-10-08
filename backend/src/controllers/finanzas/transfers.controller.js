const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { toDecimal } = require('../../lib/financeMoney')
const { isValidTransferReason } = require('../../lib/financeCatalog')
const { resolveAndApplyTaxes, parseDate } = require('./_shared')

const TRANSFER_INCLUDE = {
  fromAccount: { select: { id: true, name: true, currency: true } },
  toAccount:   { select: { id: true, name: true, currency: true } },
  taxes:       { include: { tax: { select: { id: true, name: true } }, generatedMovement: { select: { id: true, amount: true, categoryId: true } } } },
}

// GET /api/finanzas/transfers?accountId=&from=&to= — drill-down de cuenta en
// Saldos (sección 4.2): las transferencias no tienen pestaña propia, se ven
// desde la cuenta involucrada (de origen o destino).
async function listTransfers(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { accountId, from, to } = req.query
    const where = { workspaceId, deletedAt: null }
    if (accountId) where.OR = [{ fromAccountId: Number(accountId) }, { toAccountId: Number(accountId) }]
    if (from || to) {
      const fromDate = parseDate(from)
      const toDate = parseDate(to)
      where.date = { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) }
    }
    const transfers = await prisma.financeTransfer.findMany({ where, orderBy: { date: 'desc' }, include: TRANSFER_INCLUDE })
    res.json(transfers)
  } catch (err) { next(err) }
}

// POST /api/finanzas/transfers — entre cuentas, o entre disponible y fondos de una
// misma cuenta (sección 4.7 del spec, selector "Entre cuentas"). No cuenta como
// ingreso/egreso. Los impuestos tildados van sobre la cuenta de ORIGEN (3.2/3.3).
async function createTransfer(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { date, reason, fromAccountId, fromAmount, fromIsFund, toAccountId, toAmount, toIsFund, note, taxIds } = req.body

    if (!isValidTransferReason(reason)) return res.status(400).json({ error: 'Motivo inválido' })
    const parsedDate = parseDate(date)
    if (!parsedDate) return res.status(400).json({ error: 'Fecha inválida' })
    if (!Number.isInteger(fromAccountId) || !Number.isInteger(toAccountId)) return res.status(400).json({ error: 'Cuentas requeridas' })
    // Misma cuenta solo tiene sentido como aporte/rescate (un lado "fondos", el
    // otro "disponible") — misma cuenta Y mismo lado (ambos disponible o ambos
    // fondos) sería un movimiento sin efecto.
    if (fromAccountId === toAccountId && !!fromIsFund === !!toIsFund) {
      return res.status(400).json({ error: 'Elegí dos cuentas distintas, o la misma cuenta moviendo entre disponible y fondos' })
    }

    let fromAmountDecimal, toAmountDecimal
    try {
      fromAmountDecimal = toDecimal(fromAmount)
      toAmountDecimal = toDecimal(toAmount)
    } catch { return res.status(400).json({ error: 'Montos inválidos' }) }
    if (fromAmountDecimal.lessThanOrEqualTo(0) || toAmountDecimal.lessThanOrEqualTo(0)) {
      return res.status(400).json({ error: 'Montos inválidos' })
    }

    const [fromAccount, toAccount] = await Promise.all([
      prisma.financeAccount.findFirst({ where: { id: fromAccountId, workspaceId } }),
      prisma.financeAccount.findFirst({ where: { id: toAccountId, workspaceId } }),
    ])
    if (!fromAccount) return res.status(400).json({ error: 'Cuenta de origen no encontrada' })
    if (!toAccount) return res.status(400).json({ error: 'Cuenta de destino no encontrada' })
    if (fromIsFund && !fromAccount.hasInvestments) return res.status(400).json({ error: `"${fromAccount.name}" no tiene inversiones habilitadas` })
    if (toIsFund && !toAccount.hasInvestments) return res.status(400).json({ error: `"${toAccount.name}" no tiene inversiones habilitadas` })

    const exchangeRate = fromAccount.currency !== toAccount.currency
      ? fromAmountDecimal.dividedBy(toAmountDecimal)
      : null

    const cleanTaxIds = Array.isArray(taxIds) ? [...new Set(taxIds.filter(Number.isInteger))] : []

    const transferId = await prisma.$transaction(async (tx) => {
      const transfer = await tx.financeTransfer.create({
        data: {
          workspaceId, date: parsedDate, reason, fromAccountId, fromAmount: fromAmountDecimal.toString(), fromIsFund: !!fromIsFund,
          toAccountId, toAmount: toAmountDecimal.toString(), toIsFund: !!toIsFund,
          exchangeRate: exchangeRate ? exchangeRate.toString() : null, note: note?.trim() || null, createdById: req.user.userId,
        },
      })

      if (cleanTaxIds.length > 0) {
        await resolveAndApplyTaxes(tx, {
          workspaceId, accountId: fromAccountId, taxIds: cleanTaxIds, baseAmount: fromAmountDecimal, currency: fromAccount.currency,
          date: transfer.date, itemId: null, transferId: transfer.id,
        })
      }

      return transfer.id
    })

    await logFinanceAudit({
      workspaceId, entityType: 'transfer', entityId: transferId, action: 'create', userId: req.user.userId,
      entityLabel: `transferencia ${fromAccount.name} → ${toAccount.name}`,
    })

    const full = await prisma.financeTransfer.findUnique({ where: { id: transferId }, include: TRANSFER_INCLUDE })
    res.status(201).json(full)
  } catch (err) { next(err) }
}

module.exports = { createTransfer, listTransfers, TRANSFER_INCLUDE }
