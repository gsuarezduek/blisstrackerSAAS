const prisma = require('../lib/prisma')
const { encrypt } = require('../lib/encryption')
const { getProvider, decryptAccount } = require('../lib/whatsappProvider')
const { emitTo } = require('../lib/socket')

const MESSAGE_PAGE_SIZE = 50
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

function publicAccount(account) {
  if (!account) return null
  // Nunca devolver accessToken/webhookSecret al frontend — mismo criterio que
  // ProjectIntegration (nunca expone el token, solo estado/metadata).
  const { accessToken, webhookSecret, ...rest } = account
  return { ...rest, hasAccessToken: Boolean(accessToken), hasWebhookSecret: Boolean(webhookSecret) }
}

/**
 * POST /api/whatsapp/account
 * Conecta el número de WhatsApp del workspace pegando las credenciales
 * obtenidas del dashboard del BSP (hoy: Chakra) — mismo patrón que el "Token
 * de Business Manager" ya usado para Meta Ads/Instagram/Facebook, no un
 * redirect OAuth, porque el embedded signup multi-tenant de Chakra no está
 * confirmado (ver Fase 1 del plan de WhatsApp).
 */
async function connectAccount(req, res, next) {
  try {
    const { wabaId, phoneNumberId, displayPhoneNumber, pluginId, accessToken, webhookSecret } = req.body
    if (!phoneNumberId || !accessToken) {
      return res.status(400).json({ error: 'phoneNumberId y accessToken son obligatorios' })
    }

    const account = await prisma.whatsappAccount.upsert({
      where: { workspaceId_phoneNumberId: { workspaceId: req.workspace.id, phoneNumberId } },
      update: {
        wabaId: wabaId || null,
        displayPhoneNumber: displayPhoneNumber || null,
        pluginId: pluginId || null,
        accessToken: encrypt(accessToken),
        webhookSecret: webhookSecret ? encrypt(webhookSecret) : null,
        status: 'active',
        connectedById: req.user.userId,
        connectedAt: new Date(),
      },
      create: {
        workspaceId: req.workspace.id,
        wabaId: wabaId || null,
        phoneNumberId,
        displayPhoneNumber: displayPhoneNumber || null,
        pluginId: pluginId || null,
        accessToken: encrypt(accessToken),
        webhookSecret: webhookSecret ? encrypt(webhookSecret) : null,
        connectedById: req.user.userId,
      },
    })

    res.status(201).json(publicAccount(account))
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ese wabaId ya está conectado en otro workspace' })
    }
    next(err)
  }
}

/** GET /api/whatsapp/account */
async function getAccount(req, res, next) {
  try {
    const account = await prisma.whatsappAccount.findFirst({ where: { workspaceId: req.workspace.id } })
    res.json(publicAccount(account))
  } catch (err) { next(err) }
}

