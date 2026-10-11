const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { isValidItemIvaCondition } = require('../../lib/financeCatalog')
const { trimmedOrNull, normalizeCuit } = require('./_shared')

const ITEM_FIELD_LABELS = {
  name:              { label: 'Nombre' },
  categoryId:        { label: 'Categoría habitual' },
  tracksAccount:     { label: 'Seguimiento de cuenta', format: 'boolean' },
  active:            { label: 'Activo', format: 'boolean' },
  contactName:       { label: 'Contacto' },
  phone:             { label: 'Teléfono' },
  email:             { label: 'Mail' },
  taxId:             { label: 'CUIT' },
  contractedService: { label: 'Servicio contratado' },
  ivaCondition:      { label: 'Condición de IVA' },
  defaultIssuerId:   { label: 'Emisor habitual' },
  projectId:         { label: 'Proyecto vinculado' },
}

const LIST_INCLUDE = {
  category:      { select: { id: true, name: true, type: true } },
  project:       { select: { id: true, name: true } },
  defaultIssuer: { select: { id: true, name: true, taxCondition: true } },
}

const CUIT_RE = /^\d{2}-\d{8}-\d$/

// Valida email/CUIT/condición de IVA y devuelve el CUIT ya normalizado
// ("20-32315642-6") — acepta 11 dígitos seguidos, no hace falta tipear los
// guiones a mano. `taxId` en el resultado es `undefined` si no vino en el
// body (el caller distingue "no tocar" de "vino vacío" con eso).
function validateContactFields({ email, taxId, ivaCondition }) {
  if (email !== undefined && email !== null && email !== '') {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())
    if (!ok) throw Object.assign(new Error('Mail inválido'), { status: 400, isOperational: true })
  }
  let normalizedTaxId = taxId
  if (taxId !== undefined && taxId !== null && taxId !== '') {
    normalizedTaxId = normalizeCuit(taxId)
    if (!CUIT_RE.test(normalizedTaxId)) {
      throw Object.assign(new Error('CUIT inválido (debe tener 11 dígitos)'), { status: 400, isOperational: true })
    }
  }
  if (ivaCondition !== undefined && !isValidItemIvaCondition(ivaCondition)) {
    throw Object.assign(new Error('Condición de IVA inválida'), { status: 400, isOperational: true })
  }
  return { taxId: normalizedTaxId }
}

async function validateDefaultIssuer(workspaceId, defaultIssuerId) {
  if (defaultIssuerId === undefined || defaultIssuerId === null) return
  const issuer = await prisma.financeIssuer.findFirst({ where: { id: defaultIssuerId, workspaceId }, select: { id: true } })
  if (!issuer) throw Object.assign(new Error('Emisor no encontrado'), { status: 400, isOperational: true })
}

// GET /api/finanzas/items?search=&tracksAccount=true&active=true
async function listItems(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { search, tracksAccount, active } = req.query
    const where = { workspaceId }
    if (search && search.trim()) where.name = { contains: search.trim(), mode: 'insensitive' }
    if (tracksAccount !== undefined) where.tracksAccount = tracksAccount === 'true'
    if (active !== undefined) where.active = active === 'true'
    const items = await prisma.financeItem.findMany({ where, orderBy: { name: 'asc' }, include: LIST_INCLUDE })
    res.json(items)
  } catch (err) { next(err) }
}

// GET /api/finanzas/items/:id
async function getItem(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const item = await prisma.financeItem.findFirst({
      where: { id: Number(req.params.id), workspaceId },
      include: { ...LIST_INCLUDE, _count: { select: { movements: true, invoices: true, extras: true, nextActions: true } } },
    })
    if (!item) return res.status(404).json({ error: 'Item no encontrado' })
    res.json(item)
  } catch (err) { next(err) }
}

