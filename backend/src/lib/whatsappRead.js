const prisma = require('./prisma')

// Leído de las conversaciones de WhatsApp: COMPARTIDO por todo el equipo, no por
// persona (una bandeja comercial: si alguien ya lo vio, no hace falta que lo vean
// todos). Criterio único — lo usan la lista de conversaciones, el contador de la
// barra lateral (nav.controller.js) y quien marque leído.
//
// Una conversación está NO LEÍDA si:
//  - alguien la marcó "no leída" a mano (`markedUnreadAt`), o
//  - tiene un mensaje DEL CONTACTO posterior a lo último visto (`lastReadMessageId`).
// Solo cuentan los entrantes y sin reacciones: la respuesta de un compañero, del bot
// o de un agente no es algo "nuevo para leer", y un 👍 tampoco (mismo criterio que
// `awaitingReply`).

const UNREAD_MESSAGE_WHERE = { direction: 'in', reactionEmoji: null }

function isConversationUnread(conversation, lastInboundMessageId) {
  if (conversation.markedUnreadAt) return true
  return Boolean(lastInboundMessageId && lastInboundMessageId > (conversation.lastReadMessageId ?? 0))
}

// conversationId → id del último mensaje que cuenta para "no leído", en una query.
async function lastUnreadableMessageIds(conversationIds) {
  if (conversationIds.length === 0) return new Map()
  const rows = await prisma.whatsappMessage.groupBy({
    by: ['conversationId'],
    where: { conversationId: { in: conversationIds }, ...UNREAD_MESSAGE_WHERE },
    _max: { id: true },
  })
  return new Map(rows.map(r => [r.conversationId, r._max.id]))
}

// Marca vista la conversación hasta `messageId` (null = no tiene mensajes) y le
// saca la marca manual de "no leída". El puntero nunca retrocede: si dos personas
// la abren a la vez, gana el mensaje más nuevo.
async function markConversationRead(conversationId, messageId) {
  const ops = []
  if (messageId) {
    ops.push(prisma.whatsappConversation.updateMany({
      where: { id: conversationId, OR: [{ lastReadMessageId: null }, { lastReadMessageId: { lt: messageId } }] },
      data: { lastReadMessageId: messageId, lastReadAt: new Date() },
    }))
  }
  ops.push(prisma.whatsappConversation.updateMany({
    where: { id: conversationId, markedUnreadAt: { not: null } },
    data: { markedUnreadAt: null },
  }))
  await prisma.$transaction(ops)
}

module.exports = { UNREAD_MESSAGE_WHERE, isConversationUnread, lastUnreadableMessageIds, markConversationRead }
