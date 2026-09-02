const prisma = require('../lib/prisma')
const { getProvider, decryptAccount } = require('../lib/whatsappProvider')
const { emitTo } = require('../lib/socket')
const { ACTIVE_LEAD_STATUS_KEYS } = require('../lib/salesCatalog')
const { logLeadEvent } = require('../controllers/ventas/_shared')
const { downloadInboundMedia } = require('../services/whatsappMedia.service')
const { maybeRespondWithBot } = require('../services/whatsappBot.service')
const { normalizePhone } = require('../lib/phone')

/**
 * Matchea contra un Contact existente. `Contact.phone` ya se normaliza al
 * guardarse (contacts.controller.js / leads.controller.js, mismo formato
 * "+<dígitos>" que `phoneE164`) — primero se intenta un match EXACTO, rápido
 * e inequívoco cuando el contacto se cargó con código de país. Si no matchea
 * (típicamente porque se tipeó el número sin código de país, algo que no se
 * puede inferir de forma confiable), cae a la heurística de los últimos 8
 * dígitos como red de contención — sigue sin ser 100% preciso, pero cubre el
 * caso común sin arriesgar falsos positivos del match exacto.
 */
async function findMatchingContact(workspaceId, phoneE164) {
  const exact = await prisma.contact.findFirst({ where: { workspaceId, phone: phoneE164 } })
  if (exact) return exact

  const last8 = phoneE164.replace(/\D/g, '').slice(-8)
  if (!last8) return null
  return prisma.contact.findFirst({ where: { workspaceId, phone: { contains: last8 } } })
}

async function handleInboundMessage(account, event) {
  if (!event.waMessageId || !event.from) return

  const isReaction = event.type === 'reaction'
  // Sacar una reacción que había puesto (emoji vacío) no tiene nada que
  // mostrar — se ignora en silencio, no genera fila ni notificación.
  if (isReaction && !event.reactionEmoji) return

  // Dedup: Meta/Chakra reintentan el webhook agresivamente si no hay 200 rápido.
  const existing = await prisma.whatsappMessage.findUnique({ where: { waMessageId: event.waMessageId } })
  if (existing) return

  const phoneE164 = normalizePhone(event.from)
  if (!phoneE164) return

  const contact = await findMatchingContact(account.workspaceId, phoneE164)
  const now = new Date()

  const conversation = await prisma.whatsappConversation.upsert({
    where: { workspaceId_phoneE164: { workspaceId: account.workspaceId, phoneE164 } },
    update: {
      lastMessageAt: now,
      lastInboundAt: now,
      ...(contact ? { contactId: contact.id } : {}),
      ...(event.contactName ? { contactName: event.contactName } : {}),
    },
    create: {
      workspaceId: account.workspaceId,
      accountId: account.id,
      phoneE164,
      contactName: event.contactName || null,
      contactId: contact?.id ?? null,
      lastMessageAt: now,
      lastInboundAt: now,
    },
  })

  // A qué mensaje nuestro reaccionó, si lo tenemos guardado (puede no
  // resolver si quedó fuera de nuestro historial) — solo aplica a reacciones.
  const reactionTarget = isReaction && event.reactionToWaMessageId
    ? await prisma.whatsappMessage.findFirst({
        where: { waMessageId: event.reactionToWaMessageId, workspaceId: account.workspaceId },
        select: { id: true },
      })
    : null

  const message = await prisma.whatsappMessage.create({
    data: {
      workspaceId: account.workspaceId,
      conversationId: conversation.id,
      direction: 'in',
      // Para media, `text` viene null y el caption (si vino) es lo que se
      // muestra como contenido del mensaje — mismo campo que un texto plano.
      // Para una reacción, content queda null (no es texto real, ver campos
      // reactionEmoji/reactionToId más abajo).
      content: isReaction ? null : (event.mediaId ? (event.mediaCaption || null) : event.text),
      waMessageId: event.waMessageId,
      senderType: 'contact',
      status: 'delivered',
      ...(isReaction ? { reactionEmoji: event.reactionEmoji, reactionToId: reactionTarget?.id ?? null } : {}),
    },
    include: { media: true, reactionTo: { select: { id: true, content: true, direction: true } } },
  })

  // Adjunto (Fase 3 del plan) — best-effort: si falla la descarga, el mensaje
  // ya está guardado (con su caption si tenía), solo queda sin el archivo.
  // No aplica a reacciones (nunca traen mediaId).
  if (!isReaction && event.mediaId) {
    const media = await downloadInboundMedia({
      account, mediaId: event.mediaId, kind: event.type, mimeType: event.mediaMimeType,
    })
    if (media) {
      await prisma.whatsappMedia.create({
        data: {
          workspaceId: account.workspaceId,
          messageId: message.id,
          fileName: event.mediaFileName || null,
          ...media,
        },
      })
    }
  }

  const fullMessage = !isReaction && event.mediaId
    ? await prisma.whatsappMessage.findUnique({
        where: { id: message.id },
        include: { media: true, reactionTo: { select: { id: true, content: true, direction: true } } },
      })
    : message

  emitTo(`workspace:${account.workspaceId}`, 'whatsapp:message', { conversationId: conversation.id, message: fullMessage })

  if (contact) await notifyLeadOfMessage({ workspaceId: account.workspaceId, contact, conversation, event })

  // Bot (Fase 4 del plan) — una reacción no es una consulta que responder
  // (generaría respuestas raras tipo "¡gracias por tu 👍!" sin que el
  // cliente haya pedido nada), así que no dispara al bot. Fire-and-forget: la
  // llamada a Claude tarda segundos y no debe demorar el 200 al webhook
  // (Meta/Chakra reintenta agresivamente si tarda). maybeRespondWithBot ya
  // maneja sus propios errores.
  if (!isReaction) {
    setImmediate(() => {
      maybeRespondWithBot({ account, conversation, contact }).catch(err => {
        console.error('[WhatsApp Bot] Error inesperado:', err.message)
      })
    })
  }
}

