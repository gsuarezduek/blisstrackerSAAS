// Imágenes de los mails. Van a R2 con URL pública permanente: un mail ya enviado
// la sigue pidiendo meses después, así que no puede ser una URL firmada que vence.
// Solo PNG/JPG/GIF/WEBP validados por magic bytes (nunca SVG: lo bloquean casi
// todos los clientes de mail y es vector de XSS si se sirve desde nuestro dominio).
const { validateImageUpload } = require('../../lib/imageType')
const storage = require('../../services/objectStorage.service')
const { resolveCtx } = require('./_shared')

const ALLOWED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MAX_MB = 5

/** POST /projects/:id/mailing/images (multipart, campo `file`) → { url } */
async function uploadImage(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    if (!storage.isConfigured()) {
      return res.status(503).json({ error: 'El almacenamiento de imágenes no está configurado. Pegá la URL de una imagen ya publicada.' })
    }
    if (!req.file) return res.status(400).json({ error: 'No llegó ningún archivo' })
    const check = validateImageUpload(req.file.buffer, ALLOWED)
    if (!check.ok) return res.status(400).json({ error: check.error })
    const { url } = await storage.putObject(req.file.buffer, check.mimeType, { prefix: `mailing/${ctx.workspaceId}` })
    res.status(201).json({ url })
  } catch (err) { next(err) }
}

module.exports = { uploadImage, MAX_MB }
