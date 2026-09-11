// ─── Vínculos entre piezas de Contenido y archivos del proyecto (Archivos) ────
// Asociación pura (ContentPieceFile), sin duplicar storage — ver el modelo en
// schema.prisma y content.controller.js#PIECE_INCLUDE (los archivos vinculados
// ya viajan embebidos en cada pieza como `piece.files`, formateados por
// formatLinkedFile). Este controller solo resuelve las dos direcciones de la UI:
// - Desde el archivo (menú ⋯ → "Contenido"): listPiecesForFile.
// - Desde la pieza ("Seleccionar archivo del proyecto"): linkFile/unlinkFile,
//   usados también por la primera vez que se hace click en una pieza del picker.
const prisma = require('../lib/prisma')
const { statusMeta } = require('../lib/contentCatalog')
const { resolveCtx, loadPiece, formatPiece, emitPieceUpdated } = require('./content.controller')

/**
 * GET /api/contenido/projects/:id/files/:fileId/pieces
 * Piezas del proyecto disponibles para vincular (status !== 'publicado', no
 * borradas), cada una con `linked: boolean` según si ya existe el vínculo con
 * este archivo. Lectura abierta (mismo criterio que listPieces).
 */
async function listPiecesForFile(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const fileId = Number(req.params.fileId)
    const file = await prisma.projectFile.findFirst({
      where: { id: fileId, projectId, workspaceId, type: 'file', deletedAt: null },
      select: { id: true },
    })
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' })

    const pieces = await prisma.contentPiece.findMany({
      where:  { projectId, workspaceId, deletedAt: null, status: { not: 'publicado' } },
      select: { id: true, title: true, status: true, files: { where: { fileId }, select: { id: true } } },
      orderBy: { updatedAt: 'desc' },
    })

    res.json({
      pieces: pieces.map(p => ({
        id:          p.id,
        title:       p.title,
        status:      p.status,
        statusLabel: statusMeta(p.status)?.label ?? p.status,
        linked:      p.files.length > 0,
      })),
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/contenido/projects/:id/pieces/:pid/files
 * Body: { fileId }. Vincula un archivo ya existente en Archivos a la pieza.
 * Idempotente: vincular un archivo ya vinculado no falla, solo no hace nada.
 */
async function linkFile(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const piece = await loadPiece(req.params.pid, projectId, workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })
    if (piece.status === 'publicado') {
      return res.status(400).json({ error: 'No se pueden vincular archivos a una pieza publicada' })
    }

    const fileId = Number(req.body?.fileId)
    if (!Number.isInteger(fileId) || fileId <= 0) return res.status(400).json({ error: 'fileId inválido' })

    const file = await prisma.projectFile.findFirst({
      where: { id: fileId, projectId, workspaceId, type: 'file', deletedAt: null },
      select: { id: true },
    })
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' })

    try {
      await prisma.contentPieceFile.create({
        data: { workspaceId, pieceId: piece.id, fileId, linkedById: req.user.userId },
      })
    } catch (e) {
      if (e.code !== 'P2002') throw e // ya estaba vinculado — no-op
    }

    const fresh = await loadPiece(piece.id, projectId, workspaceId)
    const formatted = formatPiece(fresh)
    emitPieceUpdated(workspaceId, projectId, formatted)
    res.status(201).json(formatted)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/contenido/projects/:id/pieces/:pid/files/:fileId
 * Desvincula (nunca borra el ProjectFile en sí, solo la asociación).
 */
async function unlinkFile(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { workspaceId, projectId } = ctx

    const piece = await loadPiece(req.params.pid, projectId, workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    const fileId = Number(req.params.fileId)
    const link = await prisma.contentPieceFile.findFirst({
      where: { pieceId: piece.id, fileId, workspaceId },
    })
    if (!link) return res.status(404).json({ error: 'El archivo no está vinculado a esta pieza' })

    await prisma.contentPieceFile.delete({ where: { id: link.id } })

    const fresh = await loadPiece(piece.id, projectId, workspaceId)
    const formatted = formatPiece(fresh)
    emitPieceUpdated(workspaceId, projectId, formatted)
    res.json(formatted)
  } catch (err) { next(err) }
}

module.exports = { listPiecesForFile, linkFile, unlinkFile }