/**
 * Si el contacto que escribió es el principal de un lead activo: deja una
 * entrada liviana en su timeline (LeadActivity — el timeline apunta, el panel
 * de WhatsApp del lead muestra el contenido completo) y avisa al responsable
 * (conversation.assignedToId, o el ownerId del lead si nadie reasignó la
 * conversación puntual — Fase 2 del plan). Como un contacto es principal de a
 * lo sumo 1 lead activo (ver assertContactAvailable en
 * controllers/ventas/_shared.js), la búsqueda no es ambigua. Best-effort:
 * nunca debe romper el procesamiento del mensaje entrante.
 */
async function notifyLeadOfMessage({ workspaceId, contact, conversation, event }) {
  try {
    const lead = await prisma.lead.findFirst({
      where: { workspaceId, primaryContactId: contact.id, status: { in: ACTIVE_LEAD_STATUS_KEYS } },
      select: { id: true, ownerId: true },
    })
    if (!lead) return

    const contactLabel = contact.name || event.contactName || conversation.phoneE164
    const isReaction = event.type === 'reaction'
    const logContent = isReaction
      ? `registró una reacción de ${contactLabel} por WhatsApp: ${event.reactionEmoji}`
      : `registró un mensaje de WhatsApp de ${contactLabel}: "${(event.text || '[mensaje]').slice(0, 120)}"`

    // userId: null → el timeline lo muestra con prefijo "Sistema" (nadie del
    // equipo actuó acá), por eso el texto sigue en minúscula como el resto de
    // los eventos ("Sistema registró...", igual que "Fulano creó el lead").
    await logLeadEvent({
      workspaceId, leadId: lead.id, userId: null, type: 'whatsapp_message',
      content: logContent,
    })

    const targetUserId = conversation.assignedToId || lead.ownerId
    if (!targetUserId) return
    // Sin actorId: quien escribió es el contacto (no un User) — mismo criterio
    // que CONTENT_APPROVED, mensaje autocontenido con el nombre incluido.
    const notifMessage = isReaction
      ? `${contactLabel} reaccionó con ${event.reactionEmoji} a tu mensaje por WhatsApp`
      : `${contactLabel} te escribió por WhatsApp: "${(event.text || '[mensaje]').slice(0, 120)}"`
    await prisma.notification.create({
      data: {
        userId: targetUserId,
        workspaceId,
        leadId: lead.id,
        type: 'WHATSAPP_MESSAGE',
        message: notifMessage,
      },
    })
    emitTo(`user:${targetUserId}`, 'notification:new', { type: 'WHATSAPP_MESSAGE', leadId: lead.id })
  } catch (err) {
    console.error('[WhatsApp Webhook] Error notificando al lead:', err.message)
  }
}

