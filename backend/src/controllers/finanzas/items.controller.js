const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { trimmedOrNull } = require('./_shared')

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
  projectId:         { label: 'Proyecto vinculado' },
}

const LIST_INCLUDE = {
  category: { select: { id: true, name: true, type: true } },
  project:  { select: { id: true, name: true } },
}

const CUIT_RE = /^\d{2}-\d{8}-\d$/

function validateContactFields({ email, taxId }) {
  if (email !== undefined && email !== null && email !== '') {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())
    if (!ok) throw Object.assign(new Error('Mail inválido'), { status: 400, isOperational: true })
  }
  if (taxId !== undefined && taxId !== null && taxId !== '') {
    if (!CUIT_RE.test(String(taxId).trim())) {
      throw Object.assign(new Error('CUIT inválido (formato XX-XXXXXXXX-X)'), { status: 400, isOperational: true })
    }
  }
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
    const { name, categoryId, tracksAccount, contactName, phone, email, taxId, contractedService, notes, projectId } = req.body
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

    validateContactFields({ email, taxId })

    const item = await prisma.financeItem.create({
      data: {
        workspaceId, name: name.trim(), categoryId, tracksAccount: !!tracksAccount,
        contactName: trimmedOrNull(contactName), phone: trimmedOrNull(phone), email: trimmedOrNull(email),
        taxId: trimmedOrNull(taxId), contractedService: trimmedOrNull(contractedService), notes: trimmedOrNull(notes),
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

    const { name, categoryId, tracksAccount, active, contactName, phone, email, taxId, contractedService, notes, projectId } = req.body
    validateContactFields({ email, taxId })

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
      const used = existing._count.movements + existing._count.invoices
      if (used > 0) return res.status(409).json({ error: 'Este item ya tiene movimientos o facturas — no se puede cambiar si es cliente.' })
      data.tracksAccount = !!tracksAccount
    }
    if (contactName       !== undefined) data.contactName       = trimmedOrNull(contactName)
    if (phone              !== undefined) data.phone              = trimmedOrNull(phone)
    if (email               !== undefined) data.email               = trimmedOrNull(email)
    if (taxId                !== undefined) data.taxId                = trimmedOrNull(taxId)
    if (contractedService !== undefined) data.contractedService = trimmedOrNull(contractedService)
    if (notes               !== undefined) data.notes               = trimmedOrNull(notes)
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
