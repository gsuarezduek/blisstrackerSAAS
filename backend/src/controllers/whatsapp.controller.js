const prisma = require('../lib/prisma')
const { encrypt } = require('../lib/encryption')
const { getProvider, decryptAccount } = require('../lib/whatsappProvider')
const { emitTo } = require('../lib/socket')
const { assertActiveMember } = require('../lib/assertActiveMember')
const { ACTIVE_LEAD_STATUS_KEYS } = require('../lib/salesCatalog')
const { logLeadEvent } = require('./ventas/_shared')
const objectStorage = require('../services/objectStorage.service')
const { validateImageUpload } = require('../lib/imageType')
const { validateMediaHeader } = require('../lib/mediaType')
const { DEFAULT_PROMPT } = require('../services/whatsappBot.service')

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
    const { id, wabaId, phoneNumberId, displayPhoneNumber, pluginId, accessToken, webhookSecret } = req.body
    // pluginId es obligatorio para poder enviar mensajes: el endpoint de envío
    // de Chakra lo requiere como parte de la URL (ver lib/whatsappProvider/chakra.js
    // messagesUrl), confirmado contra su documentación real — sin esto se puede
    // conectar y recibir, pero no responder.
    if (!phoneNumberId || !pluginId) {
      return res.status(400).json({ error: 'phoneNumberId y pluginId son obligatorios' })
    }

    // Editar (viene `id`) identifica la fila por su PK, no por phoneNumberId —
    // así se puede corregir un phoneNumberId cargado mal (ej. el número en
    // formato legible en vez del ID técnico) sin crear una fila duplicada.
    // Conectar por primera vez sigue buscando por phoneNumberId (evita
    // duplicar si se reenvía el mismo alta dos veces).
    const existing = id
      ? await prisma.whatsappAccount.findFirst({ where: { id: Number(id), workspaceId: req.workspace.id } })
      : await prisma.whatsappAccount.findUnique({
          where: { workspaceId_phoneNumberId: { workspaceId: req.workspace.id, phoneNumberId } },
        })
    if (id && !existing) return res.status(404).json({ error: 'Cuenta no encontrada' })
    // accessToken solo es obligatorio para conectar por primera vez — al editar
    // una cuenta ya conectada dejarlo vacío conserva el token cifrado que ya
    // había, no lo pisa con vacío.
    if (!existing && !accessToken) {
      return res.status(400).json({ error: 'accessToken es obligatorio para conectar por primera vez' })
    }

    const baseData = {
      wabaId: wabaId || null,
      phoneNumberId,
      displayPhoneNumber: displayPhoneNumber || null,
      pluginId,
      status: 'active',
      connectedById: req.user.userId,
      connectedAt: new Date(),
    }

    const account = existing
      ? await prisma.whatsappAccount.update({
          where: { id: existing.id },
          data: {
            ...baseData,
            ...(accessToken ? { accessToken: encrypt(accessToken) } : {}),
            ...(webhookSecret ? { webhookSecret: encrypt(webhookSecret) } : {}),
          },
        })
      : await prisma.whatsappAccount.create({
          data: {
            workspaceId: req.workspace.id,
            ...baseData,
            accessToken: encrypt(accessToken),
            webhookSecret: webhookSecret ? encrypt(webhookSecret) : null,
          },
        })

    res.status(201).json(publicAccount(account))
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ese wabaId o phoneNumberId ya está conectado en otro workspace' })
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
 * Resuelve, para un set de contactos, el lead "más relevante" al que abrir
 * desde la conversación de WhatsApp — mismo criterio que attachWhatsappStatus
 * en ventas/_shared.js pero en la dirección inversa (contacto → lead). Por la
 * regla de negocio "1 lead activo por contacto" (assertContactAvailable) a lo
 * sumo hay un lead activo por contacto; si no hay ninguno activo, cae al más
 * reciente (útil para leads ya Ganados/Perdidos, que siguen queriendo verse).
 */
