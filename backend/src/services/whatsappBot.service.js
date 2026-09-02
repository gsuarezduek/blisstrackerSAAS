const prisma = require('../lib/prisma')
const { createMessage } = require('../lib/claude')
const { getProvider, decryptAccount } = require('../lib/whatsappProvider')
const { emitTo } = require('../lib/socket')
const { ACTIVE_LEAD_STATUS_KEYS } = require('../lib/salesCatalog')
const { logLeadEvent } = require('../controllers/ventas/_shared')
const { buildKnowledgeBlock } = require('./whatsappBotDocument.service')

const MODEL = 'claude-haiku-4-5-20251001' // costo bajo + rápido, mismo criterio que salesResearch/weeklyReport
const HISTORY_LIMIT = 20 // últimos N mensajes como contexto — alcanza para una charla comercial sin inflar el prompt

const DEFAULT_PROMPT = 'Sos un asistente comercial que responde por WhatsApp en nombre del equipo. Respondé de forma breve, cordial y directa, como en una charla real de WhatsApp (no un email). Si no sabés algo con certeza, decilo en vez de inventar.'
const DEFAULT_HANDOFF_MESSAGE = 'Ya te va a estar contactando alguien de nuestro equipo 👋'

// Instrucción de confianza/escalamiento — SIEMPRE presente (no depende de que el
// admin haya cargado blockedWords/escalationWords). Es lo que evita que el bot
// "invente" cuando no sabe: en vez de una respuesta arriesgada, pide escalate:true
// y un aviso neutro; maybeRespondWithBot hace el resto (handoff + notificación).
const CONFIDENCE_INSTRUCTIONS = 'Si no estás seguro de la respuesta, si te piden algo que no podés resolver vos, o el cliente pide hablar con una persona, respondé con "escalate": true, "escalateReason" con el motivo breve, y un "reply" corto avisando que en un momento lo contacta el equipo — nunca inventes una respuesta de la que no estés seguro.'

// Vacío/"null" en texto (Claude a veces devuelve el string "null" en vez del
// JSON null) → tratarlo como ausente, para no escribir basura en la ficha.
function cleanInsightValue(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (!s || /^(null|n\/a|ninguno|no aplica)$/i.test(s)) return null
  return s
}

/**
 * Busca si `text` contiene alguna de `words` (case-insensitive, substring —
 * simple y predecible, sin límites de palabra: "cancelar" matchea también
 * "cancelaría"). Devuelve la palabra que matcheó (tal cual la cargó el admin,
 * para mostrarla en el motivo) o null. Exportada para tests unitarios.
 */
function findMatch(text, words) {
  if (!text || !Array.isArray(words) || words.length === 0) return null
  const lower = text.toLowerCase()
  for (const w of words) {
    const word = String(w || '').trim().toLowerCase()
    if (word && lower.includes(word)) return w
  }
  return null
}

/** Bloque de reglas obligatorias inyectado en el system prompt — doble capa
 * junto con la verificación programática de `findMatch` en generateBotReply
 * (una instrucción sola no garantiza que el modelo la respete siempre). */
function buildSecurityBlock(blockedWords, escalationWords) {
  const blocked = Array.isArray(blockedWords) ? blockedWords.filter(Boolean) : []
  const escalation = Array.isArray(escalationWords) ? escalationWords.filter(Boolean) : []
  if (blocked.length === 0 && escalation.length === 0) return ''
  const lines = []
  if (blocked.length) lines.push(`- Nunca menciones ni uses estas palabras/frases en tu respuesta: ${blocked.join(', ')}.`)
  if (escalation.length) lines.push(`- Si el cliente menciona algo relacionado con: ${escalation.join(', ')}, no intentes resolverlo vos: respondé con "escalate": true.`)
  return `\n\nReglas obligatorias:\n${lines.join('\n')}`
}

/**
 * Ejemplos few-shot curados por el admin (`WhatsappBotConfig.examples`, array
 * `{question, answer}`) — se inyectan como texto en el system prompt (bloque
 * estático, cacheable), NO como turnos reales de conversación: el modelo
 * espera devolver el JSON envelope completo en cada respuesta, y meterlos como
 * mensajes user/assistant reales rompería ese contrato (el "assistant" de
 * ejemplo no tendría el shape {reply, escalate, ...}). Guían estilo/precisión
 * sin ser una respuesta literal a copiar.
 */
