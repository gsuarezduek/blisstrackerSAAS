const prisma = require('../lib/prisma')
const { sendVacationRequestEmail, sendVacationReviewEmail } = require('../services/email.service')
const { DEFAULT_TZ } = require('../utils/dates')

// Cuenta días hábiles (lun-vie, sin feriados) entre dos fechas "YYYY-MM-DD" inclusive.
function countBusinessDays(startDate, endDate) {
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const start = new Date(sy, sm - 1, sd)
  const end   = new Date(ey, em - 1, ed)
  let count = 0
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

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
 * Query: ?status=pending|approved|rejected&userId=
 */
async function listRequests(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { status, userId } = req.query
    const where = { workspaceId }
    if (status) where.status = status
    if (userId) where.userId = Number(userId)

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

    let updated
    try {
      updated = await prisma.$transaction(async (tx) => {
        // updateMany con status:'pending' en el where: si otra revisión concurrente
        // ya la resolvió entre el findFirst de arriba y acá, count===0 y abortamos
        // con conflicto explícito en vez de pisarla silenciosamente.
        const result = await tx.vacationRequest.updateMany({
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

        // Descuento de saldo al aprobar una licencia de tipo "vacaciones" (días hábiles).
        if (status === 'approved' && request.type === 'vacaciones') {
          const member = await tx.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: request.userId } },
            select: { vacationDays: true },
          })
          if (member) {
            const days = countBusinessDays(request.startDate, request.endDate)
            const newDays = member.vacationDays - days
            await tx.workspaceMember.update({
              where: { workspaceId_userId: { workspaceId, userId: request.userId } },
              data:  { vacationDays: newDays },
            })
            await tx.vacationAdjustment.create({
              data: {
                workspaceId, userId: request.userId, adminId,
                prevDays: member.vacationDays, newDays,
                description: `Descuento automático por licencia aprobada (${request.startDate}${request.startDate !== request.endDate ? ' → ' + request.endDate : ''})`,
              },
            })
          }
        }

        return tx.vacationRequest.findUnique({
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
    }).catch(err => console.error('[Vacation] Error al crear notificación de revisión:', err.message))

    // Email al usuario
    sendVacationReviewEmail(
      request.user.email,
      request.user.name,
      workspace.name,
      { ...request, status, reviewNote: reviewNote?.trim() || null },
      workspaceId,
    ).catch(err => console.error('[Vacation] Error al enviar email de revisión:', err.message))

    res.json(updated)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/vacation/admin/requests/:id/edit
 * Body: { startDate?, endDate?, type?, status?, reviewNote? }
 * Edita una solicitud ya existente (incluso ya revisada): permite corregir
 * fechas/tipo y cambiar el estado entre approved/rejected/pending.
 * → notificación VACATION_REVIEWED al usuario informando el cambio.
 */
async function editRequest(req, res, next) {
  try {
    const id          = Number(req.params.id)
    const workspaceId = req.workspace.id
    const adminId     = req.user.userId
    const { startDate, endDate, type, status, reviewNote } = req.body

    const VALID_TYPES = ['vacaciones','estudio','maternidad','paternidad','enfermedad','duelo','mudanza','otro']

    const request = await prisma.vacationRequest.findFirst({
      where: { id, workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (!request) return res.status(404).json({ error: 'Solicitud no encontrada' })

    const data = {}

    // Fechas — se validan contra el valor final (nuevo o el ya guardado)
    const finalStart = startDate !== undefined ? startDate : request.startDate
    const finalEnd   = endDate   !== undefined ? endDate   : request.endDate
    if (startDate !== undefined || endDate !== undefined) {
      if (!finalStart || !finalEnd) {
        return res.status(400).json({ error: 'Las fechas de inicio y fin son requeridas' })
      }
      if (finalStart > finalEnd) {
        return res.status(400).json({ error: 'La fecha de inicio debe ser anterior a la de fin' })
      }
      data.startDate = finalStart
      data.endDate   = finalEnd
    }

    if (type !== undefined) {
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Tipo de licencia inválido' })
      }
      data.type = type
    }

    if (status !== undefined) {
      if (!['approved', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({ error: 'status debe ser "approved", "rejected" o "pending"' })
      }
      data.status = status
      if (status === 'pending') {
        data.reviewedById = null
        data.reviewedAt   = null
      } else {
        data.reviewedById = adminId
        data.reviewedAt   = new Date()
      }
    }

    if (reviewNote !== undefined) {
      data.reviewNote = reviewNote?.trim() || null
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No hay cambios para aplicar' })
    }

    const updated = await prisma.vacationRequest.update({
      where: { id },
      data,
      include: {
        user:       { select: { id: true, name: true, avatar: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    })

    // Notificación in-app al usuario avisando que su solicitud fue modificada
    const finalStatus = data.status ?? request.status
    const dateRange = `${updated.startDate}${updated.startDate !== updated.endDate ? ' → ' + updated.endDate : ''}`
    const statusWord = finalStatus === 'approved' ? 'aprobada' : finalStatus === 'rejected' ? 'rechazada' : 'marcada como pendiente'
    prisma.notification.create({
      data: {
        workspaceId,
        userId:  request.user.id,
        actorId: adminId,
        type:    'VACATION_REVIEWED',
        message: `Tu solicitud de licencia fue modificada (${dateRange}) y quedó ${statusWord}.${updated.reviewNote ? ' Nota: ' + updated.reviewNote : ''}`,
      },
    }).catch(err => console.error('[Vacation] Error al crear notificación de edición:', err.message))

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

    // Mínimo 48hs de anticipación — calculado en la timezone del workspace (no la del
    // servidor), igual que el resto de las fechas de la app (ver todayString en utils/dates).
    const tz = req.workspace.timezone || DEFAULT_TZ
    const minDate = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const minDateStr = minDate.toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
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
      }).catch(err => console.error('[Vacation] Error al crear notificaciones de solicitud:', err.message))

      // Email a los admins
      const adminEmails = adminMembers.map(m => m.user.email)
      sendVacationRequestEmail(
        adminEmails,
        requester.name,
        workspace.name,
        { startDate, endDate, type, observation: observation?.trim() || null },
        workspaceId,
      ).catch(err => console.error('[Vacation] Error al enviar email de solicitud:', err.message))
    }

    res.status(201).json(request)
  } catch (err) { next(err) }
}

module.exports = { adjustVacationDays, getAdjustmentHistory, listRequests, reviewRequest, editRequest, getMyVacation, createRequest }