/** DELETE /api/whatsapp/account */
async function disconnectAccount(req, res, next) {
  try {
    const account = await prisma.whatsappAccount.findFirst({ where: { workspaceId: req.workspace.id } })
    if (!account) return res.status(404).json({ error: 'No hay ninguna cuenta conectada' })
    await prisma.whatsappAccount.delete({ where: { id: account.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * GET /api/whatsapp/conversations
 * Lista conversaciones del workspace, más reciente primero, con el último
 * mensaje y no-leídos por usuario (mismo cálculo que listChannels del chat
 * interno: solo cuenta si hay mensajes más nuevos que el último leído).
 */
async function listConversations(req, res, next) {
  try {
    const conversations = await prisma.whatsappConversation.findMany({
      where: { workspaceId: req.workspace.id },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        contact: { select: { id: true, name: true, companyId: true } },
        messages: { orderBy: { id: 'desc' }, take: 1 },
        reads: { where: { userId: req.user.userId }, take: 1 },
      },
    })

    const result = conversations.map((c) => {
      const lastMessage = c.messages[0] ?? null
      const lastRead = c.reads[0]?.lastReadMessageId ?? 0
      return {
        id: c.id,
        phoneE164: c.phoneE164,
        contactName: c.contactName,
        contact: c.contact,
        lastMessageAt: c.lastMessageAt,
        lastInboundAt: c.lastInboundAt,
        lastMessage: lastMessage ? { content: lastMessage.content, direction: lastMessage.direction, createdAt: lastMessage.createdAt } : null,
        unread: Boolean(lastMessage && lastMessage.id > lastRead),
      }
    })

    res.json(result)
  } catch (err) { next(err) }
}

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

/**
 * GET /api/whatsapp/conversations/:id/messages
 * Paginación por cursor, mismo patrón que listMessages del chat interno
 * (chat.controller.js): `before` = id del mensaje más viejo ya cargado.
 */
async function getMessages(req, res, next) {
  try {
    const conversation = await assertConversation(req)
    const limit = Math.min(Number(req.query.limit) || MESSAGE_PAGE_SIZE, 100)
    const before = req.query.before ? Number(req.query.before) : null

    const messages = await prisma.whatsappMessage.findMany({
      where: { conversationId: conversation.id, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: 'desc' },
      take: limit,
      include: { senderUser: { select: { id: true, name: true, avatar: true } } },
    })
    messages.reverse()

    res.json({ conversation, messages, hasMore: messages.length === limit })
  } catch (err) { next(err) }
}

/**
 * POST /api/whatsapp/conversations/:id/messages
 * Guardrail mínimo de la ventana de 24hs (plantillas completas = Fase 5 del
 * plan): sin mensaje entrante reciente, WhatsApp rechaza el texto libre.
 */
async function sendMessage(req, res, next) {
  try {
    const { content } = req.body
    if (!content?.trim()) return res.status(400).json({ error: 'content es obligatorio' })

    const conversation = await assertConversation(req)
    if (!conversation.lastInboundAt || Date.now() - conversation.lastInboundAt.getTime() > SESSION_WINDOW_MS) {
      return res.status(400).json({
        error: 'Pasaron más de 24hs desde el último mensaje del contacto — hace falta una plantilla aprobada para reabrir la conversación.',
        code: 'SESSION_WINDOW_EXPIRED',
      })
    }

    const account = await prisma.whatsappAccount.findFirst({ where: { workspaceId: req.workspace.id } })
    if (!account) return res.status(400).json({ error: 'No hay ninguna cuenta de WhatsApp conectada', code: 'WHATSAPP_NOT_CONNECTED' })

    const provider = getProvider(account.provider)
    const decrypted = decryptAccount(account)
    const { waMessageId } = await provider.sendSessionMessage({ account: decrypted, to: conversation.phoneE164, text: content.trim() })

    const message = await prisma.whatsappMessage.create({
      data: {
        workspaceId: req.workspace.id,
        conversationId: conversation.id,
        direction: 'out',
        content: content.trim(),
        waMessageId: waMessageId || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        senderType: 'user',
        senderUserId: req.user.userId,
        status: 'sent',
      },
      include: { senderUser: { select: { id: true, name: true, avatar: true } } },
    })

    await prisma.whatsappConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } })
    await prisma.whatsappConversationRead.upsert({
      where: { conversationId_userId: { conversationId: conversation.id, userId: req.user.userId } },
      update: { lastReadMessageId: message.id, lastReadAt: new Date() },
      create: { workspaceId: req.workspace.id, conversationId: conversation.id, userId: req.user.userId, lastReadMessageId: message.id },
    })

    emitTo(`workspace:${req.workspace.id}`, 'whatsapp:message', { conversationId: conversation.id, message })
    res.status(201).json(message)
  } catch (err) { next(err) }
}

/** POST /api/whatsapp/conversations/:id/read */
async function markRead(req, res, next) {
  try {
    const conversation = await assertConversation(req)
    const last = await prisma.whatsappMessage.findFirst({ where: { conversationId: conversation.id }, orderBy: { id: 'desc' } })

    await prisma.whatsappConversationRead.upsert({
      where: { conversationId_userId: { conversationId: conversation.id, userId: req.user.userId } },
      update: { lastReadMessageId: last?.id ?? null, lastReadAt: new Date() },
      create: { workspaceId: req.workspace.id, conversationId: conversation.id, userId: req.user.userId, lastReadMessageId: last?.id ?? null },
    })

    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { connectAccount, getAccount, disconnectAccount, listConversations, getMessages, sendMessage, markRead }
