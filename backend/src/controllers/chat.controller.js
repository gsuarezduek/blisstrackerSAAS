const axios = require('axios')
const prisma = require('../lib/prisma')
const { resolveMentions } = require('../lib/mentions')
const { slugify } = require('../lib/slugify')
const { emitTo } = require('../lib/socket')
const { channelLabel, uniqueSlug, materializeChannels } = require('../lib/chatChannels')
const { MESSAGE_INCLUDE } = require('../lib/chatMessageInclude')

const MESSAGE_PAGE_SIZE = 50

// Canal privado (ChatChannel.isPrivate): solo lo ven/usan admin/owner del workspace —
// mismo criterio que workspaceAdminOnly, pero evaluado por canal en vez de por ruta
// entera (listChannels/listMessages/sendMessage/markRead siguen abiertos a cualquier
// miembro salvo que el canal puntual sea privado).
function isAdminMember(req) {
  return req.workspaceMember?.role === 'admin' || req.workspaceMember?.role === 'owner'
}

function assertChannelAccess(req, res, channel) {
  if (channel.isPrivate && !isAdminMember(req)) {
    res.status(403).json({ error: 'Este canal es privado — solo lo ven los administradores', code: 'CHANNEL_PRIVATE' })
    return false
  }
  return true
}

async function listChannels(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    await materializeChannels(workspaceId)

    const channels = await prisma.chatChannel.findMany({
      where: { workspaceId, archived: false, ...(isAdminMember(req) ? {} : { isPrivate: false }) },
      include: {
        project: { select: { name: true } },
        messages: { orderBy: { id: 'desc' }, take: 1, select: { id: true, content: true, gifUrl: true, createdAt: true, authorId: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const channelIds = channels.map(c => c.id)
    const projectIds = channels.map(c => c.projectId).filter(Boolean)
    const [reads, mentionCounts, stars] = await Promise.all([
      prisma.chatChannelRead.findMany({ where: { userId, channelId: { in: channelIds } } }),
      prisma.notification.groupBy({
        by: ['channelId'],
        where: { userId, workspaceId, type: 'CHAT_MENTION', read: false, channelId: { in: channelIds } },
        _count: { id: true },
      }),
      // Favoritos: reutiliza el mismo starring de "Mis Proyectos" (ProjectStar), no hay
      // un concepto de favorito propio del chat — un canal de proyecto es favorito si su
      // proyecto lo es.
      prisma.projectStar.findMany({ where: { userId, projectId: { in: projectIds } }, select: { projectId: true } }),
    ])
    const readMap = new Map(reads.map(r => [r.channelId, r.lastReadMessageId]))
    const mentionMap = new Map(mentionCounts.map(m => [m.channelId, m._count.id]))
    const starredProjectIds = new Set(stars.map(s => s.projectId))

    // Sin tabla de "read" por mensaje: no-leídos = mensajes con id > lastReadMessageId.
    // Se evita la query por canal cuando ya está al día (lastRead >= último mensaje).
    const unreadPairs = await Promise.all(channels.map(async c => {
      const lastMessageId = c.messages[0]?.id ?? null
      const lastRead = readMap.get(c.id) ?? 0
      if (!lastMessageId || lastMessageId <= lastRead) return [c.id, 0]
      const count = await prisma.chatMessage.count({ where: { channelId: c.id, id: { gt: lastRead } } })
      return [c.id, count]
    }))
    const unreadMap = new Map(unreadPairs)

    res.json(channels.map(c => ({
      id: c.id,
      kind: c.kind,
      slug: c.slug,
      name: channelLabel(c),
      description: c.description,
      projectId: c.projectId,
      isPrivate: c.isPrivate,
      starred: c.projectId ? starredProjectIds.has(c.projectId) : false,
      lastMessage: c.messages[0] || null,
      unreadCount: unreadMap.get(c.id) || 0,
      mentionCount: mentionMap.get(c.id) || 0,
    })))
  } catch (err) { next(err) }
}

async function createChannel(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const trimmed = (req.body?.name || '').trim()
    if (!trimmed) return res.status(400).json({ error: 'El nombre del canal es requerido' })

    const slug = await uniqueSlug(workspaceId, slugify(trimmed))
    const channel = await prisma.chatChannel.create({
      data: {
        workspaceId,
        kind: 'custom',
        slug,
        name: trimmed,
        description: req.body?.description?.trim() || null,
        createdById: req.user.userId,
      },
    })
    res.status(201).json(channel)
  } catch (err) { next(err) }
}

async function updateChannel(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const channelId = Number(req.params.id)
    const channel = await prisma.chatChannel.findFirst({ where: { id: channelId, workspaceId } })
    if (!channel) return res.status(404).json({ error: 'Canal no encontrado' })
    if (channel.kind !== 'custom') return res.status(400).json({ error: 'Este canal se administra automáticamente y no se puede editar' })

    const data = {}
    if (req.body?.name !== undefined) {
      const trimmed = (req.body.name || '').trim()
      if (!trimmed) return res.status(400).json({ error: 'El nombre del canal es requerido' })
      data.name = trimmed
    }
    if (req.body?.description !== undefined) data.description = req.body.description?.trim() || null

    const updated = await prisma.chatChannel.update({ where: { id: channelId }, data })
    res.json(updated)
  } catch (err) { next(err) }
}

// Candado de privacidad — a diferencia de updateChannel, aplica a CUALQUIER kind
// (general/project/custom), no solo custom: un admin puede volver privado #general
// o el canal de un proyecto sin que eso lo convierta en "editable" por lo demás.
async function updateChannelPrivacy(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const channelId = Number(req.params.id)
    const isPrivate = !!req.body?.isPrivate

    const channel = await prisma.chatChannel.findFirst({ where: { id: channelId, workspaceId } })
    if (!channel) return res.status(404).json({ error: 'Canal no encontrado' })

    const updated = await prisma.chatChannel.update({ where: { id: channelId }, data: { isPrivate } })
    res.json(updated)
  } catch (err) { next(err) }
}

async function deleteChannel(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const channelId = Number(req.params.id)
    const channel = await prisma.chatChannel.findFirst({ where: { id: channelId, workspaceId } })
    if (!channel) return res.status(404).json({ error: 'Canal no encontrado' })
    if (channel.kind !== 'custom') return res.status(400).json({ error: 'Este canal se administra automáticamente y no se puede eliminar' })

    await prisma.chatChannel.delete({ where: { id: channelId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

async function listMessages(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const channelId = Number(req.params.id)
    const limit = Math.min(Number(req.query.limit) || MESSAGE_PAGE_SIZE, 100)
    const before = req.query.before ? Number(req.query.before) : null

    const channel = await prisma.chatChannel.findFirst({ where: { id: channelId, workspaceId } })
    if (!channel) return res.status(404).json({ error: 'Canal no encontrado' })
    if (!assertChannelAccess(req, res, channel)) return

    const messages = await prisma.chatMessage.findMany({
      where: { channelId, ...(before ? { id: { lt: before } } : {}) },
      include: MESSAGE_INCLUDE,
      orderBy: { id: 'desc' },
      take: limit,
    })
    messages.reverse() // orden ascendente para renderizar

    // El divisor de "no leídos" solo tiene sentido en la página más reciente (sin `before`).
    let firstUnreadMessageId = null
    if (!before) {
      const read = await prisma.chatChannelRead.findUnique({ where: { channelId_userId: { channelId, userId } } })
      const lastRead = read?.lastReadMessageId ?? 0
      firstUnreadMessageId = messages.find(m => m.id > lastRead)?.id ?? null
    }

    res.json({ messages, hasMore: messages.length === limit, firstUnreadMessageId })
  } catch (err) { next(err) }
}

// Mensajes fijados de un canal — separado de listMessages porque un mensaje fijado
// puede quedar fuera de la ventana de paginación (fue fijado hace meses).
async function listPinned(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const channelId = Number(req.params.id)

    const channel = await prisma.chatChannel.findFirst({ where: { id: channelId, workspaceId } })
    if (!channel) return res.status(404).json({ error: 'Canal no encontrado' })
    if (!assertChannelAccess(req, res, channel)) return

    const messages = await prisma.chatMessage.findMany({
      where: { channelId, pinnedAt: { not: null } },
      include: MESSAGE_INCLUDE,
      orderBy: { pinnedAt: 'desc' },
    })
    res.json(messages)
  } catch (err) { next(err) }
}

async function sendMessage(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const channelId = Number(req.params.id)
    const text = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    const gifUrl = req.body?.gifUrl || null
    if (!text && !gifUrl) return res.status(400).json({ error: 'El mensaje no puede estar vacío' })

    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, workspaceId },
      include: { project: { select: { name: true } } },
    })
    if (!channel) return res.status(404).json({ error: 'Canal no encontrado' })
    if (!assertChannelAccess(req, res, channel)) return

    // Responder: solo válido si el mensaje citado es del MISMO canal — si no existe
    // (o es de otro canal/se borró justo ahora) se ignora en silencio, no rompe el envío.
    const requestedReplyToId = req.body?.replyToId ? Number(req.body.replyToId) : null
    let replyTarget = null
    if (requestedReplyToId) {
      replyTarget = await prisma.chatMessage.findFirst({
        where: { id: requestedReplyToId, channelId },
        select: { id: true, authorId: true },
      })
    }

    const message = await prisma.chatMessage.create({
      data: { workspaceId, channelId, authorId: userId, content: text || null, gifUrl, replyToId: replyTarget?.id ?? null },
      include: MESSAGE_INCLUDE,
    })

    // El autor no debe ver su propio mensaje como no-leído.
    await prisma.chatChannelRead.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { workspaceId, channelId, userId, lastReadMessageId: message.id },
      update: { lastReadMessageId: message.id, lastReadAt: new Date() },
    })

    // Menciones contra miembros activos del workspace (cualquier canal es abierto a todos).
    // "@everyone" (con límite de palabra, insensible a mayúsculas) notifica a todo el equipo
    // en vez de resolver nombres individuales. En un canal privado sólo pueden verlo (y por
    // ende ser notificados) admin/owner — mencionar a alguien sin acceso sería un callejón
    // sin salida (notificación a un canal que no puede abrir).
    let mentionedUserIds = new Set()
    let isEveryoneMention = false
    if (text.includes('@')) {
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId, active: true, ...(channel.isPrivate ? { role: { in: ['admin', 'owner'] } } : {}) },
        select: { user: { select: { id: true, name: true } } },
      })
      const allUsers = members.map(m => m.user)
      isEveryoneMention = /@everyone\b/i.test(text)
      mentionedUserIds = isEveryoneMention
        ? new Set(allUsers.filter(u => u.id !== userId).map(u => u.id))
        : resolveMentions(text, allUsers, userId)
    }

    if (mentionedUserIds.size > 0) {
      const notifMessage = isEveryoneMention
        ? `mencionó a todo el equipo en #${channelLabel(channel)}`
        : `te mencionó en #${channelLabel(channel)}`
      await prisma.notification.createMany({
        data: Array.from(mentionedUserIds).map(uid => ({
          userId: uid,
          actorId: userId,
          workspaceId,
          channelId,
          chatMessageId: message.id,
          type: 'CHAT_MENTION',
          message: notifMessage,
        })),
      })
      for (const uid of mentionedUserIds) emitTo(`user:${uid}`, 'notification:new', { type: 'CHAT_MENTION', channelId })
    }

    // Responder equivale a una mención: notifica al autor del mensaje original (si tiene
    // uno — no a un mensaje de sistema, ni a uno mismo, ni si ya se lo notificó arriba
    // por @mención, para no duplicar).
    if (replyTarget?.authorId && replyTarget.authorId !== userId && !mentionedUserIds.has(replyTarget.authorId)) {
      await prisma.notification.create({
        data: {
          userId: replyTarget.authorId,
          actorId: userId,
          workspaceId,
          channelId,
          chatMessageId: message.id,
          type: 'CHAT_MENTION',
          message: `te respondió en #${channelLabel(channel)}`,
        },
      })
      emitTo(`user:${replyTarget.authorId}`, 'notification:new', { type: 'CHAT_MENTION', channelId })
    }

    emitTo(`channel:${channelId}`, 'chat:message', message)
    emitTo(`workspace:${workspaceId}`, 'chat:unread', { channelId, authorId: userId })

    res.status(201).json(message)
  } catch (err) { next(err) }
}

