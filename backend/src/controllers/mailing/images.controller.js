// Imágenes de los mails. Van a R2 con URL pública permanente: un mail ya enviado
// la sigue pidiendo meses después, así que no puede ser una URL firmada que vence.
// Solo PNG/JPG/GIF/WEBP validados por magic bytes (nunca SVG: lo bloquean casi
// todos los clientes de mail y es vector de XSS si se sirve desde nuestro dominio).
const { validateImageUpload } = require('../../lib/imageType')
const storage = require('../../services/objectStorage.service')
const { resolveDirectUpload } = require('../../lib/directUpload')
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

/**
 * POST /projects/:id/mailing/images/direct { name?, contentBase64 | url } → { url }
 * La misma subida en JSON, para los agentes por MCP (un tool-call no manda
 * multipart). Los bytes se resuelven con lib/directUpload.js (descarga de URL con
 * assertPublicUrl en cada redirect) y pasan por el mismo chequeo de magic bytes.
 */
async function uploadImageDirect(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    if (!storage.isConfigured()) {
      return res.status(503).json({ error: 'El almacenamiento de imágenes no está configurado. Usá la URL de una imagen ya publicada.' })
    }
    const { name, contentBase64, url } = req.body || {}
    if (typeof req.body?.content === 'string' && req.body.content) {
      return res.status(400).json({ error: 'Mandá la imagen como `contentBase64` o `url`, no `content`' })
    }
    let buffer
    try {
      ({ buffer } = await resolveDirectUpload({ name, contentBase64, url }))
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message })
      throw err
    }
    if (buffer.length > MAX_MB * 1024 * 1024) return res.status(413).json({ error: `La imagen supera los ${MAX_MB}MB` })
    const check = validateImageUpload(buffer, ALLOWED)
    if (!check.ok) return res.status(400).json({ error: check.error })
    const { url: publicUrl } = await storage.putObject(buffer, check.mimeType, { prefix: `mailing/${ctx.workspaceId}` })
    res.status(201).json({ url: publicUrl })
  } catch (err) { next(err) }
}

module.exports = { uploadImage, uploadImageDirect, MAX_MB }
