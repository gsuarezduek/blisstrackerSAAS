const prisma = require('../lib/prisma')
const { emitTo } = require('../lib/socket')
const { isFlagEnabledForWorkspace } = require('../lib/featureFlags')
const { getProjectNotifyRecipients } = require('../lib/projectRecipients')
const {
  PORTAL_VISIBLE_STATUSES,
  CLIENT_APPROVE_FROM,
  CLIENT_APPROVE_TO,
  CLIENT_CHANGES_TO,
  statusMeta,
} = require('../lib/contentCatalog')
const { formatAsset, formatPiece, loadPiece } = require('./content.controller')

const MAX_COMMENT = 2000

function safeParseArr(str) {
  try { const v = JSON.parse(str); return Array.isArray(v) ? v : [] } catch { return [] }
}

// Campos del piece que viajan al portal — sin internalNotes, ownerId, taskId,
// order ni comentarios internos. Es un `select`, no un `include`: así ni
// siquiera se leen de la DB los campos que el formatter no debe exponer.
const PUBLIC_PIECE_SELECT = {
  id:                 true,
  title:              true,
  status:             true,
  type:               true,
  networks:           true,
  copy:               true,
  hashtags:           true,
  scheduledAt:        true,
  scheduledDate:      true,
  publishedAt:        true,
  publishedUrl:       true,
  assets:             { where: { status: 'ready' }, orderBy: { order: 'asc' } },
  submittedAt:        true,
  approvedAt:         true,
  approvedBy:         { select: { name: true } },
  changesRequestedAt: true,
  createdAt:          true,
  updatedAt:          true,
}

// Formatter PÚBLICO. Deliberadamente separado de formatPiece (content.controller.js):
// nunca debe tocar internalNotes/ownerId/taskId/order ni comentarios internal.
function formatPiecePublic(p) {
  return {
    id:            p.id,
    title:         p.title,
    status:        p.status,
    statusLabel:   statusMeta(p.status)?.label ?? p.status,
    type:          p.type,
    networks:      safeParseArr(p.networks),
    copy:          p.copy,
    hashtags:      p.hashtags,
    scheduledAt:   p.scheduledAt,
    scheduledDate: p.scheduledDate,
    publishedAt:   p.publishedAt,
    publishedUrl:  p.publishedUrl,
    assets:        p.assets ? p.assets.map(formatAsset) : [],
    submittedAt:        p.submittedAt,
    approvedAt:         p.approvedAt,
    approvedBy:         p.approvedBy ? { name: p.approvedBy.name || 'Cliente' } : null,
    changesRequestedAt: p.changesRequestedAt,
    canDecide:     CLIENT_APPROVE_FROM.includes(p.status),
    createdAt:     p.createdAt,
    updatedAt:     p.updatedAt,
  }
}

// Espejo de formatComment (contentComments.controller.js) para la audiencia
// pública: mismos campos, sin nada extra.
function formatCommentPublic(c) {
  return {
    id:   c.id,
    body: c.body,
    author: c.authorUser
      ? { name: c.authorUser.name, avatar: c.authorUser.avatar, isTeam: true }
      : { name: c.authorName || 'Vos', isTeam: false },
    createdAt: c.createdAt,
  }
}

/**
 * Tres guardas que ningún middleware da acá (las rutas públicas no pasan por
 * resolveWorkspace, así que requireFeatureFlag no aplica): el flag `contenido`
 * a mano (grant de SuperAdmin + opt-out del workspace) y `portal.contentEnabled`.
 * Devuelve { status, error } si hay que cortar, o null si puede seguir.
 */
async function assertContentAccess(portal) {
  if (!portal.contentEnabled) {
    return { status: 404, error: 'El módulo de Contenido no está habilitado para este proyecto' }
  }
  const [flag, workspace] = await Promise.all([
    prisma.featureFlag.findUnique({ where: { key: 'contenido' } }),
    prisma.workspace.findUnique({ where: { id: portal.workspaceId }, select: { disabledFeatureKeys: true } }),
  ])
  const disabledKeys = JSON.parse(workspace?.disabledFeatureKeys || '[]')
  if (!isFlagEnabledForWorkspace(flag, portal.workspaceId, disabledKeys)) {
    return { status: 404, error: 'Este módulo no está habilitado' }
  }
  return null
}

/**
 * Avisa al equipo (solo notificación in-app, sin email — los emails quedan
 * reservados para avisos al cliente, no de vuelta al equipo) que el cliente
 * decidió sobre una pieza. Fire-and-forget total — se llama con setImmediate
 * después de responder; una aprobación ya persistida no debe fallar por un
 * aviso caído.
 */
