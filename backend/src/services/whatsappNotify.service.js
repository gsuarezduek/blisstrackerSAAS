const prisma = require('../lib/prisma')
const { emitTo } = require('../lib/socket')
const { memberHasModuleAccess } = require('../lib/moduleAccess')

// Avisos de la campana por chats de WhatsApp sin leer (WHATSAPP_MESSAGE).
//
// Antes solo se avisaba si el contacto era el principal de un lead activo, y solo a
// su responsable. Los chats que atiende el bot son justamente los de contactos
// nuevos —sin lead ni respuesta humana todavía—, así que esos nunca avisaban: el
// equipo no se enteraba de lo que el bot estaba contestando solo.
//
// Ahora:
//  - Destinatarios: el responsable del chat (`assignedToId`, o el dueño del lead
//    activo del contacto) si lo hay; si no, todos los miembros activos con acceso a
//    Ventas — mismo criterio que el leído compartido: cualquiera del equipo puede
//    revisarlo.
//  - UN aviso por chat sin leer y por persona: si ya tiene uno sin leer de ese chat,
//    se actualiza con el último mensaje (y sube arriba en la campana) en vez de
//    apilar uno por mensaje.
//  - Abrir el chat (`markConversationRead`, lib/whatsappRead.js) marca leídos los
//    avisos de ese chat para todos: el chat ya lo vio alguien del equipo.
//
// Best-effort: nunca rompe el procesamiento del mensaje entrante.

async function salesRecipientIds(workspaceId) {
  const [workspace, members] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { moduleAccess: true } }),
    prisma.workspaceMember.findMany({
      where: { workspaceId, active: true },
      select: { userId: true, role: true, teamRole: true, extraTeamRoles: true },
    }),
  ])
  return members.filter(m => memberHasModuleAccess(workspace, m, 'ventas')).map(m => m.userId)
}

/**
 * @param {object} p
 * @param {number} p.workspaceId
 * @param {{ id: number, assignedToId?: number|null }} p.conversation
 * @param {{ id: number, ownerId?: number|null } | null} p.lead  lead activo del contacto, si hay
 * @param {string} p.message  texto autocontenido (quien escribe no es un User)
 * @param {boolean} [p.ownerOnly]  avisar solo si hay responsable (ej. una reacción)
 */
async function notifyWhatsappConversation({ workspaceId, conversation, lead = null, message, ownerOnly = false }) {
  try {
    const ownerId = conversation.assignedToId || lead?.ownerId || null
    let recipients
    if (ownerId) recipients = [ownerId]
    else if (ownerOnly) return
    else recipients = await salesRecipientIds(workspaceId)
    if (recipients.length === 0) return

    const existing = await prisma.notification.findMany({
      where: {
        workspaceId,
        type: 'WHATSAPP_MESSAGE',
        whatsappConversationId: conversation.id,
        read: false,
        userId: { in: recipients },
      },
      select: { id: true, userId: true },
    })
    const existingByUser = new Map(existing.map(n => [n.userId, n.id]))
    const now = new Date()
    const leadId = lead?.id ?? null

    await prisma.$transaction(recipients.map(userId => {
      const id = existingByUser.get(userId)
      return id
        ? prisma.notification.update({ where: { id }, data: { message, leadId, createdAt: now } })
        : prisma.notification.create({
            data: {
              userId, workspaceId, leadId,
              whatsappConversationId: conversation.id,
              type: 'WHATSAPP_MESSAGE',
              message,
            },
          })
    }))

    for (const userId of recipients) {
      emitTo(`user:${userId}`, 'notification:new', {
        type: 'WHATSAPP_MESSAGE', leadId, whatsappConversationId: conversation.id,
      })
    }
  } catch (err) {
    console.error('[WhatsApp] Error notificando el chat:', err.message)
  }
}

module.exports = { notifyWhatsappConversation, salesRecipientIds }
