const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { toDecimal, roundForCurrency } = require('../../lib/financeMoney')
const { parseDate, businessError } = require('./_shared')
const { isValidExtraStatus } = require('../../lib/financeCatalog')
const { teamPaidAmount, recomputeTeamPaid } = require('../../lib/financeExtras')

const EXTRA_INCLUDE = {
  item: { select: { id: true, name: true, categoryId: true, tracksAccount: true } },
  payments: { orderBy: { number: 'asc' }, include: { movement: { select: { id: true, date: true, amount: true } } } },
  teamPayouts: {
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { id: true, name: true, avatar: true } },
      movement: { select: { id: true, date: true, amount: true, deletedAt: true, account: { select: { id: true, name: true, currency: true } } } },
    },
  },
}

// Shape de respuesta: los pagos al equipo cuyo egreso se borró no se muestran
// (el egreso se puede restaurar desde Egresos y el pago vuelve a aparecer).
function shapeExtra(e) {
  return {
    ...e,
    teamPayouts: e.teamPayouts.filter(p => p.movement && !p.movement.deletedAt),
    teamPaidAmount: teamPaidAmount(e.teamPayouts).toString(),
    paidCount: e.payments.filter(p => p.movementId).length,
    totalPayments: e.payments.length,
  }
}

/**
 * Reparte `total` en `count` cuotas iguales (sección 2: "Default: pagos
 * iguales (ej. 2 pagos → 50% / 50%)"). Último pago se ajusta por redondeo
 * para que la suma cierre exacto contra `total` (con Decimal, nunca float).
 */
function splitEqualPayments(total, count) {
  const totalDecimal = toDecimal(total)
  const pct = toDecimal(100).dividedBy(count).toDecimalPlaces(3)
  const payments = []
  let assignedAmount = toDecimal(0)
  for (let i = 1; i <= count; i++) {
    const isLast = i === count
    const amount = isLast ? totalDecimal.minus(assignedAmount) : roundForCurrency(totalDecimal.times(pct).dividedBy(100), 'ARS')
    assignedAmount = assignedAmount.plus(amount)
    payments.push({ number: i, percentage: isLast ? toDecimal(100).minus(pct.times(count - 1)).toString() : pct.toString(), amount: amount.toString() })
  }
  return payments
}

// GET /api/finanzas/extras?from=&to=&itemId=&status=&payments=pending|complete
async function listExtras(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { from, to, itemId, status, payments } = req.query
    const where = { workspaceId, deletedAt: null }
    if (itemId) where.itemId = Number(itemId)
    if (status) where.status = status
    if (from || to) {
      const fromDate = parseDate(from)
      const toDate = parseDate(to)
      where.date = { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) }
    }

    let extras = await prisma.financeExtra.findMany({ where, orderBy: { date: 'desc' }, include: EXTRA_INCLUDE })
    if (payments === 'pending') extras = extras.filter(e => e.payments.some(p => !p.movementId))
    if (payments === 'complete') extras = extras.filter(e => e.payments.every(p => p.movementId))

    res.json(extras.map(shapeExtra))
  } catch (err) { next(err) }
}

