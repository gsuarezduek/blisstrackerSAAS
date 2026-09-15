// Include compartido de ChatMessage — mismo shape para los mensajes que crea
// chat.controller.js (usuario) y los que postea chatSystemMessage.js (sistema).
const AUTHOR_SELECT = { id: true, name: true, avatar: true }

// Nunca expone objectKey/fileData (la key de R2 no debe llegar al cliente) — el
// frontend arma la URL de descarga solo con `id` (chatAttachmentUrl.js), igual
// que whatsappMediaUrl.js.
const ATTACHMENT_SELECT = { id: true, kind: true, mimeType: true, fileName: true, sizeBytes: true, width: true, height: true }

const MESSAGE_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  pinnedBy: { select: AUTHOR_SELECT },
  reactions: { orderBy: { createdAt: 'asc' }, select: { id: true, emoji: true, userId: true, user: { select: { name: true } } } },
  attachment: { select: ATTACHMENT_SELECT },
  // Preview del mensaje citado (respuesta estilo WhatsApp/Discord) — liviano a propósito,
  // solo lo necesario para renderizar el quote arriba del mensaje. Puede ser un mensaje
  // de sistema (author null) o uno ya borrado (replyTo null, ver onDelete: SetNull).
  replyTo: { select: { id: true, content: true, gifUrl: true, systemType: true, attachment: { select: { kind: true } }, author: { select: AUTHOR_SELECT } } },
}

module.exports = { AUTHOR_SELECT, ATTACHMENT_SELECT, MESSAGE_INCLUDE }