async function editMessage(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const messageId = Number(req.params.messageId)
    const text = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    if (!text) return res.status(400).json({ error: 'El mensaje no puede estar vacío' })

    const existing = await prisma.chatMessage.findFirst({ where: { id: messageId, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Mensaje no encontrado' })
    if (existing.authorId !== userId) return res.status(403).json({ error: 'Solo podés editar tus propios mensajes' })

    const message = await prisma.chatMessage.update({
      where: { id: messageId },
      data: { content: text, editedAt: new Date() },
      include: MESSAGE_INCLUDE,
    })
    emitTo(`channel:${existing.channelId}`, 'chat:message:edited', message)
    res.json(message)
  } catch (err) { next(err) }
}

async function deleteMessage(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const messageId = Number(req.params.messageId)
    const isModerator = req.workspaceMember?.role === 'admin' || req.workspaceMember?.role === 'owner'

    const existing = await prisma.chatMessage.findFirst({ where: { id: messageId, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Mensaje no encontrado' })
    if (existing.authorId !== userId && !isModerator) {
      return res.status(403).json({ error: 'No podés eliminar este mensaje' })
    }

    await prisma.chatMessage.delete({ where: { id: messageId } })
    emitTo(`channel:${existing.channelId}`, 'chat:message:deleted', { id: messageId, channelId: existing.channelId })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

async function markRead(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const channelId = Number(req.params.id)

    const channel = await prisma.chatChannel.findFirst({ where: { id: channelId, workspaceId } })
    if (!channel) return res.status(404).json({ error: 'Canal no encontrado' })
    if (!assertChannelAccess(req, res, channel)) return

    const last = await prisma.chatMessage.findFirst({ where: { channelId }, orderBy: { id: 'desc' }, select: { id: true } })

    await Promise.all([
      prisma.chatChannelRead.upsert({
        where: { channelId_userId: { channelId, userId } },
        create: { workspaceId, channelId, userId, lastReadMessageId: last?.id ?? null },
        update: { lastReadMessageId: last?.id ?? null, lastReadAt: new Date() },
      }),
      // Abrir el canal también limpia el badge de mención de ese canal.
      prisma.notification.updateMany({
        where: { userId, workspaceId, channelId, type: 'CHAT_MENTION', read: false },
        data: { read: true },
      }),
    ])

    emitTo(`workspace:${workspaceId}`, 'chat:read', { channelId, userId })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// Fijar/desfijar: abierto a cualquier miembro activo del workspace (a diferencia de
// editar/eliminar, no está restringido a autor/moderador) — cualquiera puede marcar
// un mensaje como importante para el canal.
async function togglePin(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const messageId = Number(req.params.messageId)
    const pinned = !!req.body?.pinned

    const existing = await prisma.chatMessage.findFirst({ where: { id: messageId, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Mensaje no encontrado' })

    const channel = await prisma.chatChannel.findFirst({ where: { id: existing.channelId, workspaceId } })
    if (!channel || !assertChannelAccess(req, res, channel)) return

    const message = await prisma.chatMessage.update({
      where: { id: messageId },
      data: pinned ? { pinnedAt: new Date(), pinnedById: userId } : { pinnedAt: null, pinnedById: null },
      include: MESSAGE_INCLUDE,
    })
    emitTo(`channel:${existing.channelId}`, 'chat:message:pinned', message)
    res.json(message)
  } catch (err) { next(err) }
}

// Reacciones con emoji: abierto a cualquier miembro activo del workspace (mismo criterio
// que fijar, no restringido a autor/moderador). Sin catálogo fijo — el emoji lo elige el
// frontend (picker de emojis ya existente para componer mensajes). Toggle por
// (mensaje, usuario, emoji): reaccionar de nuevo con el mismo emoji lo saca; varios
// emojis distintos de la misma persona en el mismo mensaje conviven sin problema.
async function toggleReaction(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId
    const messageId = Number(req.params.messageId)
    const emoji = (req.body?.emoji || '').trim()
    if (!emoji || emoji.length > 32) return res.status(400).json({ error: 'Emoji inválido' })

    const existing = await prisma.chatMessage.findFirst({ where: { id: messageId, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Mensaje no encontrado' })

    const channel = await prisma.chatChannel.findFirst({ where: { id: existing.channelId, workspaceId } })
    if (!channel || !assertChannelAccess(req, res, channel)) return

    const existingReaction = await prisma.chatMessageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    })
    if (existingReaction) {
      await prisma.chatMessageReaction.delete({ where: { id: existingReaction.id } })
    } else {
      await prisma.chatMessageReaction.create({ data: { workspaceId, messageId, userId, emoji } })
    }

    const message = await prisma.chatMessage.findUnique({ where: { id: messageId }, include: MESSAGE_INCLUDE })
    emitTo(`channel:${existing.channelId}`, 'chat:message:reaction', message)
    res.json(message)
  } catch (err) { next(err) }
}

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs'

function normalizeGif(g) {
  return {
    id: g.id,
    title: g.title || '',
    url: g.images?.fixed_height?.url || g.images?.original?.url || null,
    previewUrl: g.images?.fixed_height_small?.url || g.images?.preview_gif?.url || null,
    width: Number(g.images?.fixed_height?.width) || null,
    height: Number(g.images?.fixed_height?.height) || null,
  }
}

async function requireGiphyKey(res) {
  const apiKey = process.env.GIPHY_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'Los GIFs no están configurados en el servidor (falta GIPHY_API_KEY).', code: 'GIFS_NOT_CONFIGURED' })
    return null
  }
  return apiKey
}

async function searchGifs(req, res, next) {
  try {
    const apiKey = await requireGiphyKey(res)
    if (!apiKey) return
    const q = (req.query.q || '').trim()
    if (!q) return res.json({ gifs: [] })
    const { data } = await axios.get(`${GIPHY_BASE}/search`, {
      params: { api_key: apiKey, q, limit: 24, rating: 'pg-13', lang: 'es' },
      timeout: 8000,
    })
    res.json({ gifs: (data.data || []).map(normalizeGif) })
  } catch (err) { next(err) }
}

async function trendingGifs(req, res, next) {
  try {
    const apiKey = await requireGiphyKey(res)
    if (!apiKey) return
    const { data } = await axios.get(`${GIPHY_BASE}/trending`, {
      params: { api_key: apiKey, limit: 24, rating: 'pg-13' },
      timeout: 8000,
    })
    res.json({ gifs: (data.data || []).map(normalizeGif) })
  } catch (err) { next(err) }
}

module.exports = {
  listChannels,
  createChannel,
  updateChannel,
  updateChannelPrivacy,
  deleteChannel,
  listMessages,
  listPinned,
  sendMessage,
  editMessage,
  deleteMessage,
  togglePin,
  toggleReaction,
  markRead,
  searchGifs,
  trendingGifs,
}
