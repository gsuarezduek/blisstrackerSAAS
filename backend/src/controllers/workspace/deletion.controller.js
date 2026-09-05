const prisma = require('../../lib/prisma')
const { sendWorkspaceDeletionWarning, sendPlatformNotification, platformCard } = require('../../services/email.service')
const { removeDemoProject } = require('../../services/workspaceSeed.service')
const { DEFAULT_TZ } = require('../../utils/dates')

/**
 * GET /api/workspaces/current/deletion-request
 * Devuelve la solicitud de eliminación activa (si existe).
 */
async function getDeletionRequest(req, res, next) {
  try {
    const req_ = await prisma.workspaceDeletionRequest.findUnique({
      where: { workspaceId: req.workspace.id },
      include: {
        requestedBy: { select: { name: true } },
        cancelledBy: { select: { name: true } },
      },
    })
    res.json(req_ ?? null)
  } catch (err) { next(err) }
}

/**
 * POST /api/workspaces/current/deletion-request
 * Programa la eliminación del workspace en 48 horas.
 * Solo owners.
 */
async function scheduleDeletion(req, res, next) {
  try {
    const workspace   = req.workspace
    const requesterId = req.user.userId

    // Solo el owner puede solicitar la eliminación
    const member = req.workspaceMember
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Solo el owner puede eliminar el workspace' })
    }

    // Si ya hay una solicitud activa (no cancelada), rechazar
    const existing = await prisma.workspaceDeletionRequest.findUnique({
      where: { workspaceId: workspace.id },
    })
    if (existing && !existing.cancelledAt) {
      return res.status(409).json({ error: 'Ya hay una solicitud de eliminación activa' })
    }

    const scheduledAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

    // Upsert: si había una cancelada, la reemplazamos
    await prisma.workspaceDeletionRequest.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, requestedById: requesterId, scheduledAt },
      update: { requestedById: requesterId, scheduledAt, cancelledAt: null, cancelledById: null },
    })
    const deletionReq = await prisma.workspaceDeletionRequest.findUnique({
      where: { workspaceId: workspace.id },
      include: {
        requestedBy: { select: { name: true } },
        cancelledBy: { select: { name: true } },
      },
    })

    // Obtener todos los admins/owners activos del workspace
    const admins = await prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id, active: true, role: { in: ['owner', 'admin'] } },
      include: { user: { select: { name: true, email: true } } },
    })

    const requester = admins.find(a => a.userId === requesterId)
    const requesterName = requester?.user.name ?? 'Un administrador'
    const domain = process.env.APP_DOMAIN || 'blisstracker.app'
    const cancelUrl = `https://${workspace.slug}.${domain}/preferences`

    sendWorkspaceDeletionWarning(
      admins.map(a => a.user.email),
      workspace.name,
      requesterName,
      cancelUrl,
      scheduledAt,
      workspace.id,
    ).catch(err => console.error('[sendWorkspaceDeletionWarning]', err.message))

    // Aviso interno al equipo BlissTracker: posible churn / pérdida de datos.
    sendPlatformNotification('deletionRequest', {
      workspaceId: workspace.id,
      subject: `⚠️ Solicitud de borrado: ${workspace.name}`,
      bodyHtml: platformCard('⚠️ Solicitud de eliminación de workspace', [
        ['Workspace',  workspace.name],
        ['Slug',       `${workspace.slug}.${domain}`],
        ['Solicitó',   requesterName],
        ['Se elimina', new Date(scheduledAt).toLocaleString('es-AR', { timeZone: DEFAULT_TZ, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })],
      ], '#dc2626'),
    })

    res.status(201).json(deletionReq)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/workspaces/current/deletion-request
 * Cancela la solicitud de eliminación. Cualquier admin puede cancelar.
 */
