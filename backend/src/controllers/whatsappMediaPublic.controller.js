const prisma = require('../lib/prisma')
const objectStorage = require('../services/objectStorage.service')

/**
 * GET /api/public/whatsapp-media/:id
 * Sirve un adjunto de WhatsApp (Fase 3 del plan). Público: el id es un UUID
 * no adivinable — mismo criterio que SocialImage/ContentAsset, un
 * <img>/<audio>/<a> src no puede llevar Authorization, así que la
 * no-adivinabilidad ES el control de acceso. Mismo patrón dual R2/DB (302 al
 * bucket si hay objectKey, si no bytes desde la DB) que socialImage.controller.js.
 */
async function serveMedia(req, res, next) {
  try {
    const media = await prisma.whatsappMedia.findUnique({
      where: { id: req.params.id },
      select: { mediaData: true, mimeType: true, objectKey: true, fileName: true },
    })
    if (!media) return res.status(404).send('Not found')

    if (media.objectKey) {
      // Cache moderado (1 día, no 1 año) para poder recambiar R2_PUBLIC_BASE
      // sin quedar clavado — mismo motivo que socialImage.controller.js.
      res.set('Cache-Control', 'public, max-age=86400')
      return res.redirect(302, objectStorage.publicUrl(media.objectKey))
    }

    if (!media.mediaData) return res.status(404).send('Not found')

    res.set('Content-Type', media.mimeType)
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    if (media.fileName) {
      res.set('Content-Disposition', `inline; filename="${media.fileName.replace(/[\r\n"]/g, '')}"`)
    }
    res.send(Buffer.from(media.mediaData))
  } catch (err) { next(err) }
}

module.exports = { serveMedia }
