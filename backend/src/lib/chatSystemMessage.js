const prisma = require('./prisma')
const { emitTo } = require('./socket')
const { ensureProjectChannel } = require('./chatChannels')
const { MESSAGE_INCLUDE } = require('./chatMessageInclude')

// Catálogo de mensajes de sistema del chat — agregar acá antes de usar un `systemType`
// nuevo en algún controller. Espejo de íconos en el frontend: SYSTEM_ICONS en
// frontend/src/components/chat/MessageList.jsx (mantener ambos en sync).
const SYSTEM_TYPES = {
  REPORT_GENERATED: 'report_generated',
  REPORT_RATED: 'report_rated',
  CONTENT_PUBLISHED: 'content_published',
  CONTENT_APPROVED: 'content_approved',
  CONTENT_CHANGES_REQUESTED: 'content_changes_requested',
  BRIEF_COMPLETED: 'brief_completed',
  MEETING_HELD: 'meeting_held',
}

// Publica un mensaje del sistema (ChatMessage.authorId=null) en el canal de chat del
// proyecto — deja constancia de un hito (informe generado, brief completo, reunión
// cerrada, etc.), no del trabajo puntual de una persona. Best-effort: nunca lanza, un
// fallo acá no debe romper la acción real que lo dispara (mismo criterio "log-and-swallow"
// que el resto de las integraciones fire-and-forget del repo: email, cacheo de imágenes
// sociales, notificaciones de plataforma). Se llama siempre vía setImmediate desde el
// controller, después de responder.
async function postProjectSystemMessage(projectId, workspaceId, systemType, content) {
  try {
    let channel = await prisma.chatChannel.findUnique({ where: { projectId } })
    if (!channel) {
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } })
      if (!project) return
      channel = await ensureProjectChannel({ ...project, workspaceId })
    }

    const message = await prisma.chatMessage.create({
      data: { workspaceId, channelId: channel.id, authorId: null, content, systemType },
      include: MESSAGE_INCLUDE,
    })

    emitTo(`channel:${channel.id}`, 'chat:message', message)
    emitTo(`workspace:${workspaceId}`, 'chat:unread', { channelId: channel.id, authorId: null })
  } catch (err) {
    console.warn('[chatSystemMessage] fallo al postear mensaje de sistema (ignorado):', err.message)
  }
}

module.exports = { SYSTEM_TYPES, postProjectSystemMessage }
