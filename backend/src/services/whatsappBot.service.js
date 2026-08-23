const prisma = require('../lib/prisma')
const { createMessage } = require('../lib/claude')
const { getProvider, decryptAccount } = require('../lib/whatsappProvider')
const { emitTo } = require('../lib/socket')
const { ACTIVE_LEAD_STATUS_KEYS } = require('../lib/salesCatalog')
const { logLeadEvent } = require('../controllers/ventas/_shared')

const MODEL = 'claude-haiku-4-5-20251001' // costo bajo + rápido, mismo criterio que salesResearch/weeklyReport
const HISTORY_LIMIT = 20 // últimos N mensajes como contexto — alcanza para una charla comercial sin inflar el prompt

const DEFAULT_PROMPT = 'Sos un asistente comercial que responde por WhatsApp en nombre del equipo. Respondé de forma breve, cordial y directa, como en una charla real de WhatsApp (no un email). Si no sabés algo con certeza, decilo en vez de inventar.'

// Vacío/"null" en texto (Claude a veces devuelve el string "null" en vez del
// JSON null) → tratarlo como ausente, para no escribir basura en la ficha.
function cleanInsightValue(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (!s || /^(null|n\/a|ninguno|no aplica)$/i.test(s)) return null
  return s
}

/**
 * Aplica lo que el bot detectó en ESTE mensaje a la ficha del lead (pedido
 * explícito: "que el bot me actualice la ficha si capta algo relevante").
 * Regla de seguridad: solo completa campos vacíos, nunca pisa un dato que ya
 * cargó una persona — un dato mal inferido por la IA no debe silenciosamente
 * reemplazar uno correcto. `estimatedValue`/presupuesto queda deliberadamente
 * afuera de esto (campo de plata, mejor que lo cargue un humano a partir del
 * summary) — solo se auto-completan industry/website/email. El `summary`
 * siempre es no-destructivo: es una entrada nueva en el timeline, no pisa nada.
 * Best-effort: nunca debe romper el flujo del bot si falla.
 */
async function applyLeadInsights({ insights, contact, leadId, workspaceId }) {
  if (!insights || !contact) return
  try {
    const industry = cleanInsightValue(insights.industry)
    const website = cleanInsightValue(insights.website)
    if (contact.companyId && (industry || website)) {
      const company = await prisma.company.findUnique({ where: { id: contact.companyId }, select: { industry: true, website: true } })
      if (company) {
        const data = {}
        if (industry && !company.industry) data.industry = industry.slice(0, 200)
        if (website && !company.website) data.website = website.slice(0, 300)
        if (Object.keys(data).length > 0) await prisma.company.update({ where: { id: contact.companyId }, data })
      }
    }

    const contactEmail = cleanInsightValue(insights.contactEmail)
    if (contactEmail && !contact.email) {
      await prisma.contact.update({ where: { id: contact.id }, data: { email: contactEmail.slice(0, 200) } })
    }

    const summary = cleanInsightValue(insights.summary)
    if (summary && leadId) {
      await logLeadEvent({
        workspaceId, leadId, userId: null, type: 'whatsapp_insight',
        content: `detectó por WhatsApp: ${summary.slice(0, 200)}`,
      })
    }
  } catch (err) {
    console.error('[WhatsApp Bot] Error aplicando insights al lead:', err.message)
  }
}

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
 *
 * La misma llamada a Claude devuelve el texto a mandar Y lo que se detectó
 * de relevante (JSON envelope, un solo call — no duplica costo de tokens por
 * separar "responder" de "extraer datos"). Si el JSON no parsea, se usa el
 * texto crudo como respuesta igual: la extracción de insights nunca debe
 * dejar al cliente sin respuesta.
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

  let replyText, insights = null
  try {
    const msg = await createMessage({
      model: MODEL,
      max_tokens: 700,
      system: (config.prompt?.trim() || DEFAULT_PROMPT) + contextLine + servicesBlock,
      messages: [{
        role: 'user',
        content: `Historial de la conversación de WhatsApp (más reciente al final):\n\n${transcript}\n\nRespondé en JSON válido (sin texto fuera del JSON, sin bloques de código), con exactamente este shape:\n{\n  "reply": "tu respuesta como Asistente al último mensaje del Cliente, lista para mandar tal cual por WhatsApp",\n  "insights": {\n    "industry": "rubro/industria de la empresa si se mencionó en ESTE mensaje, o null",\n    "website": "sitio web si lo mencionó en ESTE mensaje, o null",\n    "contactEmail": "email si lo mencionó en ESTE mensaje, o null",\n    "summary": "una frase breve con lo más relevante que aprendiste en ESTE mensaje sobre el negocio/necesidad/situación del cliente, para que lo vea el equipo comercial, o null si no hay nada nuevo o relevante"\n  }\n}`,
      }],
    }, { workspaceId: account.workspaceId, source: 'whatsapp_bot', enforceBudget: true })
    const text = msg.content.find(b => b.type === 'text')?.text?.trim()
    if (!text) return
    try {
      const raw = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(raw)
      replyText = parsed.reply?.trim()
      insights = parsed.insights || null
    } catch {
      // Haiku no siempre respeta el JSON al 100% — el texto crudo sigue
      // sirviendo como respuesta, solo se pierde la extracción de insights.
      replyText = text
    }
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
      await applyLeadInsights({ insights, contact, leadId: lead.id, workspaceId: account.workspaceId })
    }
  }
}

module.exports = { maybeRespondWithBot, DEFAULT_PROMPT }
