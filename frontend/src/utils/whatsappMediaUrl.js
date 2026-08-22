/**
 * URL pública (no adivinable) para mostrar un adjunto de WhatsApp — servido
 * por el backend (dual storage R2/DB), ver whatsappMediaPublic.controller.js.
 *
 * Uso: whatsappMediaUrl(media.id) → http://localhost:3001/api/public/whatsapp-media/<uuid>
 */
const API_URL = import.meta.env.VITE_API_URL || ''

export function whatsappMediaUrl(mediaId) {
  return `${API_URL}/api/public/whatsapp-media/${mediaId}`
}