async function notifyTeamOfDecision(portal, piece, contact, decision) {
  try {
    const type = decision === 'approved' ? 'CONTENT_APPROVED' : 'CONTENT_CHANGES_REQUESTED'
    const who  = (contact.name && contact.name.trim()) ? contact.name.trim() : contact.email
    const verb = decision === 'approved' ? 'aprobó' : 'pidió cambios en'
    const preview = piece.title.length > 60 ? `${piece.title.slice(0, 57)}…` : piece.title
    // Autocontenido a propósito: el actor es un contacto del cliente, no un
    // User — Notification.actorId queda null, así que el texto no puede
    // apoyarse en `actor.name` como el resto de las notificaciones.
    const message = `${who} (cliente) ${verb} "${preview}"`

    const { userIds } = await getProjectNotifyRecipients(portal.projectId, portal.workspaceId)

    if (userIds.length > 0) {
      await prisma.notification.createMany({
        data: userIds.map(userId => ({
          userId, actorId: null, workspaceId: portal.workspaceId, projectId: portal.projectId,
          contentPieceId: piece.id, type, message,
        })),
      })
      for (const userId of userIds) {
        emitTo(`user:${userId}`, 'notification:new', { type, contentPieceId: piece.id })
      }
    }
  } catch {
    // best-effort — nunca debe tumbar nada, ya se respondió al cliente.
  }
}

// ─── Público: piezas del portal (requiere clientPortalAuth) ──────────────────

/**
 * GET /api/public/client-portal/:slug/content
 * Solo piezas en estados `portalVisible` — el WHERE filtra en SQL, nunca en JS.
 */
async function listPortalPieces(req, res, next) {
  try {
    const portal = req.clientPortal
    const guard = await assertContentAccess(portal)
    if (guard) return res.status(guard.status).json({ error: guard.error })

    const pieces = await prisma.contentPiece.findMany({
      where:   { projectId: portal.projectId, workspaceId: portal.workspaceId, status: { in: PORTAL_VISIBLE_STATUSES } },
      select:  PUBLIC_PIECE_SELECT,
      orderBy: { updatedAt: 'desc' },
    })

    res.json({ pieces: pieces.map(formatPiecePublic) })
  } catch (err) { next(err) }
}

/**
 * GET /api/public/client-portal/:slug/content/:pid
 * Detalle + hilo de comentarios `visibility:'client'` únicamente.
 */
async function getPortalPiece(req, res, next) {
  try {
    const portal = req.clientPortal
    const guard = await assertContentAccess(portal)
    if (guard) return res.status(guard.status).json({ error: guard.error })

    const piece = await prisma.contentPiece.findFirst({
      where:  { id: Number(req.params.pid), projectId: portal.projectId, workspaceId: portal.workspaceId, status: { in: PORTAL_VISIBLE_STATUSES } },
      select: PUBLIC_PIECE_SELECT,
    })
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    const comments = await prisma.contentComment.findMany({
      where:   { pieceId: piece.id, visibility: 'client' },
      include: { authorUser: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    })

    res.json({ piece: formatPiecePublic(piece), comments: comments.map(formatCommentPublic) })
  } catch (err) { next(err) }
}

/**
 * POST /api/public/client-portal/:slug/content/:pid/approve
 * Body: { comment? }. Requiere req.clientPortalContact con canApprove.
 */
async function approvePiece(req, res, next) {
  try {
    const portal = req.clientPortal
    const guard = await assertContentAccess(portal)
    if (guard) return res.status(guard.status).json({ error: guard.error })

    const contact = req.clientPortalContact
    if (!contact) return res.status(403).json({ error: 'Iniciá sesión de nuevo para continuar', code: 'CONTACT_REQUIRED' })
    if (!contact.canApprove) return res.status(403).json({ error: 'Tu usuario no puede aprobar piezas' })

    const piece = await prisma.contentPiece.findFirst({
      where:  { id: Number(req.params.pid), projectId: portal.projectId, workspaceId: portal.workspaceId },
      select: { id: true, title: true, status: true },
    })
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })
    if (!CLIENT_APPROVE_FROM.includes(piece.status)) {
      return res.status(409).json({ error: 'Esta pieza ya no está esperando aprobación' })
    }

    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, MAX_COMMENT) : ''

    await prisma.contentPiece.update({
      where: { id: piece.id },
      data:  { status: CLIENT_APPROVE_TO, approvedAt: new Date(), approvedByContactId: contact.id },
    })

    await prisma.contentStatusEvent.create({
      data: {
        pieceId: piece.id, workspaceId: portal.workspaceId,
        action: 'approved', fromStatus: piece.status, toStatus: CLIENT_APPROVE_TO,
        actorContactId: contact.id, actorName: contact.name || contact.email,
        comment: comment || null,
      },
    })

    if (comment) {
      await prisma.contentComment.create({
        data: {
          pieceId: piece.id, workspaceId: portal.workspaceId, visibility: 'client',
          authorContactId: contact.id, authorName: contact.name || contact.email, body: comment,
        },
      })
    }

    setImmediate(() => notifyTeamOfDecision(portal, piece, contact, 'approved'))

    const freshInternal = await loadPiece(piece.id, portal.projectId, portal.workspaceId)
    emitTo(`workspace:${portal.workspaceId}`, 'content:piece:updated', { projectId: portal.projectId, piece: formatPiece(freshInternal) })

    const fresh = await prisma.contentPiece.findFirst({ where: { id: piece.id }, select: PUBLIC_PIECE_SELECT })
    res.json(formatPiecePublic(fresh))
  } catch (err) { next(err) }
}

/**
 * POST /api/public/client-portal/:slug/content/:pid/request-changes
 * Body: { comment } — obligatorio. Requiere req.clientPortalContact con canApprove.
 */
async function requestChanges(req, res, next) {
  try {
    const portal = req.clientPortal
    const guard = await assertContentAccess(portal)
    if (guard) return res.status(guard.status).json({ error: guard.error })

    const contact = req.clientPortalContact
    if (!contact) return res.status(403).json({ error: 'Iniciá sesión de nuevo para continuar', code: 'CONTACT_REQUIRED' })
    if (!contact.canApprove) return res.status(403).json({ error: 'Tu usuario no puede decidir sobre piezas' })

    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : ''
    if (!comment) return res.status(400).json({ error: 'Contanos qué cambios necesitás' })
    if (comment.length > MAX_COMMENT) return res.status(400).json({ error: 'El comentario es demasiado largo' })

    const piece = await prisma.contentPiece.findFirst({
      where:  { id: Number(req.params.pid), projectId: portal.projectId, workspaceId: portal.workspaceId },
      select: { id: true, title: true, status: true },
    })
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })
    if (!CLIENT_APPROVE_FROM.includes(piece.status)) {
      return res.status(409).json({ error: 'Esta pieza ya no está esperando aprobación' })
    }

    await prisma.contentPiece.update({
      where: { id: piece.id },
      data:  { status: CLIENT_CHANGES_TO, changesRequestedAt: new Date() },
    })

    await prisma.contentStatusEvent.create({
      data: {
        pieceId: piece.id, workspaceId: portal.workspaceId,
        action: 'changes_requested', fromStatus: piece.status, toStatus: CLIENT_CHANGES_TO,
        actorContactId: contact.id, actorName: contact.name || contact.email, comment,
      },
    })

    // El comentario queda también en el hilo visible — así el pedido no se
    // pierde en el log, el equipo lo ve donde ya mira los mensajes del cliente.
    await prisma.contentComment.create({
      data: {
        pieceId: piece.id, workspaceId: portal.workspaceId, visibility: 'client',
        authorContactId: contact.id, authorName: contact.name || contact.email, body: comment,
      },
    })

    setImmediate(() => notifyTeamOfDecision(portal, piece, contact, 'changes'))

    const freshInternal = await loadPiece(piece.id, portal.projectId, portal.workspaceId)
    emitTo(`workspace:${portal.workspaceId}`, 'content:piece:updated', { projectId: portal.projectId, piece: formatPiece(freshInternal) })

    const fresh = await prisma.contentPiece.findFirst({ where: { id: piece.id }, select: PUBLIC_PIECE_SELECT })
    res.json(formatPiecePublic(fresh))
  } catch (err) { next(err) }
}

/**
 * POST /api/public/client-portal/:slug/content/:pid/comments
 * Body: { body } — mensaje suelto del cliente en el hilo (fuera de aprobar/pedir
 * cambios). Sin @menciones ni email por comentario — solo aprobar/pedir cambios
 * disparan aviso al equipo (ver plan §7).
 */
async function addPortalComment(req, res, next) {
  try {
    const portal = req.clientPortal
    const guard = await assertContentAccess(portal)
    if (guard) return res.status(guard.status).json({ error: guard.error })

    const contact = req.clientPortalContact
    if (!contact) return res.status(403).json({ error: 'Iniciá sesión de nuevo para comentar', code: 'CONTACT_REQUIRED' })

    const piece = await prisma.contentPiece.findFirst({
      where:  { id: Number(req.params.pid), projectId: portal.projectId, workspaceId: portal.workspaceId, status: { in: PORTAL_VISIBLE_STATUSES } },
      select: { id: true },
    })
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : ''
    if (!body) return res.status(400).json({ error: 'El comentario no puede estar vacío' })
    if (body.length > MAX_COMMENT) return res.status(400).json({ error: `El comentario no puede superar los ${MAX_COMMENT} caracteres` })

    const comment = await prisma.contentComment.create({
      data: {
        pieceId: piece.id, workspaceId: portal.workspaceId, visibility: 'client',
        authorContactId: contact.id, authorName: contact.name || contact.email, body,
      },
      include: { authorUser: { select: { id: true, name: true, avatar: true } } },
    })

    const formatted = formatCommentPublic(comment)
    emitTo(`workspace:${portal.workspaceId}`, 'content:comment:new', { projectId: portal.projectId, pieceId: piece.id, comment: formatted })

    res.status(201).json(formatted)
  } catch (err) { next(err) }
}

module.exports = {
  listPortalPieces,
  getPortalPiece,
  approvePiece,
  requestChanges,
  addPortalComment,
  // exportado para el test de fuga y para getPortalData (F7.5)
  formatPiecePublic,
  PORTAL_VISIBLE_STATUSES,
}
