const prisma = require('../lib/prisma')
const { createMessage } = require('../lib/claude')
const { getProvider, decryptAccount } = require('../lib/whatsappProvider')
const { emitTo } = require('../lib/socket')
const { ACTIVE_LEAD_STATUS_KEYS } = require('../lib/salesCatalog')
const { logLeadEvent } = require('../controllers/ventas/_shared')

const MODEL = 'claude-haiku-4-5-20251001' // costo bajo + rápido, mismo criterio que salesResearch/weeklyReport
const HISTORY_LIMIT = 20 // últimos N mensajes como contexto — alcanza para una charla comercial sin inflar el prompt

const DEFAULT_PROMPT = 'Sos un asistente comercial que responde por WhatsApp en nombre del equipo. Respondé de forma breve, cordial y directa, como en una charla real de WhatsApp (no un email). Si no sabés algo con certeza, decilo en vez de inventar.'

/**
 * Genera y manda la respuesta del bot a un mensaje entrante, si corresponde
 * (Fase 4 del plan). Se llama fire-and-forget desde el webhook (setImmediate)
 * — nunca debe romper el procesamiento del mensaje entrante, que ya se guardó
 * antes de esta llamada.
 *
 * Condiciones para responder (todas):
 *  - El workspace tiene WhatsappBotConfig.enabled = true (interruptor maestro).
 *  - La conversación puntual no fue tomada por un humano (botEnabled = true).
 *  - Hay presupuesto de tokens de IA disponible (createMessage lo valida y
 *    lanza si no — se captura acá, el bot simplemente no responde ese mensaje).
 *
 * v1 sin condiciones de escalamiento automático ni horario: el bot responde
 * hasta que alguien del equipo "toma el control" a mano (PATCH .../bot).
 */
async function maybeRespondWithBot({ account, conversation, contact }) {
  const config = await prisma.whatsappBotConfig.findUnique({ where: { workspaceId: account.workspaceId } })
  if (!config?.enabled) return

  const fresh = await prisma.whatsappConversation.findUnique({
    where: { id: conversation.id },
    select: { botEnabled: true, phoneE164: true },
  })
  if (!fresh?.botEnabled) return

  const history = await prisma.whatsappMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { id: 'desc' },
    take: HISTORY_LIMIT,
    select: { direction: true, content: true, senderType: true },
  })
  history.reverse()
  if (history.length === 0) return

  const transcript = history
    .map(m => `${m.direction === 'in' ? 'Cliente' : (m.senderType === 'bot' ? 'Asistente' : 'Equipo')}: ${m.content || '[adjunto]'}`)
    .join('\n')

  let contextLine = ''
  if (contact) {
    const company = contact.companyId
      ? await prisma.company.findUnique({ where: { id: contact.companyId }, select: { name: true } })
      : null
    contextLine = `\n\nContexto: estás hablando con ${contact.name}${company?.name ? ` de ${company.name}` : ''}.`
  }

  // Catálogo de servicios del workspace (mismo dato que ya usa salesProposal.service.js
  // para las propuestas) — se agrega solo al contexto para no obligar a
  // copiarlo a mano dentro del prompt libre. No incluye precios: acá no hay
  // ningún catálogo de precios estructurado (ver Proposal.plans, que son
  // ad-hoc por propuesta, no un listado general) — esos siguen yendo en el
  // texto del prompt si el admin quiere que el bot los mencione.
  const services = await prisma.service.findMany({
    where: { workspaceId: account.workspaceId, active: true },
    select: { name: true, description: true },
  })
  const servicesBlock = services.length
    ? `\n\nServicios de la agencia:\n${services.map(s => `- ${s.name}${s.description ? `: ${s.description}` : ''}`).join('\n')}`
    : ''

  let replyText
  try {
    const msg = await createMessage({
      model: MODEL,
      max_tokens: 500,
      system: (config.prompt?.trim() || DEFAULT_PROMPT) + contextLine + servicesBlock,
      messages: [{
        role: 'user',
        content: `Historial de la conversación de WhatsApp (más reciente al final):\n\n${transcript}\n\nRespondé como "Asistente" al último mensaje del Cliente. Solo el texto de la respuesta, sin comillas ni prefijos.`,
      }],
    }, { workspaceId: account.workspaceId, source: 'whatsapp_bot', enforceBudget: true })
    replyText = msg.content.find(b => b.type === 'text')?.text?.trim()
  } catch (err) {
    console.error('[WhatsApp Bot] Error generando respuesta con Claude:', err.message)
    return
  }
  if (!replyText) return

  // Re-chequeo justo antes de mandar (la llamada a Claude tarda unos
  // segundos) — evita el doble mensaje si un humano respondió o tomó el
  // control mientras se generaba esta respuesta.
  const stillHandled = await prisma.whatsappConversation.findUnique({ where: { id: conversation.id }, select: { botEnabled: true } })
  if (!stillHandled?.botEnabled) return

  const provider = getProvider(account.provider)
  const decrypted = decryptAccount(account)
  let waMessageId
  try {
    ;({ waMessageId } = await provider.sendSessionMessage({ account: decrypted, to: fresh.phoneE164, text: replyText }))
  } catch (err) {
    // Mismo criterio que sendMessage/sendMedia en whatsapp.controller.js: el
    // mensaje crudo de axios ("Request failed with status code 400") no dice
    // nada — el detalle real que devuelve Chakra es lo único que sirve para
    // diagnosticar sin adivinar.
    const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : err.message
    console.error('[WhatsApp Bot] Error enviando respuesta vía', account.provider, ':', detail, '| texto:', replyText)
    return
  }

  const message = await prisma.whatsappMessage.create({
    data: {
      workspaceId: account.workspaceId,
      conversationId: conversation.id,
      direction: 'out',
      content: replyText,
      waMessageId: waMessageId || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      senderType: 'bot',
      status: 'sent',
    },
  })

  await prisma.whatsappConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } })
  emitTo(`workspace:${account.workspaceId}`, 'whatsapp:message', { conversationId: conversation.id, message })

  if (contact) {
    const lead = await prisma.lead.findFirst({
      where: { workspaceId: account.workspaceId, primaryContactId: contact.id, status: { in: ACTIVE_LEAD_STATUS_KEYS } },
      select: { id: true },
    })
    if (lead) {
      await logLeadEvent({
        workspaceId: account.workspaceId, leadId: lead.id, userId: null, type: 'whatsapp_message',
        content: `el bot respondió por WhatsApp: "${replyText.slice(0, 120)}"`,
      })
    }
  }
}

module.exports = { maybeRespondWithBot, DEFAULT_PROMPT }