async function cancelDeletion(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const cancelById  = req.user.userId

    const existing = await prisma.workspaceDeletionRequest.findUnique({
      where: { workspaceId },
    })
    if (!existing || existing.cancelledAt) {
      return res.status(404).json({ error: 'No hay solicitud de eliminación activa' })
    }
    if (existing.scheduledAt < new Date()) {
      return res.status(410).json({ error: 'El plazo ya venció, no se puede cancelar' })
    }

    const updated = await prisma.workspaceDeletionRequest.update({
      where: { workspaceId },
      data: { cancelledAt: new Date(), cancelledById: cancelById },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

/**
 * Ejecuta la eliminación de un workspace y todos sus datos.
 * Llamado desde el cron job.
 */
async function executeWorkspaceDeletion(workspaceId) {
  console.log(`[deletion] Eliminando workspace ${workspaceId}...`)

  // Obtener IDs de proyectos y workdays para borrar tasks
  const [projectIds, workdayIds] = await Promise.all([
    prisma.project.findMany({ where: { workspaceId }, select: { id: true } }).then(r => r.map(p => p.id)),
    prisma.workDay.findMany({ where: { workspaceId }, select: { id: true } }).then(r => r.map(w => w.id)),
  ])

  const taskIds = await prisma.task.findMany({
    where: { OR: [{ workDayId: { in: workdayIds } }, { projectId: { in: projectIds } }] },
    select: { id: true },
  }).then(r => r.map(t => t.id))

  await prisma.$transaction([
    // Nivel más profundo: sessions y comments de tasks
    prisma.taskSession.deleteMany({ where: { taskId: { in: taskIds } } }),
    prisma.taskComment.deleteMany({ where: { taskId: { in: taskIds } } }),
    // Notificaciones y feedbacks
    prisma.notification.deleteMany({ where: { workspaceId } }),
    prisma.feedback.deleteMany({ where: { workspaceId } }),
    // Licencias y pizarra de notas (FK RESTRICT hacia Workspace sin esto)
    prisma.vacationRequest.deleteMany({ where: { workspaceId } }),
    prisma.vacationAdjustment.deleteMany({ where: { workspaceId } }),
    prisma.notesBoardNote.deleteMany({ where: { workspaceId } }),
    // AI logs
    prisma.aiTokenLog.deleteMany({ where: { workspaceId } }),
    prisma.apifyUsageLog.deleteMany({ where: { workspaceId } }),
    prisma.dailyInsight.deleteMany({ where: { workspaceId } }),
    prisma.userInsightMemory.deleteMany({ where: { workspaceId } }),
    // Login history
    prisma.userLogin.deleteMany({ where: { workspaceId } }),
    // Invitaciones
    prisma.workspaceInvitation.deleteMany({ where: { workspaceId } }),
  ])

  // Tasks (después de sus dependencias)
  await prisma.task.deleteMany({ where: { id: { in: taskIds } } })

  await prisma.$transaction([
    // Workdays y proyecto-level
    prisma.workDay.deleteMany({ where: { workspaceId } }),
    prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } }),
    prisma.projectService.deleteMany({ where: { projectId: { in: projectIds } } }),
    prisma.projectLink.deleteMany({ where: { projectId: { in: projectIds } } }),
    prisma.project.deleteMany({ where: { workspaceId } }),
    // Roles y servicios
    prisma.roleExpectation.deleteMany({ where: { workspaceId } }),
    prisma.userRole.deleteMany({ where: { workspaceId } }),
    prisma.service.deleteMany({ where: { workspaceId } }),
    // Miembros y suscripción
    prisma.workspaceMember.deleteMany({ where: { workspaceId } }),
    prisma.subscription.deleteMany({ where: { workspaceId } }),
    // Solicitud de eliminación (ON DELETE CASCADE, pero por las dudas)
    prisma.workspaceDeletionRequest.deleteMany({ where: { workspaceId } }),
  ])

  // Finalmente el workspace
  await prisma.workspace.delete({ where: { id: workspaceId } })

  console.log(`[deletion] Workspace ${workspaceId} eliminado.`)
}

/**
 * DELETE /api/workspaces/current/demo-project
 * Elimina el proyecto "Demo — Aprendé BlissTracker" + sus tareas.
 * Solo admin/owner. No regenera (Workspace.demoSeeded queda en true).
 */
async function deleteDemoProject(req, res, next) {
  try {
    if (!['admin', 'owner'].includes(req.workspaceMember?.role)) {
      return res.status(403).json({ error: 'Solo admin u owner pueden eliminar el proyecto demo' })
    }
    const result = await removeDemoProject(req.workspace.id)
    res.json(result)
  } catch (err) { next(err) }
}

module.exports = {
  getDeletionRequest, scheduleDeletion, cancelDeletion, executeWorkspaceDeletion,
  deleteDemoProject,
}
