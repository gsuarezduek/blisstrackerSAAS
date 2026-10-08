const prisma = require('../../lib/prisma')
const { logFinanceAudit } = require('../../lib/financeAudit')
const { toDecimal } = require('../../lib/financeMoney')
const { parseDate } = require('./_shared')

// GET /api/finanzas/fund-valuations?accountId=
async function listValuations(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { accountId } = req.query
    const where = { workspaceId, deletedAt: null }
    if (accountId) where.accountId = Number(accountId)
    const valuations = await prisma.financeFundValuation.findMany({ where, orderBy: { date: 'desc' } })
    res.json(valuations)
  } catch (err) { next(err) }
}

// POST /api/finanzas/fund-valuations — sección 4.8 "Actualizar valuación de
// fondo". `value` es el valor ABSOLUTO actual del fondo (no un delta).
// `periodResult` (3.1: "resultado del período") se calcula y guarda como
// snapshot: value_actual − value_anterior − aportes + rescates desde la
// última valuación (o desde siempre, si es la primera).
async function createValuation(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { accountId, date, value } = req.body

    if (!Number.isInteger(accountId)) return res.status(400).json({ error: 'Cuenta requerida' })
    const account = await prisma.financeAccount.findFirst({ where: { id: accountId, workspaceId } })
    if (!account) return res.status(400).json({ error: 'Cuenta no encontrada' })
    if (!account.hasInvestments) return res.status(400).json({ error: 'Esta cuenta no tiene inversiones habilitadas' })

    const parsedDate = parseDate(date)
    if (!parsedDate) return res.status(400).json({ error: 'Fecha inválida' })

    let valueDecimal
    try { valueDecimal = toDecimal(value) } catch { return res.status(400).json({ error: 'Valor inválido' }) }
    if (!valueDecimal.isFinite() || valueDecimal.lessThan(0)) return res.status(400).json({ error: 'Valor inválido' })

    const lastValuation = await prisma.financeFundValuation.findFirst({
      where: { workspaceId, accountId, deletedAt: null }, orderBy: { date: 'desc' },
    })
    const since = lastValuation?.date || new Date(0)

    const [aportesAgg, rescatesAgg] = await Promise.all([
      prisma.financeTransfer.aggregate({
        where: { workspaceId, toAccountId: accountId, toIsFund: true, deletedAt: null, date: { gt: since, lte: parsedDate } },
        _sum: { toAmount: true },
      }),
      prisma.financeTransfer.aggregate({
        where: { workspaceId, fromAccountId: accountId, fromIsFund: true, deletedAt: null, date: { gt: since, lte: parsedDate } },
        _sum: { fromAmount: true },
      }),
    ])
    const previousValue = lastValuation ? toDecimal(lastValuation.value) : toDecimal(0)
    const aportes = toDecimal(aportesAgg._sum.toAmount || 0)
    const rescates = toDecimal(rescatesAgg._sum.fromAmount || 0)
    const periodResult = valueDecimal.minus(previousValue).minus(aportes).plus(rescates)

    const valuation = await prisma.financeFundValuation.create({
      data: {
        workspaceId, accountId, date: parsedDate, value: valueDecimal.toString(), periodResult: periodResult.toString(),
        createdById: req.user.userId,
      },
    })

    await logFinanceAudit({
      workspaceId, entityType: 'fundValuation', entityId: valuation.id, action: 'create', userId: req.user.userId,
      entityLabel: `valuación de "${account.name}"`,
    })

    res.status(201).json(valuation)
  } catch (err) { next(err) }
}

module.exports = { listValuations, createValuation }
