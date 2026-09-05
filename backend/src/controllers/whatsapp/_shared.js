const prisma = require('../../lib/prisma')

async function assertConversation(req) {
  const conversation = await prisma.whatsappConversation.findFirst({
    where: { id: Number(req.params.id), workspaceId: req.workspace.id },
  })
  if (!conversation) {
    const err = new Error('Conversación no encontrada')
    err.status = 404
    throw err
  }
  return conversation
}

module.exports = { assertConversation }
