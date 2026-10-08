const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { toDecimal } = require('../../lib/financeMoney')
const { isValidMovementType, isValidPaymentMethod, isValidAccountApplication } = require('../../lib/financeCatalog')
const { resolveAndApplyTaxes, businessError, parseDate } = require('./_shared')

const MOVEMENT_INCLUDE = {
  item:      { select: { id: true, name: true, tracksAccount: true } },
  category:  { select: { id: true, name: true, type: true } },
  account:   { select: { id: true, name: true, currency: true } },
  invoice:   { select: { id: true, number: true } },
  createdBy: { select: { id: true, name: true, avatar: true } },
  check:    true,
  taxes:    { include: { tax: { select: { id: true, name: true } } } },
  childMovements: {
    include: {
      category: { select: { id: true, name: true } },
      generatedForTax: { select: { id: true, name: true, percentage: true } },
    },
  },
}

/**
 * Valida y resuelve los campos de un movimiento (item/categoría/cuenta/monto/
 * forma de cobro/aplicación a cuenta) — compartido por create y update, que
 * arman `fields` combinando el body nuevo con lo existente (en update, un
 * campo no enviado conserva su valor actual). Lanza `businessError` (400) si
 * algo no valida; nunca escribe en DB.
 */
async function resolveMovementFields(workspaceId, fields, { excludeMovementId } = {}) {
  const { type, itemId, categoryId, accountId, amount, paymentMethod, accountApplication, invoiceId, check } = fields

  if (!isValidMovementType(type)) throw businessError(400, 'Tipo inválido')
  if (!Number.isInteger(itemId)) throw businessError(400, 'Item requerido')
  if (!Number.isInteger(categoryId)) throw businessError(400, 'Categoría requerida')
  if (!Number.isInteger(accountId)) throw businessError(400, 'Cuenta requerida')

  let amountDecimal
  try { amountDecimal = toDecimal(amount) } catch { throw businessError(400, 'Monto inválido') }
  if (!amountDecimal.isFinite() || amountDecimal.lessThanOrEqualTo(0)) throw businessError(400, 'Monto inválido')

  const [item, category, account] = await Promise.all([
    prisma.financeItem.findFirst({ where: { id: itemId, workspaceId } }),
    prisma.financeCategory.findFirst({ where: { id: categoryId, workspaceId } }),
    prisma.financeAccount.findFirst({ where: { id: accountId, workspaceId } }),
  ])
  if (!item) throw businessError(400, 'Item no encontrado')
  if (!category) throw businessError(400, 'Categoría no encontrada')
  if (category.type !== type) throw businessError(400, `Esa categoría es de ${category.type === 'income' ? 'ingresos' : 'egresos'}`)
  if (!account) throw businessError(400, 'Cuenta no encontrada')

  let resolvedPaymentMethod = null
  let resolvedAccountApplication = null
  let resolvedInvoiceId = null

  if (type === 'income') {
    if (!paymentMethod || !isValidPaymentMethod(paymentMethod)) throw businessError(400, 'Forma de cobro requerida')
    resolvedPaymentMethod = paymentMethod

    if (item.tracksAccount) {
      if (!accountApplication || !isValidAccountApplication(accountApplication)) {
        throw businessError(400, 'Indicá si aplica a factura, a cuenta, o no afecta la cuenta')
      }
      resolvedAccountApplication = accountApplication
      if (accountApplication === 'invoice') {
        if (!Number.isInteger(invoiceId)) throw businessError(400, 'Falta la factura')
        const invoice = await prisma.financeInvoice.findFirst({ where: { id: invoiceId, workspaceId, itemId, deletedAt: null } })
        if (!invoice) throw businessError(400, 'Factura no encontrada')
        const collectedAgg = await prisma.financeMovement.aggregate({
          where: { invoiceId, deletedAt: null, ...(excludeMovementId ? { id: { not: excludeMovementId } } : {}) },
          _sum: { amount: true },
        })
        const pending = toDecimal(invoice.amount).minus(toDecimal(collectedAgg._sum.amount || 0))
        if (amountDecimal.greaterThan(pending)) {
          throw businessError(400, `El monto supera el saldo pendiente de la factura ($ ${pending.toString()})`)
        }
        resolvedInvoiceId = invoiceId
      }
    } else if (accountApplication) {
      throw businessError(400, 'Este item no tiene seguimiento de cuenta')
    }

    if (paymentMethod === 'check') {
      if (!check?.number?.trim() || !check?.issuingBank?.trim() || !check?.estimatedCollectionDate) {
        throw businessError(400, 'Faltan datos del cheque (número, banco emisor, fecha de cobro)')
      }
    }
  } else if (paymentMethod || accountApplication) {
    throw businessError(400, 'Forma de cobro y aplicación a cuenta son solo para ingresos')
  }

  return { item, category, account, amountDecimal, resolvedPaymentMethod, resolvedAccountApplication, resolvedInvoiceId }
}

