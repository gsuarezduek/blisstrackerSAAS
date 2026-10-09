const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { toDecimal } = require('../../lib/financeMoney')
const { parseDate } = require('./_shared')
const { isValidTaskStatus } = require('../../lib/financeCatalog')

function todayUTCNoon() {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12))
}
function addDays(date, days) {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}
const ORDINALS = ['', '1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', '9°', '10°']
function ordinal(n) { return ORDINALS[n] || `${n}°` }

/**
 * Motor de reglas on-demand (3.8): se recalcula cada vez que se pide la lista
 * (no hay cron — volumen bajo por workspace, cálculo barato, evita datos
 * stale). Por cada condición viva, crea la tarea si no existe y REFRESCA
 * título/monto/fecha si ya existía (ej. "Cobrar 1 factura" → "Cobrar 2
 * facturas" al sumarse una segunda vencida) — pero nunca toca `status` ni
 * `postponedUntil` de una tarea ya existente: completarla/posponerla a mano
 * es definitivo hasta que la condición deje de cumplirse (entonces se cierra
 * sola) o, en condiciones sin resolución posible (ej. cheque rechazado), para
 * siempre — no se "revive" una tarea generada ya resuelta.
 */
async function syncGeneratedTasks(workspaceId) {
  const today = todayUTCNoon()
  const live = [] // [{ origin, originId, title, detail, amount, date }]

  // Regla 1: cheques por vencer (≤ hoy + 2 días), todavía pendientes.
  const dueChecks = await prisma.financeCheck.findMany({
    where: { workspaceId, status: 'pending', deletedAt: null, estimatedCollectionDate: { lte: addDays(today, 2) } },
    include: { movement: { include: { item: true } } },
  })
  for (const c of dueChecks) {
    live.push({ origin: 'check', originId: c.id, title: `Controlar cheque N° ${c.number} de ${c.movement.item?.name || '—'}`, amount: c.movement.amount, date: c.estimatedCollectionDate })
  }

  // Regla 2: cheques rechazados sin resolver (condición terminal — una vez
  // creada la tarea, completarla a mano la cierra para siempre, ver nota arriba).
  const rejectedChecks = await prisma.financeCheck.findMany({
    where: { workspaceId, status: 'rejected', deletedAt: null },
    include: { movement: { include: { item: true } } },
  })
  for (const c of rejectedChecks) {
    live.push({ origin: 'check_rejected', originId: c.id, title: `Resolver cheque rechazado de ${c.movement.item?.name || '—'}`, amount: c.movement.amount, date: c.rejectedAt })
  }

  // Regla 3: facturas vencidas, agrupadas por cliente.
  const overdueInvoices = await prisma.financeInvoice.findMany({
    where: { workspaceId, deletedAt: null, dueDate: { lt: today } },
    include: { item: true, collections: { where: { deletedAt: null }, select: { amount: true } } },
  })
  const overdueByItem = new Map()
  for (const inv of overdueInvoices) {
    const collected = inv.collections.reduce((s, m) => s.plus(toDecimal(m.amount)), toDecimal(0))
    if (collected.greaterThanOrEqualTo(toDecimal(inv.amount))) continue // ya saldada, no cuenta como vencida
    const list = overdueByItem.get(inv.itemId) || []
    list.push({ invoice: inv, pending: toDecimal(inv.amount).minus(collected) })
    overdueByItem.set(inv.itemId, list)
  }
  for (const [itemId, list] of overdueByItem) {
    const item = list[0].invoice.item
    const totalPending = list.reduce((s, x) => s.plus(x.pending), toDecimal(0))
    const title = list.length === 1 ? `Cobrar ${list[0].invoice.number} a ${item.name}` : `Cobrar ${list.length} facturas a ${item.name}`
    const earliestDueDate = list.map(x => x.invoice.dueDate).sort((a, b) => new Date(a) - new Date(b))[0]
    live.push({ origin: 'invoice', originId: itemId, title, amount: totalPending.toString(), date: earliestDueDate })
  }

  // Regla 4: extra terminado con pagos pendientes — nombra el próximo a cobrar.
  const finishedExtras = await prisma.financeExtra.findMany({
    where: { workspaceId, deletedAt: null, status: 'finished' },
    include: { item: true, payments: { orderBy: { number: 'asc' } } },
  })
  for (const ex of finishedExtras) {
    const unpaid = ex.payments.filter(p => !p.movementId)
    if (unpaid.length === 0) continue
    live.push({ origin: 'extra', originId: ex.id, title: `Cobrar ${ordinal(unpaid[0].number)} pago a ${ex.item.name}`, amount: unpaid[0].amount, date: ex.date })
  }

  // Regla 5: extra cobrado con equipo sin pagar.
  const collectedExtras = await prisma.financeExtra.findMany({
    where: { workspaceId, deletedAt: null, status: 'collected', teamPaid: false },
    include: { item: true },
  })
  for (const ex of collectedExtras) {
    if (toDecimal(ex.teamAmount).lessThanOrEqualTo(0)) continue
    live.push({ origin: 'extra', originId: ex.id, title: `Pagar al equipo: ${ex.action} de ${ex.item.name}`, amount: ex.teamAmount, date: ex.date })
  }

  // Regla 6: próximas acciones vencidas.
  const dueActions = await prisma.financeNextAction.findMany({
    where: { workspaceId, deletedAt: null, completed: false, date: { lte: today } },
    include: { item: true },
  })
  for (const a of dueActions) {
    live.push({ origin: 'next_action', originId: a.id, title: a.text, detail: a.item ? `Cliente: ${a.item.name}` : null, date: a.date })
  }

  const liveKeySet = new Set(live.map(l => `${l.origin}:${l.originId}`))

  const existingTasks = await prisma.financeTask.findMany({ where: { workspaceId, kind: 'generated' } })
  const existingByKey = new Map(existingTasks.map(t => [`${t.origin}:${t.originId}`, t]))

  await prisma.$transaction(async (tx) => {
    for (const l of live) {
      const key = `${l.origin}:${l.originId}`
      const existing = existingByKey.get(key)
      if (existing) {
        await tx.financeTask.update({
          where: { id: existing.id },
          data: { title: l.title, detail: l.detail ?? null, amount: l.amount ?? null, date: l.date ?? null },
        })
      } else {
        await tx.financeTask.create({
          data: { workspaceId, kind: 'generated', origin: l.origin, originId: l.originId, title: l.title, detail: l.detail ?? null, amount: l.amount ?? null, date: l.date ?? null, status: 'open' },
        })
      }
    }
    // Cierre solo: tareas generadas abiertas/pospuestas cuya condición ya no se cumple.
    const toClose = existingTasks.filter(t => (t.status === 'open' || t.status === 'postponed') && !liveKeySet.has(`${t.origin}:${t.originId}`))
    if (toClose.length) {
      await tx.financeTask.updateMany({ where: { id: { in: toClose.map(t => t.id) } }, data: { status: 'done', doneAt: new Date() } })
    }
  })
}

