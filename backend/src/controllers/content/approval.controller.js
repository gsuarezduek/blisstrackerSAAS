const jwt = require('jsonwebtoken')
const prisma = require('../../lib/prisma')
const { sendContentApprovalRequestEmail } = require('../../services/email.service')
const { resolveCtx } = require('./_shared')

// Ventana del link de acceso directo que va en el email de "Pedir aprobación":
// el contacto entra al portal sin código durante 72h desde el envío; pasado
// ese tiempo (o desde cualquier otra vía de entrada), sigue rigiendo el login
// OTP de siempre — ver clientPortal.controller.js#magicLogin.
const APPROVAL_MAGIC_LINK_TTL = '72h'

/**
 * POST /api/contenido/projects/:id/request-approval
 * Body: { pieceIds? } — sin pieceIds, avisa sobre TODAS las piezas en
 * 'aprobacion'. No cambia el estado de ninguna pieza (eso ya pasó al moverla
 * a esa columna): es puramente el disparador del email a los contactos del
 * portal que pueden aprobar (active && canApprove). Fire-and-forget — un
 * email caído no debe romper la respuesta (mismo criterio que submitReportFeedback).
 */
async function requestApproval(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const where = { projectId, workspaceId, status: 'aprobacion', deletedAt: null }
    const rawIds = Array.isArray(req.body?.pieceIds)
      ? req.body.pieceIds.map(Number).filter(n => Number.isInteger(n) && n > 0)
      : null
    if (rawIds && rawIds.length) where.id = { in: rawIds }

    const pieces = await prisma.contentPiece.findMany({
      where, select: { id: true, title: true }, orderBy: { updatedAt: 'desc' },
    })
    if (pieces.length === 0) {
      return res.status(400).json({ error: 'No hay piezas esperando aprobación para avisar' })
    }

    const portal = await prisma.projectClientPortal.findUnique({ where: { projectId } })
    if (!portal || !portal.active || !portal.contentEnabled) {
      return res.status(400).json({ error: 'Activá el portal y el módulo de Contenido antes de pedir aprobación' })
    }

    const contacts = await prisma.clientPortalContact.findMany({
      where:  { portalId: portal.id, active: true, canApprove: true },
      select: { id: true, email: true, name: true },
    })
    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No hay contactos activos que puedan aprobar — agregá uno en la configuración del portal' })
    }

    const [project, workspace] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { slug: true, name: true, companyName: true } }),
    ])

    const domain = process.env.APP_DOMAIN || 'blisstracker.app'
    const base   = `https://${workspace.slug}.${domain}/report/${portal.slug}`

    setImmediate(() => {
      Promise.allSettled(contacts.map(contact => {
        const magicToken = jwt.sign(
          { purpose: 'client-portal-magic', portalId: portal.id, contactId: contact.id },
          process.env.JWT_SECRET,
          { expiresIn: APPROVAL_MAGIC_LINK_TTL },
        )
        const portalUrl = `${base}?tab=contenido&mt=${encodeURIComponent(magicToken)}`
        return sendContentApprovalRequestEmail(contact.email, {
          projectName:   project?.name || 'Proyecto',
          portalUrl,
          pieces,
          workspaceName: workspace?.companyName || workspace?.name,
        }, workspaceId)
      }))
    })

    res.json({
      sent: contacts.length,
      pieces: pieces.length,
      contacts: contacts.map(c => ({ name: c.name, email: c.email })),
    })
  } catch (err) { next(err) }
}

module.exports = {
  requestApproval,
}
