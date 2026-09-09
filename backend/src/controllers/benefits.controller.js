const prisma = require('../lib/prisma')
const { sendBenefitRequestEmail, sendBenefitReviewEmail } = require('../services/email.service')
const { BANKS, isValidBank, balanceFieldFor, labelFor } = require('../lib/benefitBanks')

// ─── ADMIN ────────────────────────────────────────────────────────────────────

/**
 * GET /api/benefits/admin/balances
 * Query: ?bank=horas_libres|dias_home
 * Lista los miembros activos del workspace con su saldo de ese banco, desc.
 */
async function listBalances(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { bank } = req.query
    if (!isValidBank(bank)) return res.status(400).json({ error: 'bank inválido' })
    const field = balanceFieldFor(bank)

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId, active: true },
      select: { userId: true, [field]: true, user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { [field]: 'desc' },
    })
    res.json(members.map(m => ({ userId: m.userId, user: m.user, balance: m[field] })))
  } catch (err) { next(err) }
}

/**
 * PATCH /api/benefits/admin/balances/:userId
 * Body: { bank, newBalance, description }
 */
async function adjustBalance(req, res, next) {
  try {
    const userId      = Number(req.params.userId)
    const workspaceId = req.workspace.id
    const adminId     = req.user.userId
    const { bank, newBalance, description } = req.body

    if (!isValidBank(bank)) return res.status(400).json({ error: 'bank inválido' })
    if (typeof newBalance !== 'number' || newBalance < 0) {
      return res.status(400).json({ error: 'newBalance debe ser un número >= 0' })
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'La descripción es requerida' })
    }
    const field = balanceFieldFor(bank)

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    })
    if (!member) return res.status(404).json({ error: 'Usuario no encontrado en este workspace' })

    const [updated] = await prisma.$transaction([
      prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId } },
        data: { [field]: newBalance },
        select: { userId: true, [field]: true },
      }),
      prisma.benefitBankAdjustment.create({
        data: {
          workspaceId, userId, bank, adminId,
          prevBalance: member[field], newBalance,
          description: description.trim(),
        },
      }),
    ])

    res.json({ userId: updated.userId, bank, balance: updated[field] })
  } catch (err) { next(err) }
}

/**
 * GET /api/benefits/admin/adjustments/:userId
 * Query: ?bank=
 */
async function getAdjustmentHistory(req, res, next) {
  try {
    const userId      = Number(req.params.userId)
    const workspaceId = req.workspace.id
    const { bank } = req.query
    const where = { workspaceId, userId }
    if (bank) {
      if (!isValidBank(bank)) return res.status(400).json({ error: 'bank inválido' })
      where.bank = bank
    }

    const adjustments = await prisma.benefitBankAdjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { admin: { select: { id: true, name: true, avatar: true } } },
    })
    res.json(adjustments)
  } catch (err) { next(err) }
}

/**
 * GET /api/benefits/admin/requests
 * Query: ?bank=&status=pending|approved|rejected
 */
