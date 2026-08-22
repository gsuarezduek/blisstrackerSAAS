const { getProvider, decryptAccount } = require('../lib/whatsappProvider')
const objectStorage = require('./objectStorage.service')
const { validateImageUpload } = require('../lib/imageType')
const { validateMediaHeader } = require('../lib/mediaType')

// Topes reales de la WhatsApp Cloud API (lo que Meta ya aceptó del lado del
// remitente) — los usamos también como techo propio, no tiene sentido guardar
// más de lo que la plataforma permite mandar.
const MAX_BYTES = {
  image: 5 * 1024 * 1024,
  sticker: 1 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
}

/**
 * Descarga un adjunto entrante de WhatsApp (downloadMedia del provider, un
 * solo paso — ver disclaimer en chakra.js) y lo persiste — R2 si está
 * configurado, si no bytes en WhatsappMedia.mediaData (mismo dual storage que
 * SocialImage/ContentAsset). Best-effort: devuelve null ante cualquier fallo
 * (timeout, archivo demasiado grande) — un adjunto que no se pudo bajar no
 * debe tirar abajo el mensaje entrante, que igual se guarda (con el caption
 * si vino).
 *
 * Validación de magic bytes: solo para imagen/sticker/video, que son los
 * únicos formatos con detector en este repo (lib/imageType.js, lib/mediaType.js).
 * Audio y documentos confían en el mime_type que devuelve la propia API —
 * a diferencia de un upload arbitrario (ContentAsset), este archivo ya fue
 * aceptado y entregado por WhatsApp, no es input directo de un usuario nuestro.
 */
async function downloadInboundMedia({ account, mediaId, kind, mimeType }) {
  try {
    const provider = getProvider(account.provider)
    const decrypted = decryptAccount(account)

    const { buffer, mimeType: fetchedMime } = await provider.downloadMedia({ account: decrypted, mediaId })
    const cap = MAX_BYTES[kind] || MAX_BYTES.document
    if (!buffer || buffer.length === 0 || buffer.length > cap) return null

    let finalMime = fetchedMime || mimeType || 'application/octet-stream'
    if (kind === 'image' || kind === 'sticker') {
      const check = validateImageUpload(buffer, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
      if (check.ok) finalMime = check.mimeType
    } else if (kind === 'video') {
      const check = validateMediaHeader(buffer, 'video', ['video/mp4', 'video/quicktime', 'video/webm'])
      if (check.ok) finalMime = check.mimeType
    }

    if (objectStorage.isConfigured()) {
      const { key, size } = await objectStorage.putObject(buffer, finalMime, { prefix: `whatsapp/${account.workspaceId}` })
      return { kind, mimeType: finalMime, sizeBytes: size, objectKey: key, mediaData: null }
    }
    return { kind, mimeType: finalMime, sizeBytes: buffer.length, objectKey: null, mediaData: buffer }
  } catch (err) {
    console.error('[WhatsApp Media] Error descargando adjunto entrante:', err.message)
    return null
  }
}

module.exports = { downloadInboundMedia, MAX_BYTES }
