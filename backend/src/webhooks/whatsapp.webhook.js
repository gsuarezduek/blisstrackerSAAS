const prisma = require('../lib/prisma')
const { getProvider, decryptAccount } = require('../lib/whatsappProvider')
const { emitTo } = require('../lib/socket')

// WhatsApp entrega el "from" en dígitos (con o sin "+"). Normalizamos a un
// único formato ("+<dígitos>") para que WhatsappConversation.phoneE164 sea
// consistente de acá en adelante. Heurística simple — no valida longitud por
// país; alcanza para deduplicar conversaciones del mismo remitente.
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits ? `+${digits}` : null
}

/**
 * Best-effort: matchea contra un Contact existente por los últimos 8 dígitos
 * del teléfono. Contact.phone no está normalizado hoy (formato libre) — ver
 * Fase 1 del plan de WhatsApp, nota "Abierto: normalización de teléfono".
 * Heurística de transición, no la solución definitiva.
 */
async function findMatchingContact(workspaceId, phoneE164) {
  const last8 = phoneE164.replace(/\D/g, '').slice(-8)
  if (!last8) return null
  return prisma.contact.findFirst({ where: { workspaceId, phone: { contains: last8 } } })
}

async function handleInboundMessage(account, event) {
  if (!event.waMessageId || !event.from) return

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

  const message = await prisma.whatsappMessage.create({
    data: {
      workspaceId: account.workspaceId,
      conversationId: conversation.id,
      direction: 'in',
      content: event.text,
      waMessageId: event.waMessageId,
      senderType: 'contact',
      status: 'delivered',
    },
  })

  emitTo(`workspace:${account.workspaceId}`, 'whatsapp:message', { conversationId: conversation.id, message })
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

    // wabaId es lo único que identifica el workspace en el payload confirmado
    // (ver chakra.js parseInboundEvent) — el webhook llega sin ningún contexto
    // de sesión, no hay JWT ni header de workspace.
    const wabaId = payload?.payload?.wabaId
    const account = wabaId ? await prisma.whatsappAccount.findUnique({ where: { wabaId } }) : null
    if (!account) {
      console.warn('[WhatsApp Webhook] wabaId sin cuenta asociada:', wabaId)
      return res.json({ received: true }) // 200 igual — reintentar no va a resolver una cuenta que no existe
    }

    const decrypted = decryptAccount(account)
    const sig = req.headers['x-chakra-signature-256']
    if (!chakra.verifyWebhookSignature(req.body.toString('utf8'), sig, decrypted.webhookSecret)) {
      console.warn('[WhatsApp Webhook] Firma inválida para cuenta', account.id)
      return res.status(401).json({ error: 'Firma inválida' })
    }

    if (event.kind === 'message') {
      await handleInboundMessage(account, event)
    } else if (event.kind === 'status') {
      await handleStatusUpdate(account, event)
    }

    res.json({ received: true })
  } catch (err) {
    console.error('[WhatsApp Webhook] Error procesando evento:', err)
    res.json({ received: true }) // siempre 200 — evita reintentos agresivos del BSP
  }
}

module.exports = { handleChakraWebhook }
