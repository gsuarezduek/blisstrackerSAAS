// Include compartido de ChatMessage — mismo shape para los mensajes que crea
// chat.controller.js (usuario) y los que postea chatSystemMessage.js (sistema).
const AUTHOR_SELECT = { id: true, name: true, avatar: true }

const MESSAGE_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  pinnedBy: { select: AUTHOR_SELECT },
  reactions: { orderBy: { createdAt: 'asc' }, select: { id: true, emoji: true, userId: true, user: { select: { name: true } } } },
}

module.exports = { AUTHOR_SELECT, MESSAGE_INCLUDE }
