const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { isValidAccountType } = require('../../lib/financeCatalog')
const { businessError, toDecimalInput, trimmedOrNull } = require('./_shared')

const ACCOUNT_FIELD_LABELS = {
  name:           { label: 'Nombre' },
  type:           { label: 'Tipo' },
  currency:       { label: 'Moneda' },
  initialBalance: { label: 'Saldo inicial', format: 'money' },
  hasInvestments: { label: 'Tiene inversiones', format: 'boolean' },
  active:         { label: 'Activa', format: 'boolean' },
}

const LIST_INCLUDE = {
  taxes: { include: { tax: { select: { id: true, name: true, percentage: true } } } },
  _count: { select: { movements: true } },
}

function normalizeCurrency(value) {
  const t = String(value || '').trim().toUpperCase()
  if (t.length < 2 || t.length > 6) throw businessError(400, 'Moneda inválida')
  return t
}

// GET /api/finanzas/accounts?active=true
async function listAccounts(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { active } = req.query
    const where = { workspaceId }
    if (active !== undefined) where.active = active === 'true'
    const accounts = await prisma.financeAccount.findMany({ where, orderBy: { name: 'asc' }, include: LIST_INCLUDE })
    res.json(accounts)
  } catch (err) { next(err) }
}

// GET /api/finanzas/accounts/:id
async function getAccount(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const account = await prisma.financeAccount.findFirst({
      where: { id: Number(req.params.id), workspaceId },
      include: LIST_INCLUDE,
    })
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' })
    res.json(account)
  } catch (err) { next(err) }
}

// POST /api/finanzas/accounts
async function createAccount(req, res, next) {
  try {
    const { name, type, currency, initialBalance, hasInvestments } = req.body
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
    if (!isValidAccountType(type)) return res.status(400).json({ error: 'Tipo de cuenta inválido' })

    const account = await prisma.financeAccount.create({
      data: {
        workspaceId: req.workspace.id,
        name: name.trim(),
        type,
        currency: normalizeCurrency(currency),
        initialBalance: toDecimalInput(initialBalance ?? 0, 'Saldo inicial') ?? '0',
        hasInvestments: !!hasInvestments,
        createdById: req.user.userId,
      },
    })
    await logFinanceAudit({
      workspaceId: req.workspace.id, entityType: 'account', entityId: account.id, action: 'create',
      userId: req.user.userId, entityLabel: `cuenta "${account.name}"`,
    })
    res.status(201).json(account)
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/accounts/:id
async function updateAccount(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeAccount.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { movements: true, transfersFrom: true, transfersTo: true, fundValuations: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada' })

    const { name, type, currency, initialBalance, hasInvestments, active } = req.body
    const data = {}
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
      data.name = name.trim()
    }
    if (type !== undefined) {
      if (!isValidAccountType(type)) return res.status(400).json({ error: 'Tipo de cuenta inválido' })
      data.type = type
    }
    if (currency !== undefined) data.currency = normalizeCurrency(currency)
    if (hasInvestments !== undefined) data.hasInvestments = !!hasInvestments
    if (active !== undefined) data.active = !!active
    if (initialBalance !== undefined) {
      const used = existing._count.movements + existing._count.transfersFrom + existing._count.transfersTo + existing._count.fundValuations
      if (used > 0) return res.status(409).json({ error: 'El saldo inicial se carga una sola vez — esta cuenta ya tiene movimientos.' })
      data.initialBalance = toDecimalInput(initialBalance, 'Saldo inicial') ?? '0'
    }

    const account = await prisma.financeAccount.update({ where: { id }, data })
    await logFinanceAudit({
      workspaceId, entityType: 'account', entityId: id, action: 'update', userId: req.user.userId,
      entityLabel: `cuenta "${existing.name}"`, before: existing, after: account, fieldLabels: ACCOUNT_FIELD_LABELS,
    })
    res.json(account)
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/accounts/:id — solo si nunca se usó (si no, 409: desactivar en su lugar)
async function deleteAccount(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeAccount.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { movements: true, transfersFrom: true, transfersTo: true, fundValuations: true, checksCredited: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Cuenta no encontrada' })
    const used = Object.values(existing._count).some(n => n > 0)
    if (used) return res.status(409).json({ error: 'Esta cuenta tiene movimientos — no se puede eliminar, solo desactivar.' })

    await prisma.financeAccount.delete({ where: { id } })
    await logFinanceAudit({
      workspaceId, entityType: 'account', entityId: id, action: 'delete', userId: req.user.userId,
      entityLabel: `cuenta "${existing.name}"`,
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// PUT /api/finanzas/accounts/:id/taxes — body { taxIds: number[] } — reemplaza el set completo (atómico)
async function syncAccountTaxes(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const account = await prisma.financeAccount.findFirst({ where: { id, workspaceId }, select: { id: true, name: true } })
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' })

    const taxIds = Array.isArray(req.body.taxIds) ? [...new Set(req.body.taxIds.filter(Number.isInteger))] : []
    if (taxIds.length) {
      const validCount = await prisma.financeTax.count({ where: { id: { in: taxIds }, workspaceId } })
      if (validCount !== taxIds.length) return res.status(400).json({ error: 'Alguno de los impuestos no existe en este workspace' })
    }

    await prisma.$transaction([
      prisma.financeAccountTax.deleteMany({ where: { accountId: id } }),
      ...(taxIds.length
        ? [prisma.financeAccountTax.createMany({ data: taxIds.map(taxId => ({ workspaceId, accountId: id, taxId })) })]
        : []),
    ])

    const updated = await prisma.financeAccount.findUnique({ where: { id }, include: LIST_INCLUDE })
    await logFinanceAudit({
      workspaceId, entityType: 'account', entityId: id, action: 'update', userId: req.user.userId,
      summary: `Actualizó los impuestos ofrecidos en "${account.name}" (${taxIds.length} impuesto${taxIds.length === 1 ? '' : 's'})`,
    })
    res.json(updated)
  } catch (err) { next(err) }
}

module.exports = { listAccounts, getAccount, createAccount, updateAccount, deleteAccount, syncAccountTaxes }
