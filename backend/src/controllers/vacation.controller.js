const prisma = require('../lib/prisma')
const { sendVacationRequestEmail, sendVacationReviewEmail } = require('../services/email.service')

// ─── ADMIN ────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/vacation/admin/adjust/:userId
 * Body: { newDays, description }
 */
async function adjustVacationDays(req, res, next) {
  try {
    const userId      = Number(req.params.userId)
    const workspaceId = req.workspace.id
    const adminId     = req.user.userId
    const { newDays, description } = req.body

    if (typeof newDays !== 'number' || newDays < 0) {
      return res.status(400).json({ error: 'newDays debe ser un número >= 0' })
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'La descripción es requerida' })
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    })
    if (!member) return res.status(404).json({ error: 'Usuario no encontrado en este workspace' })

    const [updated] = await prisma.$transaction([
      prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId } },
        data: { vacationDays: newDays },
        select: { userId: true, vacationDays: true },
      }),
      prisma.vacationAdjustment.create({
        data: { workspaceId, userId, adminId, prevDays: member.vacationDays, newDays, description: description.trim() },
      }),
    ])

    res.json({ id: updated.userId, vacationDays: updated.vacationDays })
  } catch (err) { next(err) }
}

/**
 * GET /api/vacation/admin/adjustments/:userId
 */
async function getAdjustmentHistory(req, res, next) {
  try {
    const userId      = Number(req.params.userId)
    const workspaceId = req.workspace.id

    const adjustments = await prisma.vacationAdjustment.findMany({
      where: { workspaceId, userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { admin: { select: { id: true, name: true, avatar: true } } },
    })
    res.json(adjustments)
  } catch (err) { next(err) }
}

/**
 * GET /api/vacation/admin/requests
 * Query: ?status=pending|approved|rejected
 */
async function listRequests(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { status }  = req.query
    const where = { workspaceId }
    if (status) where.status = status

    const requests = await prisma.vacationRequest.findMany({
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
 * PATCH /api/vacation/admin/requests/:id
 * Body: { status: 'approved'|'rejected', reviewNote? }
 * → email al usuario + notificación VACATION_REVIEWED
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

    const request = await prisma.vacationRequest.findFirst({
      where: { id, workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' })
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'La solicitud ya fue revisada' })
    }

    const workspace = req.workspace

    const updated = await prisma.vacationRequest.update({
      where: { id },
      data: {
        status,
        reviewedById: adminId,
        reviewedAt:   new Date(),
        reviewNote:   reviewNote?.trim() || null,
      },
      include: {
        user:       { select: { id: true, name: true, avatar: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    })

    // Notificación in-app al usuario
    prisma.notification.create({
      data: {
        workspaceId,
        userId:  request.user.id,
        actorId: adminId,
        type:    'VACATION_REVIEWED',
        message: status === 'approved'
          ? `Tu solicitud de licencia (${request.startDate}${request.startDate !== request.endDate ? ' → ' + request.endDate : ''}) fue aprobada.`
          : `Tu solicitud de licencia (${request.startDate}${request.startDate !== request.endDate ? ' → ' + request.endDate : ''}) fue rechazada.${reviewNote ? ' Nota: ' + reviewNote.trim() : ''}`,
      },
    }).catch(() => {})

    // Email al usuario
    sendVacationReviewEmail(
      request.user.email,
      request.user.name,
      workspace.name,
      { ...request, status, reviewNote: reviewNote?.trim() || null },
      workspaceId,
    ).catch(() => {})

    res.json(updated)
  } catch (err) { next(err) }
}

// ─── USER ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/vacation/my
 */
async function getMyVacation(req, res, next) {
  try {
    const userId      = req.user.userId
    const workspaceId = req.workspace.id

    const [member, adjustments, requests] = await Promise.all([
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { vacationDays: true },
      }),
      prisma.vacationAdjustment.findMany({
        where: { workspaceId, userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { admin: { select: { id: true, name: true } } },
      }),
      prisma.vacationRequest.findMany({
        where: { workspaceId, userId },
        orderBy: { createdAt: 'desc' },
        include: { reviewedBy: { select: { id: true, name: true } } },
      }),
    ])

    res.json({
      vacationDays: member?.vacationDays ?? 0,
      adjustments,
      requests,
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/vacation/my/request
 * Body: { startDate, endDate, type, observation? }
 * → email a los admins + notificaciones VACATION_REQUEST a cada admin
 */
async function createRequest(req, res, next) {
  try {
    const userId      = req.user.userId
    const workspaceId = req.workspace.id
    const { startDate, endDate, type, observation } = req.body

    const VALID_TYPES = ['vacaciones','estudio','maternidad','paternidad','enfermedad','duelo','mudanza','otro']

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Las fechas de inicio y fin son requeridas' })
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo de licencia inválido' })
    }
    if (startDate > endDate) {
      return res.status(400).json({ error: 'La fecha de inicio debe ser anterior a la de fin' })
    }

    // Mínimo 48hs de anticipación
    const minDate = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const minDateStr = minDate.toLocaleDateString('en-CA') // YYYY-MM-DD
    if (startDate < minDateStr) {
      return res.status(400).json({ error: 'La fecha de inicio debe ser con al menos 48 horas de anticipación' })
    }

    const request = await prisma.vacationRequest.create({
      data: { workspaceId, userId, startDate, endDate, type, observation: observation?.trim() || null },
    })

    // Obtener usuario solicitante y admins del workspace en paralelo
    const [requester, adminMembers] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
      prisma.workspaceMember.findMany({
        where: { workspaceId, role: { in: ['admin', 'owner'] }, active: true, userId: { not: userId } },
        include: { user: { select: { id: true, email: true } } },
      }),
    ])

    const workspace = req.workspace

    // Notificaciones in-app a cada admin
    if (adminMembers.length > 0) {
      prisma.notification.createMany({
        data: adminMembers.map(m => ({
          workspaceId,
          userId:  m.user.id,
          actorId: userId,
          type:    'VACATION_REQUEST',
          message: `${requester.name} solicitó días de licencia (${type}) del ${startDate}${startDate !== endDate ? ' al ' + endDate : ''}.`,
        })),
      }).catch(() => {})

      // Email a los admins
      const adminEmails = adminMembers.map(m => m.user.email)
      sendVacationRequestEmail(
        adminEmails,
        requester.name,
        workspace.name,
        { startDate, endDate, type, observation: observation?.trim() || null },
        workspaceId,
      ).catch(() => {})
    }

    res.status(201).json(request)
  } catch (err) { next(err) }
}

module.exports = { adjustVacationDays, getAdjustmentHistory, listRequests, reviewRequest, getMyVacation, createRequest }
