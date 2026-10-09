const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { parseDate } = require('./_shared')
const { isValidNextActionRecurrence } = require('../../lib/financeCatalog')

// GET /api/finanzas/next-actions?itemId= — sección 4.5, columna lateral "Próximas acciones"
async function listNextActions(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { itemId } = req.query
    const where = { workspaceId, deletedAt: null }
    if (itemId) where.itemId = Number(itemId)
    const actions = await prisma.financeNextAction.findMany({
      where, orderBy: [{ completed: 'asc' }, { date: 'asc' }],
    })
    res.json(actions)
  } catch (err) { next(err) }
}

// POST /api/finanzas/next-actions — { itemId, text, date, recurrence }
async function createNextAction(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { itemId, text, date, recurrence } = req.body
    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Cliente requerido' })
    const item = await prisma.financeItem.findFirst({ where: { id: itemId, workspaceId } })
    if (!item) return res.status(400).json({ error: 'Cliente no encontrado' })
    if (!text?.trim()) return res.status(400).json({ error: 'Texto requerido' })
    const parsedDate = parseDate(date)
    if (!parsedDate) return res.status(400).json({ error: 'Fecha inválida' })
    const rec = recurrence || 'once'
    if (!isValidNextActionRecurrence(rec)) return res.status(400).json({ error: 'Repetición inválida' })

    const action = await prisma.financeNextAction.create({
      data: { workspaceId, itemId, text: text.trim(), date: parsedDate, recurrence: rec, createdById: req.user.userId },
    })
    await logFinanceAudit({ workspaceId, entityType: 'nextAction', entityId: action.id, action: 'create', userId: req.user.userId, entityLabel: `próxima acción "${action.text}" de ${item.name}` })
    res.status(201).json(action)
  } catch (err) { next(err) }
}

// Próxima ocurrencia de una acción recurrente (3.7): mensual +1 mes, anual +1 año.
function nextOccurrenceDate(date, recurrence) {
  const d = new Date(date)
  if (recurrence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1)
  else if (recurrence === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d
}

// PATCH /api/finanzas/next-actions/:id — { text?, date?, completed? }
async function updateNextAction(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeNextAction.findFirst({ where: { id, workspaceId, deletedAt: null }, include: { item: { select: { name: true } } } })
    if (!existing) return res.status(404).json({ error: 'Próxima acción no encontrada' })

    const { text, date, completed } = req.body
    const data = {}
    if (text !== undefined) { if (!text.trim()) return res.status(400).json({ error: 'Texto requerido' }); data.text = text.trim() }
    if (date !== undefined) { const d = parseDate(date); if (!d) return res.status(400).json({ error: 'Fecha inválida' }); data.date = d }

    let created = null
    if (completed !== undefined) {
      data.completed = !!completed
      data.completedAt = completed ? new Date() : null
    }

    const action = await prisma.$transaction(async (tx) => {
      const updated = await tx.financeNextAction.update({ where: { id }, data })
      // Al completar una acción recurrente, se crea la siguiente ocurrencia (3.7).
      if (completed === true && existing.recurrence !== 'once') {
        created = await tx.financeNextAction.create({
          data: {
            workspaceId, itemId: existing.itemId, text: existing.text,
            date: nextOccurrenceDate(updated.date, existing.recurrence), recurrence: existing.recurrence,
            previousActionId: existing.id, createdById: req.user.userId,
          },
        })
      }
      return updated
    })

    if (completed !== undefined) {
      await logFinanceAudit({
        workspaceId, entityType: 'nextAction', entityId: id, action: 'update', userId: req.user.userId,
        summary: completed
          ? `Completó "${existing.text}"${created ? ' (se generó la siguiente ocurrencia)' : ''}`
          : `Reabrió "${existing.text}"`,
      })
    } else {
      await logFinanceAudit({
        workspaceId, entityType: 'nextAction', entityId: id, action: 'update', userId: req.user.userId,
        entityLabel: `próxima acción de ${existing.item.name}`,
        before: { text: existing.text, date: existing.date }, after: { text: action.text, date: action.date },
        fieldLabels: { text: { label: 'Texto' }, date: { label: 'Fecha', format: 'date' } },
      })
    }

    res.json({ ...action, nextOccurrence: created })
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/next-actions/:id
async function deleteNextAction(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeNextAction.findFirst({ where: { id, workspaceId, deletedAt: null }, include: { item: { select: { name: true } } } })
    if (!existing) return res.status(404).json({ error: 'Próxima acción no encontrada' })
    await prisma.financeNextAction.update({ where: { id }, data: { deletedAt: new Date(), deletedById: req.user.userId } })
    await logFinanceAudit({ workspaceId, entityType: 'nextAction', entityId: id, action: 'delete', userId: req.user.userId, entityLabel: `próxima acción "${existing.text}" de ${existing.item.name}` })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listNextActions, createNextAction, updateNextAction, deleteNextAction }
