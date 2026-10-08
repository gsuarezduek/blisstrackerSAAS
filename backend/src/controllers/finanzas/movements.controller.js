const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { toDecimal } = require('../../lib/financeMoney')
const { isValidMovementType, isValidPaymentMethod, isValidAccountApplication } = require('../../lib/financeCatalog')
const { resolveAndApplyTaxes } = require('./_shared')

const MOVEMENT_INCLUDE = {
  item:     { select: { id: true, name: true, tracksAccount: true } },
  category: { select: { id: true, name: true, type: true } },
  account:  { select: { id: true, name: true, currency: true } },
  check:    true,
  taxes:    { include: { tax: { select: { id: true, name: true } } } },
  childMovements: {
    include: {
      category: { select: { id: true, name: true } },
      generatedForTax: { select: { id: true, name: true, percentage: true } },
    },
  },
}

// POST /api/finanzas/movements — carga de ingreso o egreso (sección 4.7 del spec)
async function createMovement(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { type, date, itemId, categoryId, accountId, amount, note, paymentMethod, accountApplication, invoiceId, taxIds, check } = req.body

    if (!isValidMovementType(type)) return res.status(400).json({ error: 'Tipo inválido' })
    if (!date) return res.status(400).json({ error: 'Fecha requerida' })
    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Item requerido' })
    if (!Number.isInteger(categoryId)) return res.status(400).json({ error: 'Categoría requerida' })
    if (!Number.isInteger(accountId)) return res.status(400).json({ error: 'Cuenta requerida' })

    let amountDecimal
    try { amountDecimal = toDecimal(amount) } catch { return res.status(400).json({ error: 'Monto inválido' }) }
    if (!amountDecimal.isFinite() || amountDecimal.lessThanOrEqualTo(0)) return res.status(400).json({ error: 'Monto inválido' })

    const [item, category, account] = await Promise.all([
      prisma.financeItem.findFirst({ where: { id: itemId, workspaceId, active: true } }),
      prisma.financeCategory.findFirst({ where: { id: categoryId, workspaceId } }),
      prisma.financeAccount.findFirst({ where: { id: accountId, workspaceId } }),
    ])
    if (!item) return res.status(400).json({ error: 'Item no encontrado' })
    if (!category) return res.status(400).json({ error: 'Categoría no encontrada' })
    if (category.type !== type) return res.status(400).json({ error: `Esa categoría es de ${category.type === 'income' ? 'ingresos' : 'egresos'}` })
    if (!account) return res.status(400).json({ error: 'Cuenta no encontrada' })

    let resolvedPaymentMethod = null
    let resolvedAccountApplication = null
    let resolvedInvoiceId = null

    if (type === 'income') {
      if (!paymentMethod || !isValidPaymentMethod(paymentMethod)) return res.status(400).json({ error: 'Forma de cobro requerida' })
      resolvedPaymentMethod = paymentMethod

      if (item.tracksAccount) {
        if (!accountApplication || !isValidAccountApplication(accountApplication)) {
          return res.status(400).json({ error: 'Indicá si aplica a factura, a cuenta, o no afecta la cuenta' })
        }
        resolvedAccountApplication = accountApplication
        if (accountApplication === 'invoice') {
          if (!Number.isInteger(invoiceId)) return res.status(400).json({ error: 'Falta la factura' })
          const invoice = await prisma.financeInvoice.findFirst({ where: { id: invoiceId, workspaceId, itemId, deletedAt: null } })
          if (!invoice) return res.status(400).json({ error: 'Factura no encontrada' })
          const collectedAgg = await prisma.financeMovement.aggregate({ where: { invoiceId, deletedAt: null }, _sum: { amount: true } })
          const pending = toDecimal(invoice.amount).minus(toDecimal(collectedAgg._sum.amount || 0))
          if (amountDecimal.greaterThan(pending)) {
            return res.status(400).json({ error: `El monto supera el saldo pendiente de la factura ($ ${pending.toString()})` })
          }
          resolvedInvoiceId = invoiceId
        }
      } else if (accountApplication) {
        return res.status(400).json({ error: 'Este item no tiene seguimiento de cuenta' })
      }

      if (paymentMethod === 'check') {
        if (!check?.number?.trim() || !check?.issuingBank?.trim() || !check?.estimatedCollectionDate) {
          return res.status(400).json({ error: 'Faltan datos del cheque (número, banco emisor, fecha de cobro)' })
        }
      }
    } else if (paymentMethod || accountApplication) {
      return res.status(400).json({ error: 'Forma de cobro y aplicación a cuenta son solo para ingresos' })
    }

    const cleanTaxIds = Array.isArray(taxIds) ? [...new Set(taxIds.filter(Number.isInteger))] : []

    const movementId = await prisma.$transaction(async (tx) => {
      const movement = await tx.financeMovement.create({
        data: {
          workspaceId, type, date: new Date(date), itemId, categoryId, accountId,
          amount: amountDecimal.toString(), note: note?.trim() || null,
          paymentMethod: resolvedPaymentMethod, accountApplication: resolvedAccountApplication, invoiceId: resolvedInvoiceId,
          createdById: req.user.userId,
        },
      })

      if (resolvedPaymentMethod === 'check') {
        // Con cheque, el bloque de impuestos se oculta en el modal y se
        // completa recién al acreditar (ver checks.controller.js, Etapa 5) —
        // cualquier taxIds que haya llegado igual se ignora a propósito.
        await tx.financeCheck.create({
          data: {
            workspaceId, movementId: movement.id, number: check.number.trim(), issuingBank: check.issuingBank.trim(),
            estimatedCollectionDate: new Date(check.estimatedCollectionDate),
          },
        })
      } else if (cleanTaxIds.length > 0) {
        await resolveAndApplyTaxes(tx, {
          workspaceId, accountId, taxIds: cleanTaxIds, baseAmount: amountDecimal, currency: account.currency,
          date: movement.date, itemId: movement.itemId, movementId: movement.id,
        })
      }

      return movement.id
    })

    await logFinanceAudit({
      workspaceId, entityType: 'movement', entityId: movementId, action: 'create', userId: req.user.userId,
      entityLabel: `${type === 'income' ? 'ingreso' : 'egreso'} de ${item.name}`,
    })

    const full = await prisma.financeMovement.findUnique({ where: { id: movementId }, include: MOVEMENT_INCLUDE })
    res.status(201).json(full)
  } catch (err) { next(err) }
}

module.exports = { createMovement, MOVEMENT_INCLUDE }
