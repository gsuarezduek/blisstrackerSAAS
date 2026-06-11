const prisma = require('../lib/prisma')

/**
 * GET /api/social-image/:id
 * Sirve una imagen de RRSS cacheada desde la DB. Pública (igual que avatares):
 * las imágenes son contenido público de las redes y el id es un UUID no adivinable.
 * El contenido es inmutable por id → cache larga.
 */
async function serveImage(req, res, next) {
  try {
    const img = await prisma.socialImage.findUnique({
      where:  { id: req.params.id },
      select: { imageData: true, mimeType: true },
    })
    if (!img) return res.status(404).send('Not found')

    res.set('Content-Type', img.mimeType)
    res.set('Cache-Control', 'public, max-age=31536000, immutable') // 1 año
    res.send(Buffer.from(img.imageData))
  } catch (err) { next(err) }
}

module.exports = { serveImage }