// GET /api/finanzas/movements?type=income|expense&from=&to=&itemId=&categoryId=&accountId=&search=
async function listMovements(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { type, from, to, itemId, categoryId, accountId, search } = req.query
    const where = { workspaceId, deletedAt: null }
    if (type) where.type = type
    if (itemId) where.itemId = Number(itemId)
    if (categoryId) where.categoryId = Number(categoryId)
    if (accountId) where.accountId = Number(accountId)
    if (from || to) {
      where.date = {}
      const fromDate = parseDate(from)
      const toDate = parseDate(to)
      if (fromDate) where.date.gte = fromDate
      if (toDate) where.date.lte = toDate
    }
    if (search && search.trim()) where.item = { name: { contains: search.trim(), mode: 'insensitive' } }

    const movements = await prisma.financeMovement.findMany({ where, orderBy: { date: 'desc' }, include: MOVEMENT_INCLUDE })
    res.json(movements)
  } catch (err) { next(err) }
}

// GET /api/finanzas/movements/:id
async function getMovement(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const movement = await prisma.financeMovement.findFirst({ where: { id: Number(req.params.id), workspaceId }, include: MOVEMENT_INCLUDE })
    if (!movement) return res.status(404).json({ error: 'Movimiento no encontrado' })
    res.json(movement)
  } catch (err) { next(err) }
}