/**
 * Coexistence: alguien del equipo mandó un mensaje a mano desde la app de
 * WhatsApp Business (o WhatsApp Web) del número conectado, no vía BlissTracker
 * — sin esto, ese mensaje nunca llegaba al webhook y no aparecía acá (ver
 * smb_message_echoes en chakra.js). A diferencia de un mensaje entrante,
 * `event.to` es el CONTACTO (el negocio es quien manda). No dispara
 * notifyLeadOfMessage (nadie del equipo necesita que le avisen de algo que el
 * propio equipo mandó) ni al bot (no es un mensaje que requiera respuesta).
 */
async function handleOutboundEcho(account, event) {
  if (!event.waMessageId || !event.to) return
  // "revoke"/"edit" (el remitente borró o editó un mensaje ya ecoado) — no
  // soportado en v1, se ignora en silencio; el mensaje original queda como está.
  if (event.type === 'revoke' || event.type === 'edit') return

  const isReaction = event.type === 'reaction'
  // Sacar una reacción que había puesto (emoji vacío) no tiene nada que
  // mostrar — se ignora en silencio, igual que en handleInboundMessage.
  if (isReaction && !event.reactionEmoji) return

  const existing = await prisma.whatsappMessage.findUnique({ where: { waMessageId: event.waMessageId } })
  if (existing) return

  const phoneE164 = normalizePhone(event.to)
  if (!phoneE164) return

  const contact = await findMatchingContact(account.workspaceId, phoneE164)
  const now = new Date()

  const conversation = await prisma.whatsappConversation.upsert({
    where: { workspaceId_phoneE164: { workspaceId: account.workspaceId, phoneE164 } },
    update: {
      lastMessageAt: now,
      ...(contact ? { contactId: contact.id } : {}),
    },
    create: {
      workspaceId: account.workspaceId,
      accountId: account.id,
      phoneE164,
      contactId: contact?.id ?? null,
      lastMessageAt: now,
    },
  })

  // Alguien del equipo reaccionó, desde la app nativa, a un mensaje ENTRANTE
  // del cliente — a diferencia de handleInboundMessage, acá el mensaje
  // reaccionado suele ser `direction: 'in'`, pero se busca sin filtrar por
  // dirección: también puede reaccionar a algo que mandamos nosotros.
  const reactionTarget = isReaction && event.reactionToWaMessageId
    ? await prisma.whatsappMessage.findFirst({
        where: { waMessageId: event.reactionToWaMessageId, workspaceId: account.workspaceId },
        select: { id: true },
      })
    : null

  const message = await prisma.whatsappMessage.create({
    data: {
      workspaceId: account.workspaceId,
      conversationId: conversation.id,
      direction: 'out',
      content: isReaction ? null : (event.mediaId ? (event.mediaCaption || null) : event.text),
      waMessageId: event.waMessageId,
      senderType: 'app_echo', // ninguno de nuestros usuarios — Meta no dice qué persona lo mandó desde la app
      status: 'sent',
      ...(isReaction ? { reactionEmoji: event.reactionEmoji, reactionToId: reactionTarget?.id ?? null } : {}),
    },
    include: { media: true, reactionTo: { select: { id: true, content: true, direction: true } } },
  })

  // Mismo mecanismo de descarga que un adjunto entrante (downloadInboundMedia
  // solo baja bytes por mediaId contra la API de Meta — el nombre es histórico,
  // funciona igual sin importar la dirección del mensaje). No aplica a
  // reacciones (nunca traen mediaId).
  if (!isReaction && event.mediaId) {
    const media = await downloadInboundMedia({
      account, mediaId: event.mediaId, kind: event.type, mimeType: event.mediaMimeType,
    })
    if (media) {
      await prisma.whatsappMedia.create({
        data: {
          workspaceId: account.workspaceId,
          messageId: message.id,
          fileName: event.mediaFileName || null,
          ...media,
        },
      })
    }
  }

  const fullMessage = !isReaction && event.mediaId
    ? await prisma.whatsappMessage.findUnique({
        where: { id: message.id },
        include: { media: true, reactionTo: { select: { id: true, content: true, direction: true } } },
      })
    : message

  emitTo(`workspace:${account.workspaceId}`, 'whatsapp:message', { conversationId: conversation.id, message: fullMessage })
}