// POST /api/finanzas/extras — { itemId, date, action, total, companyAmount, providerAmount, numberOfPayments }
async function createExtra(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { itemId, date, action, total, companyAmount, providerAmount, numberOfPayments } = req.body

    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Cliente requerido' })
    const item = await prisma.financeItem.findFirst({ where: { id: itemId, workspaceId } })
    if (!item) return res.status(400).json({ error: 'Cliente no encontrado' })
    if (!action?.trim()) return res.status(400).json({ error: 'Acción requerida' })
    const parsedDate = parseDate(date)
    if (!parsedDate) return res.status(400).json({ error: 'Fecha inválida' })

    // Empresa/proveedores son opcionales (default 0) — solo el total es obligatorio.
    // Equipo nunca se carga a mano: es siempre el resto (total - empresa - proveedores).
    let totalDecimal, companyDecimal, providerDecimal
    try {
      totalDecimal = toDecimal(total)
      companyDecimal = toDecimal(companyAmount || 0)
      providerDecimal = toDecimal(providerAmount || 0)
    } catch { return res.status(400).json({ error: 'Montos inválidos' }) }
    if (!totalDecimal.isFinite() || totalDecimal.lessThanOrEqualTo(0)) return res.status(400).json({ error: 'Total inválido' })
    if (!companyDecimal.isFinite() || companyDecimal.lessThan(0) || !providerDecimal.isFinite() || providerDecimal.lessThan(0)
      || companyDecimal.plus(providerDecimal).greaterThan(totalDecimal)) {
      return res.status(400).json({ error: 'Los montos de empresa y proveedores no pueden superar el total' })
    }
    const teamDecimal = totalDecimal.minus(companyDecimal).minus(providerDecimal)

    const count = Number.isInteger(numberOfPayments) && numberOfPayments > 0 ? numberOfPayments : 1
    const splits = splitEqualPayments(totalDecimal, count)

    const extra = await prisma.$transaction(async (tx) => {
      const created = await tx.financeExtra.create({
        data: {
          workspaceId, itemId, date: parsedDate, action: action.trim(),
          total: totalDecimal.toString(), companyAmount: companyDecimal.toString(), providerAmount: providerDecimal.toString(), teamAmount: teamDecimal.toString(),
          createdById: req.user.userId,
        },
      })
      await tx.financeExtraPayment.createMany({
        data: splits.map(s => ({ workspaceId, extraId: created.id, number: s.number, percentage: s.percentage, amount: s.amount })),
      })
      return created
    })

    await logFinanceAudit({ workspaceId, entityType: 'extra', entityId: extra.id, action: 'create', userId: req.user.userId, entityLabel: `extra "${extra.action}" de ${item.name}` })
    const full = await prisma.financeExtra.findUnique({ where: { id: extra.id }, include: EXTRA_INCLUDE })
    res.status(201).json(shapeExtra(full))
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/extras/:id — { action?, status?, teamPaid?, notes?,
// total?, companyAmount?, providerAmount?, payments?: [{number,percentage,amount}] }
// `payments` reemplaza SOLO las cuotas sin cobrar (sección "decisiones menores":
// las ya cobradas quedan fijas) — valida que la suma de montos no cambie el total.
// Editar total/empresa/proveedores (antes bloqueado del todo) está permitido
// siempre: lo ya cobrado queda fijo, la diferencia se reparte sola entre las
// cuotas pendientes (o se crea una nueva si no quedaba ninguna) salvo que el
// caller mande también un `payments` explícito, que manda por sobre eso.
async function updateExtra(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeExtra.findFirst({ where: { id, workspaceId, deletedAt: null }, include: { item: { select: { name: true } }, payments: true } })
    if (!existing) return res.status(404).json({ error: 'Extra no encontrado' })

    const { action, status, teamPaid, notes, payments, total, companyAmount, providerAmount } = req.body
    const data = {}
    if (action !== undefined) { if (!action.trim()) return res.status(400).json({ error: 'Acción requerida' }); data.action = action.trim() }
    if (status !== undefined) { if (!isValidExtraStatus(status)) return res.status(400).json({ error: 'Estado inválido' }); data.status = status }
    if (teamPaid !== undefined) data.teamPaid = !!teamPaid
    if (notes !== undefined) data.notes = notes?.trim() || null

    const paidRows = existing.payments.filter(p => p.movementId)
    const paidTotal = paidRows.reduce((s, p) => s.plus(toDecimal(p.amount)), toDecimal(0))

    const amountsChanged = total !== undefined || companyAmount !== undefined || providerAmount !== undefined
    let newTotalDecimal = toDecimal(existing.total)
    if (amountsChanged) {
      let newTotal, newCompany, newProvider
      try {
        newTotal = toDecimal(total !== undefined ? total : existing.total)
        newCompany = toDecimal(companyAmount !== undefined ? companyAmount : existing.companyAmount)
        newProvider = toDecimal(providerAmount !== undefined ? providerAmount : existing.providerAmount)
      } catch { return res.status(400).json({ error: 'Montos inválidos' }) }
      if (!newTotal.isFinite() || newTotal.lessThanOrEqualTo(0)) return res.status(400).json({ error: 'Total inválido' })
      if (!newCompany.isFinite() || newCompany.lessThan(0) || !newProvider.isFinite() || newProvider.lessThan(0)
        || newCompany.plus(newProvider).greaterThan(newTotal)) {
        return res.status(400).json({ error: 'Los montos de empresa y proveedores no pueden superar el total' })
      }
      if (paidTotal.greaterThan(newTotal)) {
        return res.status(400).json({ error: `El total no puede ser menor a lo ya cobrado ($ ${paidTotal.toString()})` })
      }
      data.total = newTotal.toString()
      data.companyAmount = newCompany.toString()
      data.providerAmount = newProvider.toString()
      data.teamAmount = newTotal.minus(newCompany).minus(newProvider).toString()
      // Si quedó plata sin cobrar, un extra que estaba "cobrado" vuelve a "terminado"
      // (así el motor de reglas de Pendientes vuelve a avisar del pago que falta).
      if (existing.status === 'collected' && paidTotal.lessThan(newTotal)) data.status = 'finished'
      newTotalDecimal = newTotal
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.financeExtra.update({ where: { id }, data })

      if (Array.isArray(payments)) {
        const paidNumbers = new Set(paidRows.map(p => p.number))
        const unpaidPayments = payments.filter(p => !paidNumbers.has(p.number))
        const newUnpaidTotal = unpaidPayments.reduce((s, p) => s.plus(toDecimal(p.amount || 0)), toDecimal(0))
        if (!paidTotal.plus(newUnpaidTotal).equals(newTotalDecimal)) {
          throw businessError(400, 'La suma de las cuotas no cobradas debe completar el total del extra')
        }
        await tx.financeExtraPayment.deleteMany({ where: { extraId: id, movementId: null } })
        if (unpaidPayments.length) {
          await tx.financeExtraPayment.createMany({
            data: unpaidPayments.map(p => ({ workspaceId, extraId: id, number: p.number, percentage: String(p.percentage ?? 0), amount: String(p.amount) })),
          })
        }
      } else if (amountsChanged) {
        const remaining = newTotalDecimal.minus(paidTotal)
        await tx.financeExtraPayment.deleteMany({ where: { extraId: id, movementId: null } })
        if (remaining.greaterThan(0)) {
          const unpaidCount = existing.payments.length - paidRows.length
          const count = unpaidCount || 1
          const splits = splitEqualPayments(remaining, count)
          const usedNumbers = new Set(paidRows.map(p => p.number))
          const numbers = []
          for (let n = 1; numbers.length < count; n++) { if (!usedNumbers.has(n)) numbers.push(n) }
          await tx.financeExtraPayment.createMany({
            data: splits.map((s, idx) => ({ workspaceId, extraId: id, number: numbers[idx], percentage: s.percentage, amount: s.amount })),
          })
        }
      }

      // Con pagos al equipo registrados, "equipo pagado" sale de lo pagado vs
      // la parte del equipo (que puede haber cambiado recién).
      if (amountsChanged) await recomputeTeamPaid(tx, { extraId: id })
    })

    await logFinanceAudit({ workspaceId, entityType: 'extra', entityId: id, action: 'update', userId: req.user.userId, entityLabel: `extra "${existing.action}" de ${existing.item.name}` })
    const full = await prisma.financeExtra.findUnique({ where: { id }, include: EXTRA_INCLUDE })
    res.json(shapeExtra(full))
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/extras/:id
async function deleteExtra(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.financeExtra.findFirst({ where: { id, workspaceId, deletedAt: null }, include: { item: { select: { name: true } } } })
    if (!existing) return res.status(404).json({ error: 'Extra no encontrado' })
    await prisma.financeExtra.update({ where: { id }, data: { deletedAt: new Date(), deletedById: req.user.userId } })
    await logFinanceAudit({ workspaceId, entityType: 'extra', entityId: id, action: 'delete', userId: req.user.userId, entityLabel: `extra "${existing.action}" de ${existing.item.name}` })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// POST /api/finanzas/extras/:id/team-payouts — "Pagar al equipo":
// { accountId, categoryId, date, payouts: [{ userId, amount }] }. Cada persona
// genera un EGRESO real desde `accountId` (item = el cliente del extra, así en
// Egresos se ve a qué cliente corresponde) + la fila FinanceExtraTeamPayout que
// lo vincula. Lo pagado (sumando lo anterior) no puede superar la parte del equipo.
async function payTeam(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const extra = await prisma.financeExtra.findFirst({ where: { id, workspaceId, deletedAt: null }, include: EXTRA_INCLUDE })
    if (!extra) return res.status(404).json({ error: 'Extra no encontrado' })

    const { accountId, categoryId, date, payouts } = req.body
    if (!Number.isInteger(accountId)) return res.status(400).json({ error: 'Elegí de qué cuenta sale la plata' })
    if (!Number.isInteger(categoryId)) return res.status(400).json({ error: 'Elegí una categoría de egreso' })
    const parsedDate = parseDate(date)
    if (!parsedDate) return res.status(400).json({ error: 'Fecha inválida' })
    if (!Array.isArray(payouts) || payouts.length === 0) return res.status(400).json({ error: 'Agregá al menos una persona' })

    const [account, category] = await Promise.all([
      prisma.financeAccount.findFirst({ where: { id: accountId, workspaceId, active: true } }),
      prisma.financeCategory.findFirst({ where: { id: categoryId, workspaceId } }),
    ])
    if (!account) return res.status(400).json({ error: 'Cuenta no encontrada' })
    if (!category || category.type !== 'expense') return res.status(400).json({ error: 'La categoría tiene que ser de egresos' })

    const rows = []
    for (const p of payouts) {
      if (!Number.isInteger(p?.userId)) return res.status(400).json({ error: 'Falta elegir la persona en algún pago' })
      let amount
      try { amount = toDecimal(p.amount) } catch { return res.status(400).json({ error: 'Monto inválido' }) }
      if (!amount.isFinite() || amount.lessThanOrEqualTo(0)) return res.status(400).json({ error: 'Cada pago tiene que tener un monto mayor a 0' })
      rows.push({ userId: p.userId, amount })
    }
    const userIds = [...new Set(rows.map(r => r.userId))]
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId, userId: { in: userIds }, active: true },
      include: { user: { select: { id: true, name: true } } },
    })
    if (members.length !== userIds.length) return res.status(400).json({ error: 'Alguna de las personas no es miembro activo del workspace' })
    const nameById = new Map(members.map(m => [m.userId, m.user.name]))

    const newTotal = rows.reduce((s, r) => s.plus(r.amount), toDecimal(0))
    const alreadyPaid = teamPaidAmount(extra.teamPayouts)
    const teamAmount = toDecimal(extra.teamAmount)
    if (alreadyPaid.plus(newTotal).greaterThan(teamAmount)) {
      const left = teamAmount.minus(alreadyPaid)
      return res.status(400).json({ error: `Supera lo que le corresponde al equipo — queda por pagar $ ${left.toFixed(2)}` })
    }

    const createdIds = await prisma.$transaction(async (tx) => {
      const ids = []
      for (const r of rows) {
        const movement = await tx.financeMovement.create({
          data: {
            workspaceId, type: 'expense', date: parsedDate, itemId: extra.itemId, categoryId, accountId,
            amount: r.amount.toString(), note: `Pago al equipo — ${nameById.get(r.userId)}: ${extra.action}`,
            createdById: req.user.userId,
          },
        })
        await tx.financeExtraTeamPayout.create({ data: { workspaceId, extraId: id, userId: r.userId, movementId: movement.id } })
        ids.push(movement.id)
      }
      await recomputeTeamPaid(tx, { extraId: id })
      return ids
    })

    for (const [i, movementId] of createdIds.entries()) {
      await logFinanceAudit({
        workspaceId, entityType: 'movement', entityId: movementId, action: 'create', userId: req.user.userId,
        entityLabel: `egreso de ${extra.item.name} (pago al equipo — ${nameById.get(rows[i].userId)})`,
      })
    }
    await logFinanceAudit({
      workspaceId, entityType: 'extra', entityId: id, action: 'update', userId: req.user.userId,
      summary: `Pagó al equipo ${rows.map(r => `${nameById.get(r.userId)} ($ ${r.amount.toFixed(2)})`).join(', ')} desde "${account.name}"`,
    })

    const full = await prisma.financeExtra.findUnique({ where: { id }, include: EXTRA_INCLUDE })
    res.status(201).json(shapeExtra(full))
  } catch (err) { next(err) }
}

