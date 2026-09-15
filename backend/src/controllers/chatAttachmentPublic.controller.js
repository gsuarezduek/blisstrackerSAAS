const prisma = require('../lib/prisma')
const objectStorage = require('../services/objectStorage.service')
const { safeContentDisposition } = require('../lib/contentDisposition')

/**
 * GET /api/public/chat-attachment/:id
 * Sirve un adjunto de un mensaje del chat interno. Público: el id es un UUID
 * no adivinable — mismo criterio que WhatsappMedia/SocialImage/ContentAsset, un
 * <img>/<a> src no puede llevar Authorization, así que la no-adivinabilidad ES
 * el control de acceso (incluidos los adjuntos de canales privados). Mismo
 * patrón dual R2/DB (302 al bucket si hay objectKey, si no bytes desde la DB)
 * que whatsappMediaPublic.controller.js.
 */
async function serveAttachment(req, res, next) {
  try {
    const attachment = await prisma.chatAttachment.findUnique({
      where: { id: req.params.id },
      select: { fileData: true, mimeType: true, objectKey: true, fileName: true },
    })
    if (!attachment) return res.status(404).send('Not found')

    if (attachment.objectKey) {
      // Cache moderado (1 día, no 1 año) para poder recambiar R2_PUBLIC_BASE
      // sin quedar clavado — mismo motivo que socialImage.controller.js.
      res.set('Cache-Control', 'public, max-age=86400')
      return res.redirect(302, objectStorage.publicUrl(attachment.objectKey))
    }

    if (!attachment.fileData) return res.status(404).send('Not found')

    res.set('Content-Type', attachment.mimeType)
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    if (attachment.fileName) {
      res.set('Content-Disposition', safeContentDisposition(attachment.fileName, { type: 'inline' }))
    }
    res.send(Buffer.from(attachment.fileData))
  } catch (err) { next(err) }
}

module.exports = { serveAttachment }
