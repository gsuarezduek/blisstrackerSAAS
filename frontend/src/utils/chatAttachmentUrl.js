/**
 * URL pública (no adivinable) para mostrar un adjunto del chat interno —
 * servido por el backend (dual storage R2/DB), ver chatAttachmentPublic.controller.js.
 *
 * Uso: chatAttachmentUrl(attachment.id) → http://localhost:3001/api/public/chat-attachment/<uuid>
 */
const API_URL = import.meta.env.VITE_API_URL || ''

export function chatAttachmentUrl(attachmentId) {
  return `${API_URL}/api/public/chat-attachment/${attachmentId}`
}