// DELETE /api/finanzas/extras/:id/team-payouts/:payoutId — deshace un pago al
// equipo: soft-delete de su egreso (+ impuestos hijos), igual que borrarlo desde
// Egresos. Se puede restaurar desde ahí y el pago vuelve a contar.
async function deleteTeamPayout(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const payoutId = Number(req.params.payoutId)
    const payout = await prisma.financeExtraTeamPayout.findFirst({
      where: { id: payoutId, extraId: id, workspaceId },
      include: { user: { select: { name: true } }, extra: { include: { item: { select: { name: true } } } } },
    })
    if (!payout) return res.status(404).json({ error: 'Pago no encontrado' })

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.financeMovement.update({ where: { id: payout.movementId }, data: { deletedAt: now, deletedById: req.user.userId } })
      await tx.financeMovement.updateMany({ where: { sourceMovementId: payout.movementId, deletedAt: null }, data: { deletedAt: now, deletedById: req.user.userId } })
      await recomputeTeamPaid(tx, { extraId: id })
    })

    await logFinanceAudit({
      workspaceId, entityType: 'movement', entityId: payout.movementId, action: 'delete', userId: req.user.userId,
      entityLabel: `egreso de ${payout.extra.item.name} (pago al equipo — ${payout.user?.name || '—'})`,
    })
    const full = await prisma.financeExtra.findUnique({ where: { id }, include: EXTRA_INCLUDE })
    res.json(shapeExtra(full))
  } catch (err) { next(err) }
}

module.exports = { listExtras, createExtra, updateExtra, deleteExtra, payTeam, deleteTeamPayout, EXTRA_INCLUDE }