async function resolveLeadByContact(workspaceId, contactIds) {
  const map = new Map()
  if (contactIds.length === 0) return map
  const leads = await prisma.lead.findMany({
    where: { workspaceId, primaryContactId: { in: contactIds } },
    select: { id: true, primaryContactId: true, status: true, archived: true },
    orderBy: { createdAt: 'desc' },
  })
  for (const l of leads) {
    const existing = map.get(l.primaryContactId)
    const isActive = ACTIVE_LEAD_STATUS_KEYS.includes(l.status) && !l.archived
    if (!existing || (isActive && !existing.active)) {
      map.set(l.primaryContactId, { id: l.id, active: isActive })
    }
  }
  return map
}

/**
 * GET /api/whatsapp/conversations
 * Lista conversaciones del workspace, más reciente primero, con el último
 * mensaje y no-leídos por usuario (mismo cálculo que listChannels del chat
 * interno: solo cuenta si hay mensajes más nuevos que el último leído).
 * Suma el nombre de la empresa del contacto vinculado y el `leadId` al que
 * saltar (si existe) — así la vista de WhatsApp puede mostrar "de qué
 * empresa/oportunidad es" y abrir el lead con un clic.
 */
async function listConversations(req, res, next) {
  try {
    const conversations = await prisma.whatsappConversation.findMany({
      where: { workspaceId: req.workspace.id },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        contact: { select: { id: true, name: true, companyId: true, company: { select: { name: true } } } },
        messages: { orderBy: { id: 'desc' }, take: 1, include: { media: { select: { kind: true } } } },
        reads: { where: { userId: req.user.userId }, take: 1 },
      },
    })

    const contactIds = [...new Set(conversations.map(c => c.contactId).filter(Boolean))]
    const leadByContact = await resolveLeadByContact(req.workspace.id, contactIds)

    const result = conversations.map((c) => {
      const lastMessage = c.messages[0] ?? null
      const lastRead = c.reads[0]?.lastReadMessageId ?? 0
      return {
        id: c.id,
        phoneE164: c.phoneE164,
        contactName: c.contactName,
        contact: c.contact,
        leadId: (c.contactId && leadByContact.get(c.contactId)?.id) || null,
        lastMessageAt: c.lastMessageAt,
        lastInboundAt: c.lastInboundAt,
        lastMessage: lastMessage
          ? { content: lastMessage.content, direction: lastMessage.direction, createdAt: lastMessage.createdAt, mediaKind: lastMessage.media?.kind || null }
          : null,
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
      include: { senderUser: { select: { id: true, name: true, avatar: true } }, media: true },
    })
    messages.reverse()

    // Mismo enriquecimiento que listConversations (empresa + lead al que
    // saltar) — acá para el header de la conversación abierta, no solo la lista.
    let contact = null, leadId = null
    if (conversation.contactId) {
      contact = await prisma.contact.findFirst({
        where: { id: conversation.contactId },
        select: { id: true, name: true, companyId: true, company: { select: { name: true } } },
      })
      const leadByContact = await resolveLeadByContact(req.workspace.id, [conversation.contactId])
      leadId = leadByContact.get(conversation.contactId)?.id || null
    }

    res.json({ conversation: { ...conversation, contact, leadId }, messages, hasMore: messages.length === limit })
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
    if (!account.pluginId) {
      return res.status(400).json({ error: 'A la cuenta le falta el Plugin ID — completalo desde "Editar" antes de responder.', code: 'WHATSAPP_MISSING_PLUGIN_ID' })
    }

    const provider = getProvider(account.provider)
    const decrypted = decryptAccount(account)
    let waMessageId
    try {
      ;({ waMessageId } = await provider.sendSessionMessage({ account: decrypted, to: conversation.phoneE164, text: content.trim() }))
    } catch (err) {
      // El error crudo de axios ("Request failed with status code 404") no le
      // dice nada al usuario — exponemos el detalle real que devuelve Chakra
      // (si vino) para poder diagnosticar sin tener que ir a los logs.
      const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 300) : err.message
      console.error('[WhatsApp] Error enviando mensaje vía', account.provider, ':', detail)
      return res.status(502).json({ error: `No se pudo enviar el mensaje por WhatsApp: ${detail}`, code: 'WHATSAPP_SEND_FAILED' })
    }

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

    // Entrada liviana en el timeline del lead (best-effort, ver notifyLeadOfMessage
    // en whatsapp.webhook.js — misma idea, dirección "out").
    if (conversation.contactId) {
      const lead = await prisma.lead.findFirst({
        where: { workspaceId: req.workspace.id, primaryContactId: conversation.contactId, status: { in: ACTIVE_LEAD_STATUS_KEYS } },
        select: { id: true },
      })
      if (lead) {
        await logLeadEvent({
          workspaceId: req.workspace.id, leadId: lead.id, userId: req.user.userId, type: 'whatsapp_message',
          content: `respondió por WhatsApp: "${content.trim().slice(0, 120)}"`,
        })
      }
    }

    res.status(201).json(message)
  } catch (err) { next(err) }
}