async function handleStatusUpdate(account, event) {
  if (!event.waMessageId || !event.status) return
  const STATUS_MAP = { delivered: 'delivered', read: 'read', failed: 'failed' }
  const status = STATUS_MAP[event.status]
  if (!status) return

  const updated = await prisma.whatsappMessage.updateMany({
    where: { waMessageId: event.waMessageId, workspaceId: account.workspaceId },
    data: { status },
  })
  if (updated.count) {
    emitTo(`workspace:${account.workspaceId}`, 'whatsapp:status', { waMessageId: event.waMessageId, status })
  }
}

/**
 * POST /api/whatsapp/webhook/chakra
 * Recibe eventos de Chakra. Requiere cuerpo RAW (no JSON parseado) para poder
 * verificar la firma — montado en app.js ANTES de express.json(), mismo
 * patrón que el webhook de Stripe.
 *
 * Solo hay un adaptador hoy (chakra) — si se suma otro BSP más adelante, cada
 * uno tiene su propia ruta/verificación de firma (no hay forma genérica de
 * "adivinar" el proveedor a partir del payload crudo antes de parsearlo).
 */
async function handleChakraWebhook(req, res) {
  let payload
  try {
    payload = JSON.parse(req.body.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'JSON inválido' })
  }

  try {
    const chakra = getProvider('chakra')
    const event = chakra.parseInboundEvent(payload)
    if (!event) {
      // Diagnóstico temporal: el shape exacto del payload de Chakra no está 100%
      // confirmado contra una cuenta real (ver chakra.js) — loguear el payload
      // crudo acá es la forma más rápida de confirmarlo/corregirlo contra datos
      // reales en vez de seguir adivinando contra documentación parcial.
      console.warn('[WhatsApp Webhook] Evento no reconocido, payload crudo:', JSON.stringify(payload).slice(0, 2000))
      return res.json({ received: true })
    }

    // wabaId sale del evento ya parseado (soporta tanto el pass-through crudo
    // de Meta como el formato propio de Chakra, ver chakra.js) — el webhook
    // llega sin ningún contexto de sesión, no hay JWT ni header de workspace.
    const wabaId = event.wabaId
    const account = wabaId ? await prisma.whatsappAccount.findUnique({ where: { wabaId } }) : null
    if (!account) {
      console.warn('[WhatsApp Webhook] wabaId sin cuenta asociada:', wabaId)
      return res.json({ received: true }) // 200 igual — reintentar no va a resolver una cuenta que no existe
    }

    // Confirmado contra un webhook real el 2026-08-23 (modo pass-through, el
    // que usa esta cuenta): X-Chakra-Signature-256 con la "HMAC Verification
    // Secret" matchea igual que en el formato propio de Chakra — no hacía
    // falta un esquema distinto. A partir de acá se rechaza en firme si no
    // coincide (antes solo se logueaba, en modo diagnóstico, mientras no
    // había evidencia real contra la que confirmar). Si la cuenta nunca
    // configuró un Webhook Secret (campo opcional al conectar), no hay nada
    // contra qué verificar — se sigue procesando igual que antes para no
    // romper integraciones que jamás lo cargaron.
    const decrypted = decryptAccount(account)
    const sig = req.headers['x-chakra-signature-256']
    if (decrypted.webhookSecret) {
      const sigValid = chakra.verifyWebhookSignature(req.body.toString('utf8'), sig, decrypted.webhookSecret)
      if (!sigValid) {
        console.warn('[WhatsApp Webhook] Firma inválida — evento rechazado. Header recibido:', sig || '(ninguno)')
        return res.status(401).json({ error: 'Firma inválida' })
      }
    } else {
      console.warn('[WhatsApp Webhook] Cuenta sin Webhook Secret configurado — no se puede verificar la firma del evento entrante.')
    }

    if (event.kind === 'message') {
      await handleInboundMessage(account, event)
    } else if (event.kind === 'status') {
      await handleStatusUpdate(account, event)
    } else if (event.kind === 'message_echo') {
      await handleOutboundEcho(account, event)
    }

    res.json({ received: true })
  } catch (err) {
    console.error('[WhatsApp Webhook] Error procesando evento:', err)
    res.json({ received: true }) // siempre 200 — evita reintentos agresivos del BSP
  }
}

module.exports = { handleChakraWebhook }