// POST /api/finanzas/movements — carga de ingreso o egreso (sección 4.7 del spec)
async function createMovement(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { type, date, itemId, categoryId, accountId, amount, note, paymentMethod, accountApplication, invoiceId, taxIds, check } = req.body

    const parsedDate = parseDate(date)
    if (!parsedDate) return res.status(400).json({ error: 'Fecha inválida' })

    const resolved = await resolveMovementFields(workspaceId, { type, itemId, categoryId, accountId, amount, paymentMethod, accountApplication, invoiceId, check })
    const { item, account, amountDecimal, resolvedPaymentMethod, resolvedAccountApplication, resolvedInvoiceId } = resolved

    const cleanTaxIds = Array.isArray(taxIds) ? [...new Set(taxIds.filter(Number.isInteger))] : []

    const movementId = await prisma.$transaction(async (tx) => {
      const movement = await tx.financeMovement.create({
        data: {
          workspaceId, type, date: parsedDate, itemId, categoryId, accountId,
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
            estimatedCollectionDate: parseDate(check.estimatedCollectionDate) || new Date(check.estimatedCollectionDate),
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

// Borra (hard) las líneas de impuesto aplicadas a un movimiento + sus egresos
// hijos generados — usado al editar (recalcular desde cero) y al intentar
// "reabrir" un movimiento que había quedado con impuestos viejos. Nunca se
// soft-deletean: son 100% derivados, no hay nada que "restaurar" ahí (restaurar
// el padre vuelve a generarlos).
async function clearGeneratedTaxes(tx, movementId) {
  const lines = await tx.financeMovementTax.findMany({ where: { movementId }, select: { id: true, generatedMovementId: true } })
  if (lines.length === 0) return
  await tx.financeMovementTax.deleteMany({ where: { movementId } })
  const childIds = lines.map(l => l.generatedMovementId).filter(Boolean)
  if (childIds.length) await tx.financeMovement.deleteMany({ where: { id: { in: childIds } } })
}

// PATCH /api/finanzas/movements/:id
async function updateMovement(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeMovement.findFirst({
      where: { id, workspaceId },
      include: { item: true, category: true, account: true, invoice: true, check: true, taxes: true },
    })
    if (!existing) return res.status(404).json({ error: 'Movimiento no encontrado' })
    if (existing.sourceMovementId != null) {
      return res.status(409).json({ error: 'Este movimiento se generó automáticamente por un impuesto — editalo desde el movimiento original.' })
    }
    if (existing.check && existing.check.status !== 'pending') {
      return res.status(409).json({ error: 'No se puede editar un movimiento con un cheque ya acreditado o rechazado.' })
    }

    const body = req.body
    if (body.type !== undefined && body.type !== existing.type) {
      return res.status(400).json({ error: 'El tipo (ingreso/egreso) no se puede editar — eliminá el movimiento y cargalo de nuevo.' })
    }
    if (body.paymentMethod !== undefined && body.paymentMethod !== existing.paymentMethod) {
      return res.status(400).json({ error: 'La forma de cobro no se puede editar — eliminá el movimiento y cargalo de nuevo.' })
    }

    const merged = {
      type: existing.type,
      itemId: body.itemId !== undefined ? body.itemId : existing.itemId,
      categoryId: body.categoryId !== undefined ? body.categoryId : existing.categoryId,
      accountId: body.accountId !== undefined ? body.accountId : existing.accountId,
      amount: body.amount !== undefined ? body.amount : existing.amount,
      paymentMethod: existing.paymentMethod,
      accountApplication: body.accountApplication !== undefined ? body.accountApplication : existing.accountApplication,
      invoiceId: body.invoiceId !== undefined ? body.invoiceId : existing.invoiceId,
      check: existing.check ? { number: existing.check.number, issuingBank: existing.check.issuingBank, estimatedCollectionDate: existing.check.estimatedCollectionDate } : undefined,
    }

    const resolved = await resolveMovementFields(workspaceId, merged, { excludeMovementId: id })
    const { item, account, amountDecimal, resolvedAccountApplication, resolvedInvoiceId } = resolved

    const parsedDate = body.date !== undefined ? parseDate(body.date) : existing.date
    if (parsedDate === undefined) return res.status(400).json({ error: 'Fecha inválida' })

    const hasCheck = !!existing.check
    const cleanTaxIds = body.taxIds !== undefined
      ? [...new Set((Array.isArray(body.taxIds) ? body.taxIds : []).filter(Number.isInteger))]
      : existing.taxes.map(t => t.taxId)

    await prisma.$transaction(async (tx) => {
      await tx.financeMovement.update({
        where: { id },
        data: {
          date: parsedDate, itemId: merged.itemId, categoryId: merged.categoryId, accountId: merged.accountId,
          amount: amountDecimal.toString(), note: body.note !== undefined ? (body.note?.trim() || null) : undefined,
          accountApplication: resolvedAccountApplication, invoiceId: resolvedInvoiceId,
        },
      })

      if (!hasCheck) {
        await clearGeneratedTaxes(tx, id)
        if (cleanTaxIds.length > 0) {
          await resolveAndApplyTaxes(tx, {
            workspaceId, accountId: merged.accountId, taxIds: cleanTaxIds, baseAmount: amountDecimal, currency: account.currency,
            date: parsedDate, itemId: merged.itemId, movementId: id,
          })
        }
      }
    })

    await logFinanceAudit({
      workspaceId, entityType: 'movement', entityId: id, action: 'update', userId: req.user.userId,
      entityLabel: `${existing.type === 'income' ? 'ingreso' : 'egreso'} de ${item.name}`,
      before: {
        date: existing.date, item: existing.item.name, category: existing.category.name, account: existing.account.name,
        amount: existing.amount.toString(), note: existing.note,
      },
      after: {
        date: parsedDate, item: item.name, category: resolved.category.name,
        account: account.name, amount: amountDecimal.toString(), note: body.note !== undefined ? (body.note?.trim() || null) : existing.note,
      },
      fieldLabels: {
        date: { label: 'Fecha', format: 'date' }, item: { label: 'Item' }, category: { label: 'Categoría' },
        account: { label: 'Cuenta' }, amount: { label: 'Monto', format: 'money' }, note: { label: 'Nota' },
      },
    })

    const full = await prisma.financeMovement.findUnique({ where: { id }, include: MOVEMENT_INCLUDE })
    res.json(full)
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/movements/:id — soft-delete, cascada a hijos (impuestos) y al cheque
async function deleteMovement(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeMovement.findFirst({ where: { id, workspaceId }, include: { item: true, check: true } })
    if (!existing) return res.status(404).json({ error: 'Movimiento no encontrado' })
    if (existing.sourceMovementId != null) {
      return res.status(409).json({ error: 'Este movimiento se generó automáticamente por un impuesto — eliminalo destildando el impuesto en el movimiento original.' })
    }

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.financeMovement.update({ where: { id }, data: { deletedAt: now, deletedById: req.user.userId } })
      await tx.financeMovement.updateMany({ where: { sourceMovementId: id, deletedAt: null }, data: { deletedAt: now, deletedById: req.user.userId } })
      if (existing.check) await tx.financeCheck.update({ where: { id: existing.check.id }, data: { deletedAt: now, deletedById: req.user.userId } })
    })

    await logFinanceAudit({
      workspaceId, entityType: 'movement', entityId: id, action: 'delete', userId: req.user.userId,
      entityLabel: `${existing.type === 'income' ? 'ingreso' : 'egreso'} de ${existing.item?.name || '—'}`,
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// POST /api/finanzas/movements/:id/restore
async function restoreMovement(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeMovement.findFirst({
      where: { id, workspaceId, deletedAt: { not: null } },
      include: { item: true, check: true, invoice: true },
    })
    if (!existing) return res.status(404).json({ error: 'Movimiento eliminado no encontrado' })
    if (existing.sourceMovementId != null) {
      return res.status(409).json({ error: 'Este movimiento se generó automáticamente por un impuesto — restauralo desde el movimiento original.' })
    }

    if (existing.accountApplication === 'invoice' && existing.invoiceId) {
      const invoice = await prisma.financeInvoice.findFirst({ where: { id: existing.invoiceId, workspaceId, deletedAt: null } })
      if (invoice) {
        const collectedAgg = await prisma.financeMovement.aggregate({ where: { invoiceId: invoice.id, deletedAt: null }, _sum: { amount: true } })
        const pending = toDecimal(invoice.amount).minus(toDecimal(collectedAgg._sum.amount || 0))
        if (toDecimal(existing.amount).greaterThan(pending)) {
          return res.status(409).json({ error: `No se puede restaurar: superaría el saldo pendiente de la factura ($ ${pending.toString()})` })
        }
      }
    }

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.financeMovement.update({ where: { id }, data: { deletedAt: null, deletedById: null } })
      await tx.financeMovement.updateMany({ where: { sourceMovementId: id }, data: { deletedAt: null, deletedById: null } })
      if (existing.check) await tx.financeCheck.update({ where: { id: existing.check.id }, data: { deletedAt: null, deletedById: null } })
    })

    await logFinanceAudit({
      workspaceId, entityType: 'movement', entityId: id, action: 'restore', userId: req.user.userId,
      entityLabel: `${existing.type === 'income' ? 'ingreso' : 'egreso'} de ${existing.item?.name || '—'}`,
    })
    const full = await prisma.financeMovement.findUnique({ where: { id }, include: MOVEMENT_INCLUDE })
    res.json(full)
  } catch (err) { next(err) }
}

module.exports = { createMovement, listMovements, getMovement, updateMovement, deleteMovement, restoreMovement, MOVEMENT_INCLUDE }
