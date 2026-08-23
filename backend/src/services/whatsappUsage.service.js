const prisma = require('../lib/prisma')
const { monthBounds } = require('../lib/monthUtils')

function monthRange(month) {
  const { startDate, endDate } = monthBounds(month)
  return { start: new Date(`${startDate}T00:00:00.000Z`), end: new Date(`${endDate}T23:59:59.999Z`) }
}

/**
 * Agrega una lista de WhatsappMessage (ya de un solo mes/workspace) en las
 * métricas de uso de Fase 6. `messagesOut` cuenta TODO saliente (texto libre
 * + plantilla); `templatesSent` es el subset facturable (viaTemplate=true —
 * lo único que Meta cobra como "conversación iniciada por el negocio").
 * `avgFirstResponseMins`: entre las conversaciones cuyo primer mensaje de
 * este lote es entrante, el promedio de minutos hasta la primera respuesta
 * saliente (también dentro del lote) — null si ninguna conversación tuvo
 * ambos dentro del período.
 */
function aggregateMessages(messages) {
  let messagesIn = 0, messagesOut = 0, templatesSent = 0
  const byConversation = new Map()
  for (const m of messages) {
    if (m.direction === 'in') messagesIn++
    else { messagesOut++; if (m.viaTemplate) templatesSent++ }
    if (!byConversation.has(m.conversationId)) byConversation.set(m.conversationId, [])
    byConversation.get(m.conversationId).push(m)
  }

  const responseTimesMins = []
  for (const msgs of byConversation.values()) {
    const firstIn = msgs.find(m => m.direction === 'in')
    if (!firstIn) continue
    const firstReply = msgs.find(m => m.direction === 'out' && m.createdAt > firstIn.createdAt)
    if (!firstReply) continue
    responseTimesMins.push((firstReply.createdAt - firstIn.createdAt) / 60000)
  }
  const avgFirstResponseMins = responseTimesMins.length
    ? Math.round(responseTimesMins.reduce((a, b) => a + b, 0) / responseTimesMins.length)
    : null

  return { messagesIn, messagesOut, templatesSent, conversationsActive: byConversation.size, avgFirstResponseMins }
}

// Uso de WhatsApp de UN workspace en un mes — para MetricsTab de Ventas.
async function computeWorkspaceWhatsappUsage(workspaceId, month) {
  const { start, end } = monthRange(month)
  const messages = await prisma.whatsappMessage.findMany({
    where: { workspaceId, createdAt: { gte: start, lte: end } },
    select: { conversationId: true, direction: true, viaTemplate: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  return { month, ...aggregateMessages(messages) }
}

// Uso de WhatsApp de TODOS los workspaces en un mes, en un solo query — para
// la vista de costo/uso de SuperAdmin (mirror de GET /superadmin/ai-tokens).
async function computeAllWorkspacesWhatsappUsage(month) {
  const { start, end } = monthRange(month)
  const messages = await prisma.whatsappMessage.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: { workspaceId: true, conversationId: true, direction: true, viaTemplate: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const byWorkspace = new Map()
  for (const m of messages) {
    if (!byWorkspace.has(m.workspaceId)) byWorkspace.set(m.workspaceId, [])
    byWorkspace.get(m.workspaceId).push(m)
  }
  return [...byWorkspace.entries()].map(([workspaceId, msgs]) => ({ workspaceId, ...aggregateMessages(msgs) }))
}

module.exports = { computeWorkspaceWhatsappUsage, computeAllWorkspacesWhatsappUsage, aggregateMessages }
