const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { toDecimal } = require('../../lib/financeMoney')
const { parseDate } = require('./_shared')
const { isValidTaskStatus } = require('../../lib/financeCatalog')
const { syncDashboardOnResponsibleChange } = require('../../lib/financeTaskDashboard')
const { resolveModuleAccess, memberRoleNames } = require('../../lib/moduleAccess')
const { completeNextActionTx } = require('./nextActions.controller')

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
  const live = [] // [{ origin, originId, itemId, title, detail, amount, date }]

  // Regla 1: cheques por vencer (≤ hoy + 2 días), todavía pendientes.
  const dueChecks = await prisma.financeCheck.findMany({
    where: { workspaceId, status: 'pending', deletedAt: null, estimatedCollectionDate: { lte: addDays(today, 2) } },
    include: { movement: { include: { item: true } } },
  })
  for (const c of dueChecks) {
    live.push({ origin: 'check', originId: c.id, itemId: c.movement.itemId, title: `Controlar cheque N° ${c.number} de ${c.movement.item?.name || '—'}`, amount: c.movement.amount, date: c.estimatedCollectionDate })
  }

  // Regla 2: cheques rechazados sin resolver (condición terminal — una vez
  // creada la tarea, completarla a mano la cierra para siempre, ver nota arriba).
  const rejectedChecks = await prisma.financeCheck.findMany({
    where: { workspaceId, status: 'rejected', deletedAt: null },
    include: { movement: { include: { item: true } } },
  })
  for (const c of rejectedChecks) {
    live.push({ origin: 'check_rejected', originId: c.id, itemId: c.movement.itemId, title: `Resolver cheque rechazado de ${c.movement.item?.name || '—'}`, amount: c.movement.amount, date: c.rejectedAt })
  }

  // Regla 3: facturas vencidas, agrupadas por cliente. `kind:'invoice'`
  // excluye notas de crédito/débito (no se "cobran" individualmente — no
  // tienen cuenta corriente propia, ver computeInvoiceStatus) y una
  // rechazada por ARCA (nunca existió legalmente, no hay nada que cobrar).
  const overdueInvoices = await prisma.financeInvoice.findMany({
    where: { workspaceId, deletedAt: null, kind: 'invoice', arcaStatus: { not: 'rejected' }, dueDate: { lt: today } },
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
    live.push({ origin: 'invoice', originId: itemId, itemId, title, amount: totalPending.toString(), date: earliestDueDate })
  }

  // Regla 4: extra terminado con pagos pendientes — nombra el próximo a cobrar.
  const finishedExtras = await prisma.financeExtra.findMany({
    where: { workspaceId, deletedAt: null, status: 'finished' },
    include: { item: true, payments: { orderBy: { number: 'asc' } } },
  })
  for (const ex of finishedExtras) {
    const unpaid = ex.payments.filter(p => !p.movementId)
    if (unpaid.length === 0) continue
    live.push({ origin: 'extra', originId: ex.id, itemId: ex.itemId, title: `Cobrar ${ordinal(unpaid[0].number)} pago a ${ex.item.name}`, amount: unpaid[0].amount, date: ex.date })
  }

  // Regla 5: extra cobrado con equipo sin pagar.
  const collectedExtras = await prisma.financeExtra.findMany({
    where: { workspaceId, deletedAt: null, status: 'collected', teamPaid: false },
    include: { item: true },
  })
  for (const ex of collectedExtras) {
    if (toDecimal(ex.teamAmount).lessThanOrEqualTo(0)) continue
    live.push({ origin: 'extra', originId: ex.id, itemId: ex.itemId, title: `Pagar al equipo: ${ex.action} de ${ex.item.name}`, amount: ex.teamAmount, date: ex.date })
  }

  // Regla 6: próximas acciones vencidas.
  const dueActions = await prisma.financeNextAction.findMany({
    where: { workspaceId, deletedAt: null, completed: false, date: { lte: today } },
    include: { item: true },
  })
  for (const a of dueActions) {
    live.push({ origin: 'next_action', originId: a.id, itemId: a.itemId, title: a.text, detail: a.item ? `Cliente: ${a.item.name}` : null, date: a.date })
  }

  // Regla 7: facturas/notas de ARCA que quedaron sin confirmar (Etapa 5) —
  // "Reconciliar" vive en la factura misma (CustomerInvoicesPanel), esto es
  // solo el aviso para que no se pierdan de vista.
  const stuckArca = await prisma.financeInvoice.findMany({
    where: { workspaceId, deletedAt: null, arcaStatus: { in: ['indeterminate', 'conflict'] } },
    include: { item: true },
  })
  for (const inv of stuckArca) {
    live.push({ origin: 'invoice_reconcile', originId: inv.id, itemId: inv.itemId, title: `Reconciliar ${inv.kind === 'invoice' ? 'factura' : 'nota'} de ${inv.item.name}`, detail: inv.concept, date: inv.issueDate })
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
          data: { title: l.title, detail: l.detail ?? null, amount: l.amount ?? null, date: l.date ?? null, itemId: l.itemId ?? null },
        })
      } else {
        await tx.financeTask.create({
          data: { workspaceId, kind: 'generated', origin: l.origin, originId: l.originId, itemId: l.itemId ?? null, title: l.title, detail: l.detail ?? null, amount: l.amount ?? null, date: l.date ?? null, status: 'open' },
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
    include: { doneBy: { select: { id: true, name: true } }, responsible: { select: { id: true, name: true } }, item: { select: { id: true, name: true } } },
  })
}