async function listRequests(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { bank, status } = req.query
    const where = { workspaceId }
    if (bank) {
      if (!isValidBank(bank)) return res.status(400).json({ error: 'bank inválido' })
      where.bank = bank
    }
    if (status) where.status = status

    const requests = await prisma.benefitBankRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user:       { select: { id: true, name: true, avatar: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    })
    res.json(requests)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/benefits/admin/requests/:id
 * Body: { status: 'approved'|'rejected', reviewNote? }
 * Al aprobar: descuenta `amount` del saldo del banco correspondiente (sin bloquear
 * si queda negativo — misma discreción del admin que ya aplica en VacationRequest).
 */
async function reviewRequest(req, res, next) {
  try {
    const id          = Number(req.params.id)
    const workspaceId = req.workspace.id
    const adminId     = req.user.userId
    const { status, reviewNote } = req.body

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status debe ser "approved" o "rejected"' })
    }

    const request = await prisma.benefitBankRequest.findFirst({
      where: { id, workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' })
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'La solicitud ya fue revisada' })
    }

    const field = balanceFieldFor(request.bank)

    let updated
    try {
      updated = await prisma.$transaction(async (tx) => {
        const result = await tx.benefitBankRequest.updateMany({
          where: { id, workspaceId, status: 'pending' },
          data: {
            status,
            reviewedById: adminId,
            reviewedAt:   new Date(),
            reviewNote:   reviewNote?.trim() || null,
          },
        })
        if (result.count === 0) {
          throw Object.assign(new Error('La solicitud ya fue revisada'), { conflict: true })
        }

        if (status === 'approved') {
          const member = await tx.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: request.userId } },
            select: { [field]: true },
          })
          if (member) {
            const prevBalance = member[field]
            const newBalance  = prevBalance - request.amount
            await tx.workspaceMember.update({
              where: { workspaceId_userId: { workspaceId, userId: request.userId } },
              data:  { [field]: newBalance },
            })
            await tx.benefitBankAdjustment.create({
              data: {
                workspaceId, userId: request.userId, bank: request.bank, adminId,
                prevBalance, newBalance,
                description: `Consumo aprobado (solicitud #${id})`,
              },
            })
          }
        }

        return tx.benefitBankRequest.findUnique({
          where: { id },
          include: {
            user:       { select: { id: true, name: true, avatar: true } },
            reviewedBy: { select: { id: true, name: true } },
          },
        })
      })
    } catch (e) {
      if (e.conflict) return res.status(409).json({ error: e.message })
      throw e
    }

    const bankLabel = labelFor(request.bank)
    prisma.notification.create({
      data: {
        workspaceId,
        userId:  request.user.id,
        actorId: adminId,
        type:    'BENEFIT_REVIEWED',
        message: status === 'approved'
          ? `Tu solicitud de ${bankLabel} (${request.amount}${request.date ? ', ' + request.date : ''}) fue aprobada.`
          : `Tu solicitud de ${bankLabel} (${request.amount}${request.date ? ', ' + request.date : ''}) fue rechazada.${reviewNote ? ' Nota: ' + reviewNote.trim() : ''}`,
      },
    }).catch(err => console.error('[Benefits] Error al crear notificación de revisión:', err.message))

    sendBenefitReviewEmail(
      request.user.email,
      request.user.name,
      req.workspace.name,
      { ...request, status, reviewNote: reviewNote?.trim() || null },
      workspaceId,
    ).catch(err => console.error('[Benefits] Error al enviar email de revisión:', err.message))

    res.json(updated)
  } catch (err) { next(err) }
}

// ─── USER ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/benefits/my
 */
async function getMyBenefits(req, res, next) {
  try {
    const userId      = req.user.userId
    const workspaceId = req.workspace.id

    const [member, adjustments, requests] = await Promise.all([
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { freeHoursBalance: true, homeDaysBalance: true },
      }),
      prisma.benefitBankAdjustment.findMany({
        where: { workspaceId, userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { admin: { select: { id: true, name: true } } },
      }),
      prisma.benefitBankRequest.findMany({
        where: { workspaceId, userId },
        orderBy: { createdAt: 'desc' },
        include: { reviewedBy: { select: { id: true, name: true } } },
      }),
    ])

    res.json({
      balances: {
        horas_libres: member?.freeHoursBalance ?? 0,
        dias_home:    member?.homeDaysBalance ?? 0,
      },
      adjustments,
      requests,
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/benefits/my/request
 * Body: { bank, amount, date, reason? }
 * → email a los admins + notificaciones BENEFIT_REQUEST
 */
async function createRequest(req, res, next) {
  try {
    const userId      = req.user.userId
    const workspaceId = req.workspace.id
    const { bank, amount, date, reason } = req.body

    if (!isValidBank(bank)) return res.status(400).json({ error: 'bank inválido' })
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'amount debe ser un número > 0' })
    }
    if (!date) {
      return res.status(400).json({ error: 'La fecha es requerida' })
    }

    const request = await prisma.benefitBankRequest.create({
      data: { workspaceId, userId, bank, amount, date, reason: reason?.trim() || null },
    })

    const [requester, adminMembers] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
      prisma.workspaceMember.findMany({
        where: { workspaceId, role: { in: ['admin', 'owner'] }, active: true, userId: { not: userId } },
        include: { user: { select: { id: true, email: true } } },
      }),
    ])

    const bankLabel = labelFor(bank)

    if (adminMembers.length > 0) {
      prisma.notification.createMany({
        data: adminMembers.map(m => ({
          workspaceId,
          userId:  m.user.id,
          actorId: userId,
          type:    'BENEFIT_REQUEST',
          message: `${requester.name} pidió usar ${amount} de ${bankLabel} el ${date}.`,
        })),
      }).catch(err => console.error('[Benefits] Error al crear notificaciones de solicitud:', err.message))

      const adminEmails = adminMembers.map(m => m.user.email)
      sendBenefitRequestEmail(
        adminEmails,
        requester.name,
        req.workspace.name,
        { bank, amount, date, reason: reason?.trim() || null },
        workspaceId,
      ).catch(err => console.error('[Benefits] Error al enviar email de solicitud:', err.message))
    }

    res.status(201).json(request)
  } catch (err) { next(err) }
}

module.exports = {
  BANKS,
  listBalances, adjustBalance, getAdjustmentHistory, listRequests, reviewRequest,
  getMyBenefits, createRequest,
}