function buildExamplesBlock(examples) {
  const valid = Array.isArray(examples)
    ? examples.filter(e => e?.question?.trim() && e?.answer?.trim())
    : []
  if (valid.length === 0) return ''
  const lines = valid.map(e => `Cliente: ${e.question.trim()}\nVos responderías: ${e.answer.trim()}`).join('\n\n')
  return `\n\nEjemplos de cómo responder (seguí este estilo/tono, no los copies literal si no aplican a la pregunta real):\n${lines}`
}

async function buildServicesBlock(workspaceId) {
  const services = await prisma.service.findMany({
    where: { workspaceId, active: true },
    select: { name: true, description: true },
  })
  return services.length
    ? `\n\nServicios de la agencia:\n${services.map(s => `- ${s.name}${s.description ? `: ${s.description}` : ''}`).join('\n')}`
    : ''
}

function buildTranscript(history) {
  return history
    .map(m => `${m.direction === 'in' ? 'Cliente' : (m.senderType === 'bot' ? 'Asistente' : 'Equipo')}: ${m.content || '[adjunto]'}`)
    .join('\n')
}

const JSON_INSTRUCTIONS = `Respondé en JSON válido (sin texto fuera del JSON, sin bloques de código), con exactamente este shape:
{
  "reply": "tu respuesta como Asistente al último mensaje del Cliente, lista para mandar tal cual por WhatsApp",
  "escalate": true o false — ver instrucciones de confianza y reglas obligatorias más arriba,
  "escalateReason": "motivo breve si escalate es true, o null",
  "insights": {
    "industry": "rubro/industria de la empresa si se mencionó en ESTE mensaje, o null",
    "website": "sitio web si lo mencionó en ESTE mensaje, o null",
    "contactEmail": "email si lo mencionó en ESTE mensaje, o null",
    "summary": "una frase breve con lo más relevante que aprendiste en ESTE mensaje sobre el negocio/necesidad/situación del cliente, para que lo vea el equipo comercial, o null si no hay nada nuevo o relevante"
  }
}`

/** Una llamada a Claude → { replyText, insights, escalate, escalateReason, raw } | null. */
async function callClaude({ workspaceId, system, messages }) {
  try {
    const msg = await createMessage({
      model: MODEL,
      max_tokens: 700,
      system,
      messages,
    }, { workspaceId, source: 'whatsapp_bot', enforceBudget: true })
    const text = msg.content.find(b => b.type === 'text')?.text?.trim()
    if (!text) return null
    const raw = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    try {
      const parsed = JSON.parse(raw)
      return {
        replyText: parsed.reply?.trim() || null,
        insights: parsed.insights || null,
        escalate: Boolean(parsed.escalate),
        escalateReason: parsed.escalateReason || null,
        raw,
      }
    } catch {
      // Haiku no siempre respeta el JSON al 100% — el texto crudo sigue
      // sirviendo como respuesta, solo se pierde escalate/insights de este mensaje.
      return { replyText: text, insights: null, escalate: false, escalateReason: null, raw: text }
    }
  } catch (err) {
    console.error('[WhatsApp Bot] Error generando respuesta con Claude:', err.message)
    return null
  }
}

/**
 * Arma el prompt (system + mensaje con el historial) y llama a Claude,
 * devolviendo `{ replyText, insights, escalate, escalateReason }` — función
 * PURA respecto a WhatsApp/DB de conversación (no manda nada, no persiste
 * nada), reusada tanto por el flujo real (`maybeRespondWithBot`) como por el
 * playground de prueba (`POST /api/whatsapp/bot/test`).
 *
 * Dos capas de seguridad antes de confiar en la respuesta:
 *  1. `escalationWords` del CLIENTE se chequean ANTES de llamar a Claude — si
 *     matchea, ni se gasta el call, handoff directo con el aviso neutro.
 *  2. `blockedWords` en la RESPUESTA generada se chequean después — si
 *     matchea, se reintenta una vez pidiendo reformular; si el reintento
 *     también falla (o la llamada de reintento falla), handoff.
 */
