const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { isValidMovementType } = require('../../lib/financeCatalog')

const CATEGORY_FIELD_LABELS = {
  name:   { label: 'Nombre' },
  type:   { label: 'Tipo' },
  active: { label: 'Activa', format: 'boolean' },
}

// GET /api/finanzas/categories?type=income|expense&active=true
async function listCategories(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { type, active } = req.query
    const where = { workspaceId }
    if (type) where.type = type
    if (active !== undefined) where.active = active === 'true'
    const categories = await prisma.financeCategory.findMany({
      where, orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: true, movements: true } } },
    })
    res.json(categories)
  } catch (err) { next(err) }
}

// POST /api/finanzas/categories
async function createCategory(req, res, next) {
  try {
    const { name, type } = req.body
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
    if (!isValidMovementType(type)) return res.status(400).json({ error: 'Tipo inválido (debe ser "income" o "expense")' })

    const workspaceId = req.workspace.id
    const dup = await prisma.financeCategory.findFirst({ where: { workspaceId, type, name: { equals: name.trim(), mode: 'insensitive' } }, select: { id: true } })
    if (dup) return res.status(409).json({ error: 'Ya existe una categoría con ese nombre en este tipo' })

    const category = await prisma.financeCategory.create({ data: { workspaceId, name: name.trim(), type } })
    await logFinanceAudit({ workspaceId, entityType: 'category', entityId: category.id, action: 'create', userId: req.user.userId, entityLabel: `categoría "${category.name}"` })
    res.status(201).json(category)
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/categories/:id — nombre/active editables siempre; `type` solo si no tiene uso todavía
async function updateCategory(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeCategory.findFirst({
      where: { id, workspaceId }, include: { _count: { select: { items: true, movements: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' })

    const { name, type, active } = req.body
    const data = {}
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Nombre requerido' })
      data.name = name.trim()
    }
    if (active !== undefined) data.active = !!active
    if (type !== undefined && type !== existing.type) {
      const used = existing._count.items + existing._count.movements
      if (used > 0) return res.status(409).json({ error: 'Esta categoría ya tiene items o movimientos — no se puede cambiar su tipo.' })
      if (!isValidMovementType(type)) return res.status(400).json({ error: 'Tipo inválido' })
      data.type = type
    }

    const category = await prisma.financeCategory.update({ where: { id }, data })
    await logFinanceAudit({
      workspaceId, entityType: 'category', entityId: id, action: 'update', userId: req.user.userId,
      entityLabel: `categoría "${existing.name}"`, before: existing, after: category, fieldLabels: CATEGORY_FIELD_LABELS,
    })
    res.json(category)
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/categories/:id — solo si nunca se usó
async function deleteCategory(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeCategory.findFirst({
      where: { id, workspaceId }, include: { _count: { select: { items: true, movements: true } } },
    })
    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' })
    if (existing._count.items > 0 || existing._count.movements > 0) {
      return res.status(409).json({ error: 'Esta categoría tiene items o movimientos — no se puede eliminar, solo desactivar.' })
    }
    await prisma.financeCategory.delete({ where: { id } })
    await logFinanceAudit({ workspaceId, entityType: 'category', entityId: id, action: 'delete', userId: req.user.userId, entityLabel: `categoría "${existing.name}"` })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory }
