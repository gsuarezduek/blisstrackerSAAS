const prisma = require('../lib/prisma')
const { resolveMentions } = require('../lib/mentions')
const { isAdmin } = require('../lib/projectAccess')
const { emitTo } = require('../lib/socket')
const { resolveCtx, loadPiece } = require('./content.controller')

const MAX_BODY = 4000
const AUTHOR_INCLUDE = { authorUser: { select: { id: true, name: true, avatar: true } } }

// Formatter único: la lectura interna (autenticada, esta pantalla) ve TODO el
// hilo — internal y client mezclados, el frontend los separa por pestaña. La
// lectura pública del portal (F7) usa su propio formatter que filtra por
// visibility:'client' en el WHERE de SQL, nunca acá.
function formatComment(c) {
  return {
    id:         c.id,
    visibility: c.visibility,
    body:       c.body,
    author: c.authorUser
      ? { id: c.authorUser.id, name: c.authorUser.name, avatar: c.authorUser.avatar, isTeam: true }
      : { id: c.authorContactId, name: c.authorName || 'Cliente', isTeam: false },
    createdAt: c.createdAt,
  }
}

/** GET /api/contenido/projects/:id/pieces/:pid/comments — lectura abierta (equipo). */
async function listComments(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return

    const piece = await loadPiece(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    const comments = await prisma.contentComment.findMany({
      where:   { pieceId: piece.id },
      include: AUTHOR_INCLUDE,
      orderBy: { createdAt: 'asc' },
    })
    res.json({ comments: comments.map(formatComment) })
  } catch (err) { next(err) }
}

/**
 * POST /api/contenido/projects/:id/pieces/:pid/comments
 * Body: { body, visibility? }. `visibility: 'client'` es el equipo respondiendo
 * en el hilo que el cliente va a ver desde el portal (F7); default 'internal'.
 * Mismo criterio de permiso que el resto de las mutaciones del módulo (canWrite).
 */
async function addComment(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const piece = await loadPiece(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : ''
    if (!body) return res.status(400).json({ error: 'El comentario no puede estar vacío' })
    if (body.length > MAX_BODY) return res.status(400).json({ error: `El comentario no puede superar los ${MAX_BODY} caracteres` })

    const visibility = req.body?.visibility === 'client' ? 'client' : 'internal'

    const comment = await prisma.contentComment.create({
      data: {
        pieceId:      piece.id,
        workspaceId:  ctx.workspaceId,
        visibility,
        authorUserId: req.user.userId,
        authorName:   req.user.name,
        body,
      },
      include: AUTHOR_INCLUDE,
    })

    // @menciones contra miembros ACTIVOS DEL WORKSPACE (no del proyecto): en este
    // repo cualquier miembro ve cualquier proyecto, así que acotar a ProjectMember
    // generaría menciones que no matchean (mismo criterio que el chat interno).
    if (body.includes('@')) {
      const members = await prisma.workspaceMember.findMany({
        where:   { workspaceId: ctx.workspaceId, active: true },
        include: { user: { select: { id: true, name: true } } },
      })
      const users = members.map(m => ({ id: m.user.id, name: m.user.name }))
      const mentioned = resolveMentions(body, users, req.user.userId)

      if (mentioned.size > 0) {
        const preview = piece.title.length > 60 ? `${piece.title.slice(0, 57)}…` : piece.title
        await prisma.notification.createMany({
          data: [...mentioned].map(userId => ({
            userId,
            actorId: req.user.userId,
            workspaceId: ctx.workspaceId,
            projectId: ctx.projectId,
            contentPieceId: piece.id,
            type: 'CONTENT_MENTION',
            message: `te mencionó en "${preview}"`,
          })),
        })
        for (const userId of mentioned) {
          emitTo(`user:${userId}`, 'notification:new', { type: 'CONTENT_MENTION', contentPieceId: piece.id })
        }
      }
    }

    const formatted = formatComment(comment)
    emitTo(`workspace:${ctx.workspaceId}`, 'content:comment:new', { projectId: ctx.projectId, pieceId: piece.id, comment: formatted })

    res.status(201).json(formatted)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/contenido/projects/:id/pieces/:pid/comments/:cid
 * Autor o admin/owner (moderación) — mismo criterio que el borrado de mensajes del chat.
 */
async function deleteComment(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return

    const piece = await loadPiece(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    const comment = await prisma.contentComment.findFirst({
      where: { id: Number(req.params.cid), pieceId: piece.id, workspaceId: ctx.workspaceId },
    })
    if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' })

    if (!isAdmin(req) && comment.authorUserId !== req.user.userId) {
      return res.status(403).json({ error: 'No podés eliminar este comentario' })
    }

    await prisma.contentComment.delete({ where: { id: comment.id } })
    emitTo(`workspace:${ctx.workspaceId}`, 'content:comment:deleted', { projectId: ctx.projectId, pieceId: piece.id, id: comment.id })

    res.json({ deleted: true })
  } catch (err) { next(err) }
}

module.exports = { listComments, addComment, deleteComment }