async function generateBotReply({ workspaceId, config, transcript, contact, lastClientMessage }) {
  const escalationMatch = findMatch(lastClientMessage, config.escalationWords)
  if (escalationMatch) {
    return {
      replyText: config.handoffMessage?.trim() || DEFAULT_HANDOFF_MESSAGE,
      insights: null,
      escalate: true,
      escalateReason: `El cliente mencionó "${escalationMatch}"`,
      escalateTrigger: 'escalation_word',
    }
  }

  let contextLine = ''
  if (contact) {
    const company = contact.companyId
      ? await prisma.company.findUnique({ where: { id: contact.companyId }, select: { name: true } })
      : null
    contextLine = `Contexto: estás hablando con ${contact.name}${company?.name ? ` de ${company.name}` : ''}.`
  }

  const servicesBlock = await buildServicesBlock(workspaceId)
  const knowledgeBlock = await buildKnowledgeBlock(workspaceId)
  const securityBlock = buildSecurityBlock(config.blockedWords, config.escalationWords)
  const examplesBlock = buildExamplesBlock(config.examples)
  // Bloque ESTÁTICO (idéntico entre mensajes de cualquier conversación del mismo
  // workspace dentro de la ventana de cache) — cache_control ephemeral evita
  // repagar el precio completo de knowledgeBlock/servicesBlock en cada mensaje
  // entrante. `contextLine` (el contacto puntual) va aparte, sin cache.
  const staticSystem = (config.prompt?.trim() || DEFAULT_PROMPT) + '\n\n' + CONFIDENCE_INSTRUCTIONS + securityBlock + examplesBlock + servicesBlock + knowledgeBlock
  const system = [{ type: 'text', text: staticSystem, cache_control: { type: 'ephemeral' } }]
  if (contextLine) system.push({ type: 'text', text: contextLine })

  const userContent = `Historial de la conversación de WhatsApp (más reciente al final):\n\n${transcript}\n\n${JSON_INSTRUCTIONS}`
  const messages = [{ role: 'user', content: userContent }]

  let result = await callClaude({ workspaceId, system, messages })
  if (!result?.replyText) return result

  const blockedMatch = findMatch(result.replyText, config.blockedWords)
  if (blockedMatch) {
    messages.push({ role: 'assistant', content: result.raw })
    messages.push({ role: 'user', content: `Tu respuesta anterior mencionó "${blockedMatch}", que está prohibida. Reformulá tu respuesta (mismo formato JSON) sin usarla ni sinónimos directos.` })
    const retry = await callClaude({ workspaceId, system, messages })
    if (retry?.replyText && !findMatch(retry.replyText, config.blockedWords)) {
      result = retry
    } else {
      return {
        replyText: config.handoffMessage?.trim() || DEFAULT_HANDOFF_MESSAGE,
        insights: null,
        escalate: true,
        escalateReason: `La respuesta generada mencionaba una palabra prohibida ("${blockedMatch}") incluso después de reintentar`,
        escalateTrigger: 'blocked_word',
      }
    }
  }

  // `result.escalate` acá viene del propio JSON de Claude (baja confianza,
  // ver CONFIDENCE_INSTRUCTIONS) — a diferencia de los dos casos de arriba,
  // que fuerza el código sin pedirle nada al modelo.
  if (result.escalate) result.escalateTrigger = 'confidence'
  return result
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
 * Notifica al responsable que el bot pasó la conversación a un humano (baja
 * confianza o escalationWords) — mismo mecanismo que `notifyLeadOfMessage` en
 * whatsapp.webhook.js (WHATSAPP_MESSAGE, sin actorId porque quien "actuó" es
 * el bot, no un User). Best-effort: nunca debe romper el flujo del bot.
 */
async function notifyEscalation({ workspaceId, contact, conversation, reason }) {
  if (!contact) return
  try {
    const lead = await prisma.lead.findFirst({
      where: { workspaceId, primaryContactId: contact.id, status: { in: ACTIVE_LEAD_STATUS_KEYS } },
      select: { id: true, ownerId: true },
    })
    const targetUserId = conversation.assignedToId || lead?.ownerId
    if (!targetUserId) return
    const contactLabel = contact.name || conversation.phoneE164
    await prisma.notification.create({
      data: {
        userId: targetUserId,
        workspaceId,
        leadId: lead?.id || null,
        type: 'WHATSAPP_MESSAGE',
        message: `El bot pasó a un humano la conversación con ${contactLabel}: ${reason || 'necesita atención'}`,
      },
    })
    emitTo(`user:${targetUserId}`, 'notification:new', { type: 'WHATSAPP_MESSAGE', leadId: lead?.id || null })
  } catch (err) {
    console.error('[WhatsApp Bot] Error notificando escalamiento:', err.message)
  }
}

// true si algún miembro del equipo (senderType:'user', no el bot) ya mandó
// un mensaje en esta conversación — humano intervino, no historial completo.
async function humanAlreadyReplied(conversationId) {
  const count = await prisma.whatsappMessage.count({
    where: { conversationId, senderType: 'user' },
  })
  return count > 0
}

/**
 * Genera y manda la respuesta del bot a un mensaje entrante, si corresponde.
 * Se llama fire-and-forget desde el webhook (setImmediate) — nunca debe romper
 * el procesamiento del mensaje entrante, que ya se guardó antes de esta llamada.
 *
 * Condiciones para responder (todas):
 *  - El workspace tiene WhatsappBotConfig.enabled = true (interruptor maestro).
 *  - La conversación puntual no fue tomada por un humano (botEnabled = true).
 *  - Si WhatsappBotConfig.onlyNewConversations = true, ningún humano del
 *    equipo (senderType:'user') mandó nunca un mensaje en esa conversación —
 *    los mensajes del bot mismo NO cuentan, así puede seguir respondiendo
 *    tantas idas y vueltas como haga falta mientras nadie del equipo
 *    intervino; apenas un humano manda uno, deja de responder ahí para
 *    siempre (se re-evalúa en cada mensaje entrante, no hace falta apagar
 *    botEnabled a mano).
 *  - Hay presupuesto de tokens de IA disponible (createMessage lo valida y
 *    lanza si no — se captura acá, el bot simplemente no responde ese mensaje).
 *
 * Si `generateBotReply` devuelve `escalate:true` (baja confianza del modelo,
 * escalationWords del cliente, o blockedWords persistentes en la respuesta),
 * se manda igual el aviso neutro pero además se apaga `botEnabled` de la
 * conversación (mismo campo que "Tomar el control" manual) y se notifica al
 * responsable — el bot deja de responder ahí hasta que alguien lo reactive.
 */
async function maybeRespondWithBot({ account, conversation, contact }) {
  const config = await prisma.whatsappBotConfig.findUnique({ where: { workspaceId: account.workspaceId } })
  if (!config?.enabled) return

  const fresh = await prisma.whatsappConversation.findUnique({
    where: { id: conversation.id },
    select: { botEnabled: true, phoneE164: true, assignedToId: true },
  })
  if (!fresh?.botEnabled) return

  if (config.onlyNewConversations && await humanAlreadyReplied(conversation.id)) return

  const history = await prisma.whatsappMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { id: 'desc' },
    take: HISTORY_LIMIT,
    select: { direction: true, content: true, senderType: true },
  })
  history.reverse()
  if (history.length === 0) return

  const transcript = buildTranscript(history)
  const lastClientMessage = [...history].reverse().find(m => m.direction === 'in')?.content || ''

  const result = await generateBotReply({ workspaceId: account.workspaceId, config, transcript, contact, lastClientMessage })
  if (!result?.replyText) return

  // Re-chequeo justo antes de mandar (la generación tarda unos segundos) —
  // evita el doble mensaje si un humano respondió o tomó el control mientras
  // se generaba esta respuesta.
  const stillHandled = await prisma.whatsappConversation.findUnique({ where: { id: conversation.id }, select: { botEnabled: true } })
  if (!stillHandled?.botEnabled) return
  if (config.onlyNewConversations && await humanAlreadyReplied(conversation.id)) return

  const provider = getProvider(account.provider)
  const decrypted = decryptAccount(account)
  let waMessageId
  try {
    ;({ waMessageId } = await provider.sendSessionMessage({ account: decrypted, to: fresh.phoneE164, text: result.replyText }))
  } catch (err) {
    // Mismo criterio que sendMessage/sendMedia en whatsapp.controller.js: el
    // mensaje crudo de axios ("Request failed with status code 400") no dice
    // nada — el detalle real que devuelve Chakra es lo único que sirve para
    // diagnosticar sin adivinar.
    const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : err.message
    console.error('[WhatsApp Bot] Error enviando respuesta vía', account.provider, ':', detail, '| texto:', result.replyText)
    return
  }

  const message = await prisma.whatsappMessage.create({
    data: {
      workspaceId: account.workspaceId,
      conversationId: conversation.id,
      direction: 'out',
      content: result.replyText,
      waMessageId: waMessageId || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      senderType: 'bot',
      status: 'sent',
    },
  })

  await prisma.whatsappConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } })
  emitTo(`workspace:${account.workspaceId}`, 'whatsapp:message', { conversationId: conversation.id, message })

  if (result.escalate) {
    await prisma.whatsappConversation.update({ where: { id: conversation.id }, data: { botEnabled: false } })
    await notifyEscalation({ workspaceId: account.workspaceId, contact, conversation: fresh, reason: result.escalateReason })
    // Log independiente de si hay Lead asociado — fuente de verdad del panel
    // de calidad (revisar casos reales de escalamiento, no solo lo que quedó
    // en el timeline de un lead puntual). Best-effort: no debe romper el flujo.
    await prisma.whatsappBotEscalation.create({
      data: {
        workspaceId: account.workspaceId,
        conversationId: conversation.id,
        trigger: result.escalateTrigger || 'confidence',
        reason: result.escalateReason || null,
        clientMessage: lastClientMessage?.slice(0, 2000) || null,
      },
    }).catch(err => console.error('[WhatsApp Bot] Error logueando escalamiento:', err.message))
  }

  if (contact) {
    const lead = await prisma.lead.findFirst({
      where: { workspaceId: account.workspaceId, primaryContactId: contact.id, status: { in: ACTIVE_LEAD_STATUS_KEYS } },
      select: { id: true },
    })
    if (lead) {
      await logLeadEvent({
        workspaceId: account.workspaceId, leadId: lead.id, userId: null, type: 'whatsapp_message',
        content: `el bot respondió por WhatsApp: "${result.replyText.slice(0, 120)}"`,
      })
      if (result.escalate) {
        await logLeadEvent({
          workspaceId: account.workspaceId, leadId: lead.id, userId: null, type: 'whatsapp_insight',
          content: `el bot pasó la conversación a un humano: ${result.escalateReason || 'sin motivo detallado'}`,
        })
      }
      await applyLeadInsights({ insights: result.insights, contact, leadId: lead.id, workspaceId: account.workspaceId })
    }
  }
}

const ESCALATIONS_PAGE_SIZE = 50

/**
 * Panel de calidad: últimos casos donde el bot pasó una conversación a un
 * humano, con datos del contacto para identificar de qué charla se trata sin
 * tener que ir a buscarla. No pagina de verdad (alcanza con "los últimos N"
 * para revisar patrones recientes) — si hiciera falta historial completo más
 * adelante, se le suma cursor/skip.
 */
async function listEscalations(workspaceId) {
  return prisma.whatsappBotEscalation.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: ESCALATIONS_PAGE_SIZE,
    select: {
      id: true, trigger: true, reason: true, clientMessage: true, createdAt: true,
      conversation: { select: { id: true, phoneE164: true, contactName: true, contactId: true } },
    },
  })
}

module.exports = { maybeRespondWithBot, generateBotReply, findMatch, buildTranscript, buildExamplesBlock, listEscalations, DEFAULT_PROMPT, DEFAULT_HANDOFF_MESSAGE }