function resolveMediaKind(mimetype) {
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype.startsWith('audio/')) return 'audio'
  if (mimetype.startsWith('video/')) return 'video'
  return 'document' // WhatsApp acepta bastante variedad de documentos (pdf, doc, xls, etc.)
}

/**
 * POST /api/whatsapp/conversations/:id/media — multipart, campo `file` +
 * `caption?` opcional (Fase 3 del plan). Sube el archivo a Meta vía el
 * provider (para poder referenciarlo en el mensaje) Y a R2/DB (nuestra propia
 * copia — el mediaId de Meta no sirve para servirlo de vuelta), y lo manda.
 * Mismo guardrail de ventana de 24hs que sendMessage; se duplica la
 * validación de cuenta/pluginId en vez de extraerla a un helper para no tocar
 * sendMessage (ya probado en producción) — ver nota de estilo del repo.
 *
 * Límite MVP: 16MB (cubre imagen/audio/video reales de WhatsApp); documentos
 * grandes (WhatsApp permite hasta 100MB) no están soportados por este
 * endpoint todavía — ver límite de multer en whatsapp.routes.js.
 */
async function sendMedia(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'Adjuntá un archivo' })
    const caption = (req.body.caption || '').trim() || null

    const conversation = await assertConversation(req)
    if (!conversation.lastInboundAt || Date.now() - conversation.lastInboundAt.getTime() > SESSION_WINDOW_MS) {
      return res.status(400).json({
        error: 'Pasaron más de 24hs desde el último mensaje del contacto — hace falta una plantilla aprobada para reabrir la conversación.',
        code: 'SESSION_WINDOW_EXPIRED',
      })
    }

    const account = await prisma.whatsappAccount.findFirst({ where: { workspaceId: req.workspace.id } })
    if (!account) return res.status(400).json({ error: 'No hay ninguna cuenta de WhatsApp conectada', code: 'WHATSAPP_NOT_CONNECTED' })
    if (!account.pluginId) {
      return res.status(400).json({ error: 'A la cuenta le falta el Plugin ID — completalo desde "Editar" antes de responder.', code: 'WHATSAPP_MISSING_PLUGIN_ID' })
    }

    const kind = resolveMediaKind(req.file.mimetype)
    let mimeType = req.file.mimetype
    // Igual que Contenido (contentAssets.controller.js): esto SÍ es un upload
    // directo de un usuario nuestro, así que valida magic bytes en serio
    // (a diferencia de whatsappMedia.service.js, que es lo que ya entregó Meta).
    if (kind === 'image') {
      const check = validateImageUpload(req.file.buffer, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
      if (!check.ok) return res.status(400).json({ error: check.error })
      mimeType = check.mimeType
    } else if (kind === 'video') {
      const check = validateMediaHeader(req.file.buffer, 'video', ['video/mp4', 'video/quicktime', 'video/webm'])
      if (!check.ok) return res.status(400).json({ error: check.error })
      mimeType = check.mimeType
    }

    const provider = getProvider(account.provider)
    const decrypted = decryptAccount(account)

    let waMessageId
    try {
      const { publicMediaUrl } = await provider.uploadMedia({ account: decrypted, buffer: req.file.buffer, mimeType, fileName: req.file.originalname })
      if (!publicMediaUrl) throw new Error('Chakra no devolvió una URL pública del archivo subido')
      ;({ waMessageId } = await provider.sendMediaMessage({
        account: decrypted, to: conversation.phoneE164, mediaUrl: publicMediaUrl, kind, caption, fileName: req.file.originalname,
      }))
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 300) : err.message
      console.error('[WhatsApp] Error enviando adjunto vía', account.provider, ':', detail)
      return res.status(502).json({ error: `No se pudo enviar el adjunto por WhatsApp: ${detail}`, code: 'WHATSAPP_SEND_FAILED' })
    }

    const stored = objectStorage.isConfigured()
      ? await (async () => {
          const { key, size } = await objectStorage.putObject(req.file.buffer, mimeType, { prefix: `whatsapp/${req.workspace.id}` })
          return { objectKey: key, mediaData: null, sizeBytes: size }
        })()
      : { objectKey: null, mediaData: req.file.buffer, sizeBytes: req.file.buffer.length }

    const message = await prisma.whatsappMessage.create({
      data: {
        workspaceId: req.workspace.id,
        conversationId: conversation.id,
        direction: 'out',
        content: caption,
        waMessageId: waMessageId || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        senderType: 'user',
        senderUserId: req.user.userId,
        status: 'sent',
        media: {
          create: {
            workspaceId: req.workspace.id,
            kind,
            mimeType,
            fileName: req.file.originalname || null,
            ...stored,
          },
        },
      },
      include: { senderUser: { select: { id: true, name: true, avatar: true } }, media: true },
    })

    await prisma.whatsappConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } })
    await prisma.whatsappConversationRead.upsert({
      where: { conversationId_userId: { conversationId: conversation.id, userId: req.user.userId } },
      update: { lastReadMessageId: message.id, lastReadAt: new Date() },
      create: { workspaceId: req.workspace.id, conversationId: conversation.id, userId: req.user.userId, lastReadMessageId: message.id },
    })

    emitTo(`workspace:${req.workspace.id}`, 'whatsapp:message', { conversationId: conversation.id, message })

    if (conversation.contactId) {
      const lead = await prisma.lead.findFirst({
        where: { workspaceId: req.workspace.id, primaryContactId: conversation.contactId, status: { in: ACTIVE_LEAD_STATUS_KEYS } },
        select: { id: true },
      })
      if (lead) {
        await logLeadEvent({
          workspaceId: req.workspace.id, leadId: lead.id, userId: req.user.userId, type: 'whatsapp_message',
          content: `envió un adjunto por WhatsApp${caption ? `: "${caption.slice(0, 120)}"` : ''}`,
        })
      }
    }

    res.status(201).json(message)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/whatsapp/conversations/:id/contact  { contactId }
 * Vincula manualmente la conversación a un Contact existente — cubre lo que
 * el matching automático por teléfono (findMatchingContact, en
 * whatsapp.webhook.js) no resuelve solo: el contacto se cargó/corrigió
 * después de que la conversación ya existía, y ese matching solo se
 * recalcula cuando llega un mensaje entrante nuevo, no al editar el contacto.
 */
