const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { isValidTaxAppliesTo, isValidTaxBaseType } = require('../../lib/financeCatalog')
const { toDecimalInput, assertNoTaxCycle } = require('./_shared')

const TAX_FIELD_LABELS = {
  name:       { label: 'Nombre' },
  percentage: { label: 'Porcentaje', format: 'percent' },
  appliesTo:  { label: 'Aplica a' },
  baseType:   { label: 'Base de cálculo' },
  baseTaxId:  { label: 'Impuesto base' },
  active:     { label: 'Activo', format: 'boolean' },
}

const LIST_INCLUDE = {
  baseTax: { select: { id: true, name: true } },
  _count: { select: { accounts: true, movementLines: true, dependents: true } },
}

// GET /api/finanzas/taxes?active=true
async function listTaxes(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { active } = req.query
    const where = { workspaceId }
    if (active !== undefined) where.active = active === 'true'
    const taxes = await prisma.financeTax.findMany({ where, orderBy: { name: 'asc' }, include: LIST_INCLUDE })
    res.json(taxes)
  } catch (err) { next(err) }
}

function validatePercentage(percentage) {
  const n = Number(percentage)
  if (!Number.isFinite(n) || n < 0 || n > 999.999) {
    throw Object.assign(new Error('Porcentaje inválido'), { status: 400, isOperational: true })
  }
}

// POST /api/finanzas/taxes
async function createTax(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { name, percentage, appliesTo, baseType, baseTaxId } = req.body
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
    if (!isValidTaxAppliesTo(appliesTo)) return res.status(400).json({ error: 'Valor de "aplica a" inválido' })
    if (!isValidTaxBaseType(baseType)) return res.status(400).json({ error: 'Base de cálculo inválida' })
    validatePercentage(percentage)

    let resolvedBaseTaxId = null
    if (baseType === 'other_tax') {
      if (!Number.isInteger(baseTaxId)) return res.status(400).json({ error: 'Falta el impuesto base' })
      resolvedBaseTaxId = baseTaxId
    }

    const tax = await prisma.$transaction(async (tx) => {
      if (resolvedBaseTaxId != null) await assertNoTaxCycle(tx, workspaceId, null, resolvedBaseTaxId)
      return tx.financeTax.create({
        data: {
          workspaceId, name: name.trim(), percentage: toDecimalInput(percentage, 'Porcentaje'),
          appliesTo, baseType, baseTaxId: resolvedBaseTaxId,
        },
        include: LIST_INCLUDE,
      })
    })
    await logFinanceAudit({ workspaceId, entityType: 'tax', entityId: tax.id, action: 'create', userId: req.user.userId, entityLabel: `impuesto "${tax.name}"` })
    res.status(201).json(tax)
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/taxes/:id
async function updateTax(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeTax.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Impuesto no encontrado' })

    const { name, percentage, appliesTo, baseType, baseTaxId, active } = req.body
    const data = {}
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
      data.name = name.trim()
    }
    if (percentage !== undefined) { validatePercentage(percentage); data.percentage = toDecimalInput(percentage, 'Porcentaje') }
    if (appliesTo !== undefined) {
      if (!isValidTaxAppliesTo(appliesTo)) return res.status(400).json({ error: 'Valor de "aplica a" inválido' })
      data.appliesTo = appliesTo
    }
    if (active !== undefined) data.active = !!active

    const nextBaseType = baseType !== undefined ? baseType : existing.baseType
    if (baseType !== undefined) {
      if (!isValidTaxBaseType(baseType)) return res.status(400).json({ error: 'Base de cálculo inválida' })
      data.baseType = baseType
    }
    if (nextBaseType === 'other_tax') {
      const nextBaseTaxId = baseTaxId !== undefined ? baseTaxId : existing.baseTaxId
      if (!Number.isInteger(nextBaseTaxId)) return res.status(400).json({ error: 'Falta el impuesto base' })
      if (baseTaxId !== undefined) data.baseTaxId = nextBaseTaxId
    } else if (baseType !== undefined) {
      // Pasó a basarse en el movimiento: ya no tiene sentido guardar un baseTaxId.
      data.baseTaxId = null
    }

    const tax = await prisma.$transaction(async (tx) => {
      if (data.baseTaxId !== undefined && data.baseTaxId != null) {
        await assertNoTaxCycle(tx, workspaceId, id, data.baseTaxId)
      }
      return tx.financeTax.update({ where: { id }, data, include: LIST_INCLUDE })
    })
    await logFinanceAudit({
      workspaceId, entityType: 'tax', entityId: id, action: 'update', userId: req.user.userId,
      entityLabel: `impuesto "${existing.name}"`, before: existing, after: tax, fieldLabels: TAX_FIELD_LABELS,
    })
    res.json(tax)
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/taxes/:id — solo si nunca se usó (ni aplicado, ni ofrecido en una cuenta, ni base de otro)
async function deleteTax(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeTax.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { accounts: true, movementLines: true, dependents: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Impuesto no encontrado' })
    const used = Object.values(existing._count).some(n => n > 0)
    if (used) return res.status(409).json({ error: 'Este impuesto está en uso (ofrecido en una cuenta, aplicado a un movimiento, o base de otro impuesto) — no se puede eliminar, solo desactivar.' })
    await prisma.financeTax.delete({ where: { id } })
    await logFinanceAudit({ workspaceId, entityType: 'tax', entityId: id, action: 'delete', userId: req.user.userId, entityLabel: `impuesto "${existing.name}"` })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listTaxes, createTax, updateTax, deleteTax }