// `itemId` presente = tareas manuales de ese cliente (para fusionarlas con
// "Próximas acciones" en su ficha, ver CustomerDetail.jsx) — no corre el sync
// de generadas, es solo una lectura puntual, no la cola completa de Pendientes.
async function listTasks(req, res, next) {
  try {
    const { itemId } = req.query
    if (itemId) {
      const tasks = await prisma.financeTask.findMany({
        where: { workspaceId: req.workspace.id, itemId: Number(itemId), kind: 'manual', deletedAt: null },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      })
      return res.json(tasks)
    }
    const tasks = await getOpenTasks(req.workspace.id)
    res.json(tasks)
  } catch (err) { next(err) }
}

// POST /api/finanzas/tasks — manual: { title, detail?, date?, amount?, itemId? }
// `itemId` es opcional: vincula la tarea a un cliente para que aparezca
// también en su ficha (fusionada con "Próximas acciones").
async function createTask(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { title, detail, date, amount, itemId } = req.body
    if (!title?.trim()) return res.status(400).json({ error: 'Título requerido' })
    const parsedDate = date ? parseDate(date) : null
    if (date && !parsedDate) return res.status(400).json({ error: 'Fecha inválida' })

    let resolvedItemId = null
    if (itemId != null) {
      if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Cliente inválido' })
      const item = await prisma.financeItem.findFirst({ where: { id: itemId, workspaceId }, select: { id: true } })
      if (!item) return res.status(400).json({ error: 'Cliente no encontrado' })
      resolvedItemId = item.id
    }

    const task = await prisma.financeTask.create({
      data: {
        workspaceId, kind: 'manual', title: title.trim(), detail: detail?.trim() || null, itemId: resolvedItemId,
        date: parsedDate, amount: amount != null ? toDecimal(amount).toString() : null, createdById: req.user.userId,
      },
    })
    await logFinanceAudit({ workspaceId, entityType: 'task', entityId: task.id, action: 'create', userId: req.user.userId, entityLabel: `tarea "${task.title}"` })
    res.status(201).json(task)
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/tasks/:id — { status: 'done'|'open', postponedUntil?, responsibleId? }
// `responsibleId` (asignar/reasignar/sacar responsable) sincroniza la Task del
// dashboard de esa persona — mismo mecanismo que el to-do de Reuniones, ver
// lib/financeTaskDashboard.js.
async function updateTask(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeTask.findFirst({ where: { id, workspaceId, deletedAt: null } })
    if (!existing) return res.status(404).json({ error: 'Tarea no encontrada' })

    const { status, postponedUntil, responsibleId } = req.body
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

    if (responsibleId !== undefined) {
      if (responsibleId !== null) {
        if (!Number.isInteger(responsibleId)) return res.status(400).json({ error: 'Responsable inválido' })
        const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: responsibleId, active: true } })
        if (!member) return res.status(400).json({ error: 'Responsable no encontrado' })
      }
      const needsProject = !existing.taskId && responsibleId
      if (needsProject && !req.workspace.financeTaskProjectId) {
        return res.status(400).json({ error: 'Configurá primero el proyecto para tareas de Finanzas en Configuración.' })
      }
      data.responsibleId = responsibleId
    }

    // Completar/reabrir una tarea generada de origin='next_action' sincroniza
    // también la acción de la que nació — antes era de un solo sentido
    // (cliente→Pendientes sí cerraba esta tarea, pero Pendientes→cliente no
    // marcaba la acción, así que seguía apareciendo pendiente en la ficha del
    // cliente). "Posponer" no toca la acción — no tiene equivalente ahí.
    let task
    await prisma.$transaction(async (tx) => {
      task = await tx.financeTask.update({ where: { id }, data, include: { responsible: { select: { id: true, name: true } } } })
      if ((status === 'done' || status === 'open') && existing.origin === 'next_action' && existing.originId) {
        const action = await tx.financeNextAction.findFirst({ where: { id: existing.originId, workspaceId, deletedAt: null } })
        if (action) await completeNextActionTx(tx, action, { completed: status === 'done', userId: req.user.userId })
      }
    })

    if (responsibleId !== undefined) {
      await syncDashboardOnResponsibleChange(task, {
        projectId: req.workspace.financeTaskProjectId, workspaceId, tz: req.workspace.timezone, requesterId: req.user.userId,
      })
      task = await prisma.financeTask.findUnique({ where: { id }, include: { responsible: { select: { id: true, name: true } } } })
    }

    await logFinanceAudit({
      workspaceId, entityType: 'task', entityId: id, action: 'update', userId: req.user.userId,
      summary: responsibleId !== undefined
        ? (responsibleId ? `Asignó "${existing.title}" a alguien` : `Quitó el responsable de "${existing.title}"`)
        : status === 'done' ? `Completó "${existing.title}"` : status === 'postponed' ? `Pospuso "${existing.title}"` : `Reabrió "${existing.title}"`,
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

// GET /api/finanzas/team — responsables asignables en Pendientes: miembros
// activos admin/owner o con acceso al módulo finanzas (por rol o agregados
// por persona, ver lib/moduleAccess) — mismo patrón que GET /ventas/team.
// Antes el selector de responsable mostraba a TODO el workspace.
async function getTeam(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { roles: financeRoles, userIds: financeUserIds } = resolveModuleAccess(req.workspace, 'finanzas')

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId, active: true },
      select: {
        role: true, teamRole: true, extraTeamRoles: true,
        user: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { user: { name: 'asc' } },
    })

    const team = members
      .filter(m => ['admin', 'owner'].includes(m.role) || memberRoleNames(m).some(r => financeRoles.includes(r)) || financeUserIds.includes(m.user.id))
      .map(m => ({ id: m.user.id, name: m.user.name, avatar: m.user.avatar, teamRole: m.teamRole, role: m.role }))

    res.json(team)
  } catch (err) { next(err) }
}

module.exports = { listTasks, createTask, updateTask, deleteTask, getOpenTasks, getTeam }
