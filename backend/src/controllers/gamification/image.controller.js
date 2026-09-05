const prisma = require('../../lib/prisma')
const { validateImageUpload } = require('../../lib/imageType')

// ─── Imagen del juego ─────────────────────────────────────────────────────────

/** POST /api/gamification/games/:id/image (admin) — multipart, campo "image" */
async function uploadImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' })
    // Validar por contenido real (magic bytes), no por extensión ni Content-Type del cliente.
    const check = validateImageUpload(req.file.buffer, ['image/png', 'image/jpeg', 'image/webp'])
    if (!check.ok) return res.status(400).json({ error: 'Formato no soportado. Usá PNG, JPG o WebP.' })

    const r = await prisma.game.updateMany({
      where: { id: Number(req.params.id), workspaceId: req.workspace.id },
      data:  { imageData: req.file.buffer, imageMimeType: check.mimeType },
    })
    if (r.count === 0) return res.status(404).json({ error: 'Juego no encontrado' })
    res.json({ ok: true, hasImage: true })
  } catch (err) { next(err) }
}

/** DELETE /api/gamification/games/:id/image (admin) */
async function deleteImage(req, res, next) {
  try {
    const r = await prisma.game.updateMany({
      where: { id: Number(req.params.id), workspaceId: req.workspace.id },
      data:  { imageData: null, imageMimeType: null },
    })
    if (r.count === 0) return res.status(404).json({ error: 'Juego no encontrado' })
    res.json({ ok: true, hasImage: false })
  } catch (err) { next(err) }
}

/** GET /api/gamification/games/:id/image — sirve la imagen (público, sin auth, igual que avatares/logo) */
async function serveImage(req, res, next) {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) return res.status(404).end()
    const game = await prisma.game.findUnique({ where: { id }, select: { imageData: true, imageMimeType: true } })
    if (!game?.imageData || !game.imageMimeType) return res.status(404).json({ error: 'Imagen no encontrada' })
    res.set('Content-Type', game.imageMimeType)
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(Buffer.from(game.imageData))
  } catch (err) { next(err) }
}

module.exports = { uploadImage, deleteImage, serveImage }