// POST /api/finanzas/items
async function createItem(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { name, categoryId, tracksAccount, contactName, phone, email, taxId, contractedService, notes, ivaCondition, defaultIssuerId, projectId } = req.body
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
    if (!Number.isInteger(categoryId)) return res.status(400).json({ error: 'Categoría habitual requerida' })

    const category = await prisma.financeCategory.findFirst({ where: { id: categoryId, workspaceId }, select: { id: true } })
    if (!category) return res.status(400).json({ error: 'Categoría no encontrada' })

    const dup = await prisma.financeItem.findFirst({ where: { workspaceId, name: { equals: name.trim(), mode: 'insensitive' } }, select: { id: true } })
    if (dup) return res.status(409).json({ error: 'Ya existe un item con ese nombre' })

    if (projectId !== undefined && projectId !== null) {
      const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
      if (!project) return res.status(400).json({ error: 'Proyecto no encontrado' })
    }

    const { taxId: normalizedTaxId } = validateContactFields({ email, taxId, ivaCondition })
    await validateDefaultIssuer(workspaceId, defaultIssuerId)

    const item = await prisma.financeItem.create({
      data: {
        workspaceId, name: name.trim(), categoryId, tracksAccount: !!tracksAccount,
        contactName: trimmedOrNull(contactName), phone: trimmedOrNull(phone), email: trimmedOrNull(email),
        taxId: trimmedOrNull(normalizedTaxId), contractedService: trimmedOrNull(contractedService), notes: trimmedOrNull(notes),
        ivaCondition: ivaCondition || null, defaultIssuerId: defaultIssuerId ?? null,
        projectId: projectId ?? null,
      },
      include: LIST_INCLUDE,
    })
    await logFinanceAudit({ workspaceId, entityType: 'item', entityId: item.id, action: 'create', userId: req.user.userId, entityLabel: `item "${item.name}"` })
    res.status(201).json(item)
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/items/:id
async function updateItem(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeItem.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { movements: true, invoices: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Item no encontrado' })

    const { name, categoryId, tracksAccount, active, contactName, phone, email, taxId, contractedService, notes, ivaCondition, defaultIssuerId, projectId } = req.body
    const { taxId: normalizedTaxId } = validateContactFields({ email, taxId, ivaCondition })
    await validateDefaultIssuer(workspaceId, defaultIssuerId)

    const data = {}
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
      const dup = await prisma.financeItem.findFirst({ where: { workspaceId, id: { not: id }, name: { equals: name.trim(), mode: 'insensitive' } }, select: { id: true } })
      if (dup) return res.status(409).json({ error: 'Ya existe un item con ese nombre' })
      data.name = name.trim()
    }
    if (categoryId !== undefined) {
      const category = await prisma.financeCategory.findFirst({ where: { id: categoryId, workspaceId }, select: { id: true } })
      if (!category) return res.status(400).json({ error: 'Categoría no encontrada' })
      data.categoryId = categoryId
    }
    if (active !== undefined) data.active = !!active
    if (tracksAccount !== undefined && !!tracksAccount !== existing.tracksAccount) {
      // Prender "Seguimiento de cuenta" siempre es seguro (recién a partir de ahora
      // empieza a verse como cliente, no reescribe nada de lo ya cargado). Apagarlo
      // con historial ya cargado sí se bloquea — dejaría facturas/cobros existentes
      // sin la vista de cuenta corriente que los muestra.
      if (!tracksAccount) {
        const used = existing._count.movements + existing._count.invoices
        if (used > 0) return res.status(409).json({ error: 'Este item ya tiene movimientos o facturas — no se puede desactivar el seguimiento de cuenta.' })
      }
      data.tracksAccount = !!tracksAccount
    }
    if (contactName       !== undefined) data.contactName       = trimmedOrNull(contactName)
    if (phone              !== undefined) data.phone              = trimmedOrNull(phone)
    if (email               !== undefined) data.email               = trimmedOrNull(email)
    if (taxId                !== undefined) data.taxId                = trimmedOrNull(normalizedTaxId)
    if (contractedService !== undefined) data.contractedService = trimmedOrNull(contractedService)
    if (notes               !== undefined) data.notes               = trimmedOrNull(notes)
    if (ivaCondition        !== undefined) data.ivaCondition        = ivaCondition || null
    if (defaultIssuerId     !== undefined) data.defaultIssuerId     = defaultIssuerId
    if (projectId           !== undefined) {
      if (projectId !== null) {
        const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
        if (!project) return res.status(400).json({ error: 'Proyecto no encontrado' })
      }
      data.projectId = projectId
    }

    const item = await prisma.financeItem.update({ where: { id }, data, include: LIST_INCLUDE })
    await logFinanceAudit({
      workspaceId, entityType: 'item', entityId: id, action: 'update', userId: req.user.userId,
      entityLabel: `item "${existing.name}"`, before: existing, after: item, fieldLabels: ITEM_FIELD_LABELS,
    })
    res.json(item)
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/items/:id — solo si nunca se usó
async function deleteItem(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeItem.findFirst({
      where: { id, workspaceId },
      include: { _count: { select: { movements: true, invoices: true, extras: true, nextActions: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Item no encontrado' })
    const used = Object.values(existing._count).some(n => n > 0)
    if (used) return res.status(409).json({ error: 'Este item tiene movimientos/facturas/extras — no se puede eliminar, solo desactivar.' })
    await prisma.financeItem.delete({ where: { id } })
    await logFinanceAudit({ workspaceId, entityType: 'item', entityId: id, action: 'delete', userId: req.user.userId, entityLabel: `item "${existing.name}"` })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listItems, getItem, createItem, updateItem, deleteItem }