// GET /api/finanzas/tasks — sección 4.6. Recalcula las generadas on-demand
// antes de listar. `postponed` con postponedUntil ya pasado se muestra de
// nuevo (no hace falta reabrirla a mano). Compartida con aiSummary.controller.js
// (el resumen IA lee las mismas tareas que se le muestran al usuario).
async function getOpenTasks(workspaceId) {
  await syncGeneratedTasks(workspaceId)
  const today = todayUTCNoon()
  return prisma.financeTask.findMany({
    where: {
      workspaceId, deletedAt: null,
      OR: [{ status: { in: ['open'] } }, { status: 'postponed', postponedUntil: { lte: today } }],
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    include: { doneBy: { select: { id: true, name: true } } },
  })
}

async function listTasks(req, res, next) {
  try {
    const tasks = await getOpenTasks(req.workspace.id)
    res.json(tasks)
  } catch (err) { next(err) }
}

// POST /api/finanzas/tasks — manual: { title, detail?, date?, amount? }
async function createTask(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { title, detail, date, amount } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'Título requerido' })
    const parsedDate = date ? parseDate(date) : null
    if (date && !parsedDate) return res.status(400).json({ error: 'Fecha inválida' })

    const task = await prisma.financeTask.create({
      data: {
        workspaceId, kind: 'manual', title: title.trim(), detail: detail?.trim() || null,
        date: parsedDate, amount: amount != null ? toDecimal(amount).toString() : null, createdById: req.user.userId,
      },
    })
    await logFinanceAudit({ workspaceId, entityType: 'task', entityId: task.id, action: 'create', userId: req.user.userId, entityLabel: `tarea "${task.title}"` })
    res.status(201).json(task)
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/tasks/:id — { status: 'done'|'open', postponedUntil? }
async function updateTask(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeTask.findFirst({ where: { id, workspaceId, deletedAt: null } })
    if (!existing) return res.status(404).json({ error: 'Tarea no encontrada' })

    const { status, postponedUntil } = req.body
    const data = {}
    if (status !== undefined) {
      if (!isValidTaskStatus(status)) return res.status(400).json({ error: 'Estado inválido' })
      data.status = status
      if (status === 'done') { data.doneAt = new Date(); data.doneById = req.user.userId }
      if (status === 'postponed') {
        const d = parseDate(postponedUntil)
        if (!d) return res.status(400).json({ error: 'Falta la fecha hasta la que posponer' })
        data.postponedUntil = d
      }
      if (status === 'open') { data.doneAt = null; data.doneById = null; data.postponedUntil = null }
    }

    const task = await prisma.financeTask.update({ where: { id }, data })
    await logFinanceAudit({
      workspaceId, entityType: 'task', entityId: id, action: 'update', userId: req.user.userId,
      summary: status === 'done' ? `Completó "${existing.title}"` : status === 'postponed' ? `Pospuso "${existing.title}"` : `Reabrió "${existing.title}"`,
    })
    res.json(task)
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/tasks/:id — solo tareas manuales (las generadas se
// cierran solas o se completan a mano, no se borran — reaparecerían en el
// próximo sync si la condición sigue viva).
async function deleteTask(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeTask.findFirst({ where: { id, workspaceId, deletedAt: null } })
    if (!existing) return res.status(404).json({ error: 'Tarea no encontrada' })
    if (existing.kind !== 'manual') return res.status(409).json({ error: 'Las tareas generadas no se eliminan — completalas o posponelas.' })
    await prisma.financeTask.update({ where: { id }, data: { deletedAt: new Date(), deletedById: req.user.userId } })
    await logFinanceAudit({ workspaceId, entityType: 'task', entityId: id, action: 'delete', userId: req.user.userId, entityLabel: `tarea "${existing.title}"` })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listTasks, createTask, updateTask, deleteTask, getOpenTasks }
