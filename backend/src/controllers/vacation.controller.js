const prisma = require('../lib/prisma')

// ─── ADMIN ────────────────────────────────────────────────────────────────────

/**
 * PATCH /api/vacation/admin/adjust/:userId
 * Body: { newDays, description }
 * Establece la cantidad exacta de días y guarda el ajuste en el historial.
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
        data: {
          workspaceId,
          userId,
          adminId,
          prevDays:    member.vacationDays,
          newDays,
          description: description.trim(),
        },
      }),
    ])

    res.json({ id: updated.userId, vacationDays: updated.vacationDays })
  } catch (err) { next(err) }
}

/**
 * GET /api/vacation/admin/adjustments/:userId
 * Historial de ajustes para un usuario en el workspace.
 */
async function getAdjustmentHistory(req, res, next) {
  try {
    const userId      = Number(req.params.userId)
    const workspaceId = req.workspace.id

    const adjustments = await prisma.vacationAdjustment.findMany({
      where: { workspaceId, userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        admin: { select: { id: true, name: true, avatar: true } },
      },
    })

    res.json(adjustments)
  } catch (err) { next(err) }
}

/**
 * GET /api/vacation/admin/requests
 * Lista solicitudes del workspace (todas o filtradas por status).
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
 * Aprobar o rechazar una solicitud.
 * Body: { status: 'approved'|'rejected', reviewNote? }
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
    })
    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' })
    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'La solicitud ya fue revisada' })
    }

    const updated = await prisma.vacationRequest.update({
      where: { id },
      data: {
        status,
        reviewedById: adminId,
        reviewedAt:   new Date(),
        reviewNote:   reviewNote?.trim() || null,
      },
    })

    res.json(updated)
  } catch (err) { next(err) }
}

// ─── USER ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/vacation/my
 * Días disponibles + historial de ajustes + solicitudes del usuario.
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
        include: {
          admin: { select: { id: true, name: true } },
        },
      }),
      prisma.vacationRequest.findMany({
        where: { workspaceId, userId },
        orderBy: { createdAt: 'desc' },
        include: {
          reviewedBy: { select: { id: true, name: true } },
        },
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
 * Crear una solicitud de licencia.
 * Body: { startDate, endDate, type, observation? }
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

    const request = await prisma.vacationRequest.create({
      data: {
        workspaceId,
        userId,
        startDate,
        endDate,
        type,
        observation: observation?.trim() || null,
      },
    })

    res.status(201).json(request)
  } catch (err) { next(err) }
}

module.exports = { adjustVacationDays, getAdjustmentHistory, listRequests, reviewRequest, getMyVacation, createRequest }