async function linkContact(req, res, next) {
  try {
    const conversation = await assertConversation(req)
    const { contactId } = req.body
    if (!contactId) return res.status(400).json({ error: 'contactId es obligatorio' })

    const contact = await prisma.contact.findFirst({ where: { id: Number(contactId), workspaceId: req.workspace.id } })
    if (!contact) return res.status(404).json({ error: 'Contacto no encontrado' })

    const updated = await prisma.whatsappConversation.update({
      where: { id: conversation.id },
      data: { contactId: contact.id },
      include: { contact: { select: { id: true, name: true, companyId: true } } },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

/**
 * POST /api/whatsapp/conversations/:id/contact  { name, title?, email?, companyId?, newCompany? }
 * Crea un Contact nuevo a partir de una conversación sin vincular y lo
 * asocia — mismo patrón empresa existente/nueva que createLead
 * (leads.controller.js). El teléfono del contacto sale de la propia
 * conversación (phoneE164), no se vuelve a pedir.
 */
async function createContactFromConversation(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const conversation = await assertConversation(req)
    const { name, title, email, companyId, newCompany } = req.body
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre del contacto es requerido' })

    let resolvedCompanyId = companyId ? Number(companyId) : null
    if (!resolvedCompanyId && !newCompany?.name?.trim()) {
      return res.status(400).json({ error: 'Empresa requerida' })
    }
    if (resolvedCompanyId) {
      const c = await prisma.company.findFirst({ where: { id: resolvedCompanyId, workspaceId }, select: { id: true } })
      if (!c) return res.status(404).json({ error: 'Empresa no encontrada' })
    }

    const contact = await prisma.$transaction(async (tx) => {
      if (!resolvedCompanyId) {
        const company = await tx.company.create({ data: { workspaceId, name: newCompany.name.trim() } })
        resolvedCompanyId = company.id
      }
      return tx.contact.create({
        data: {
          workspaceId,
          companyId: resolvedCompanyId,
          name: name.trim(),
          title: title?.trim() || null,
          email: email?.trim() || null,
          phone: conversation.phoneE164,
        },
      })
    })

    const updated = await prisma.whatsappConversation.update({
      where: { id: conversation.id },
      data: { contactId: contact.id },
      include: { contact: { select: { id: true, name: true, companyId: true } } },
    })
    res.status(201).json(updated)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/whatsapp/conversations/:id/assign  { userId }
 * Reasigna el responsable de una conversación puntual (Fase 2 del plan) —
 * cualquier miembro activo del equipo comercial, no solo admin/owner, mismo
 * criterio que changeOwner de un Lead. `userId: null` desasigna (vuelve al
 * default implícito del lead.ownerId, resuelto en el frontend).
 */
async function assignConversation(req, res, next) {
  try {
    const conversation = await assertConversation(req)
    const { userId } = req.body
    const newAssigneeId = userId != null ? Number(userId) : null
    if (newAssigneeId != null && !(await assertActiveMember(newAssigneeId, req.workspace.id))) {
      return res.status(400).json({ error: 'El responsable no es un miembro activo del workspace' })
    }
    const updated = await prisma.whatsappConversation.update({
      where: { id: conversation.id },
      data: { assignedToId: newAssigneeId },
      include: { assignedTo: { select: { id: true, name: true, avatar: true } } },
    })
    res.json(updated)
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

/**
 * GET /api/whatsapp/bot
 * Config del bot del workspace (Fase 4 del plan) — siempre devuelve algo,
 * aunque nunca se haya guardado (fila inexistente = bot deshabilitado con el
 * prompt default, para que el frontend tenga un placeholder editable).
 */
async function getBotConfig(req, res, next) {
  try {
    const config = await prisma.whatsappBotConfig.findUnique({ where: { workspaceId: req.workspace.id } })
    res.json(config || { enabled: false, prompt: DEFAULT_PROMPT })
  } catch (err) { next(err) }
}

/**
 * PUT /api/whatsapp/bot  { enabled, prompt }
 * Solo admin/owner (ver whatsapp.routes.js) — es un interruptor con costo
 * operativo real (tokens de IA por cada mensaje entrante mientras esté on).
 */
async function saveBotConfig(req, res, next) {
  try {
    const { enabled, prompt } = req.body
    const config = await prisma.whatsappBotConfig.upsert({
      where: { workspaceId: req.workspace.id },
      update: { enabled: Boolean(enabled), prompt: prompt?.trim() || null },
      create: { workspaceId: req.workspace.id, enabled: Boolean(enabled), prompt: prompt?.trim() || null },
    })
    res.json(config)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/whatsapp/conversations/:id/bot  { botEnabled }
 * "Tomar el control" / "Devolver al bot" de una conversación puntual —
 * cualquier miembro del equipo comercial (mismo criterio que assignConversation),
 * no requiere ser admin: es una acción operativa del día a día, no una
 * configuración del workspace.
 */
async function toggleConversationBot(req, res, next) {
  try {
    const conversation = await assertConversation(req)
    const updated = await prisma.whatsappConversation.update({
      where: { id: conversation.id },
      data: { botEnabled: Boolean(req.body.botEnabled) },
    })
    res.json({ id: updated.id, botEnabled: updated.botEnabled })
  } catch (err) { next(err) }
}

module.exports = {
  connectAccount, getAccount, disconnectAccount, listConversations, getMessages, sendMessage, sendMedia, markRead,
  assignConversation, linkContact, createContactFromConversation, getBotConfig, saveBotConfig, toggleConversationBot,
}
