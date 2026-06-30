const prisma = require('../lib/prisma')
const objectStorage = require('../services/objectStorage.service')

/**
 * GET /api/social-image/:id
 * Sirve una imagen de RRSS cacheada. Pública (igual que avatares): las imágenes
 * son contenido público de las redes y el id es un UUID no adivinable.
 *
 * Dos orígenes posibles (compatibilidad durante y después de la migración a R2):
 *   - Si la fila tiene `objectKey` → la imagen vive en object storage: 302 al CDN.
 *   - Si tiene `imageData` (legacy) → se sirve desde la DB.
 * Las URLs nuevas se guardan apuntando directo al CDN; este endpoint queda como
 * compatibilidad para las URLs `/api/social-image/:id` ya horneadas en snapshots.
 */
async function serveImage(req, res, next) {
  try {
    const img = await prisma.socialImage.findUnique({
      where:  { id: req.params.id },
      select: { imageData: true, mimeType: true, objectKey: true },
    })
    if (!img) return res.status(404).send('Not found')

    if (img.objectKey) {
      // Redirect cacheable al CDN (el navegador cachea el 302 con este header).
      res.set('Cache-Control', 'public, max-age=31536000, immutable') // 1 año
      return res.redirect(302, objectStorage.publicUrl(img.objectKey))
    }

    if (!img.imageData) return res.status(404).send('Not found')

    res.set('Content-Type', img.mimeType)
    res.set('Cache-Control', 'public, max-age=31536000, immutable') // 1 año
    res.send(Buffer.from(img.imageData))
  } catch (err) { next(err) }
}

module.exports = { serveImage }
