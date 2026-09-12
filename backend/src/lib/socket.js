const { Server } = require('socket.io')
const { verifyToken } = require('./jwt')
const { isAllowedOrigin } = require('./corsOrigins')
const prisma = require('./prisma')

let io = null

// Canales de voz (WebRTC mesh) — estado efímero, SOLO en memoria de este proceso:
// se pierde en cada restart/deploy y no escala a múltiples instancias del backend
// (Railway hoy corre un único proceso). Si en el futuro se migra a multi-instancia,
// esto necesitaría moverse a un store compartido (ej. Redis) además de sumar el
// adapter de Redis a socket.io para que emitTo/broadcastPresence sigan funcionando
// entre procesos — no implementado ahora, deuda conocida y anotada.
// channelId(Number) -> { workspaceId, participants: Map<socketId, {userId, name, muted}> }
const voiceRooms = new Map()

// Personas únicas conectadas a una sala (dedupeadas por userId, no por socket —
// alguien con dos pestañas abiertas no debe aparecer duplicado en la vista previa).
function roomParticipantsList(channelId) {
  const room = voiceRooms.get(channelId)
  if (!room) return []
  const byUser = new Map()
  for (const p of room.participants.values()) {
    if (!byUser.has(p.userId)) byUser.set(p.userId, { userId: p.userId, name: p.name })
  }
  return [...byUser.values()]
}

function broadcastPresence(channelId) {
  const room = voiceRooms.get(channelId)
  const participants = roomParticipantsList(channelId)
  emitTo(`workspace:${room?.workspaceId}`, 'voice:presence', { channelId, count: participants.length, participants })
}

// Compartida por voice:leave y por la limpieza en disconnect. Un socket solo puede
// estar en una sala de voz a la vez (socket.data.voiceChannelId).
function leaveVoiceRoom(socket, channelId) {
  const room = voiceRooms.get(channelId)
  if (!room?.participants.has(socket.id)) return
  room.participants.delete(socket.id)
  socket.leave(`voice:${channelId}`)
  socket.to(`voice:${channelId}`).emit('voice:peer-left', { socketId: socket.id })
  if (room.participants.size === 0) voiceRooms.delete(channelId)
  broadcastPresence(channelId)
  if (socket.data.voiceChannelId === channelId) socket.data.voiceChannelId = null
}

// Tiempo real del chat: se monta sobre el mismo `httpServer` de Express (Railway
// corre un proceso persistente, no serverless) — no es infraestructura nueva.
// Rooms: `user:<id>` y `workspace:<id>` se unen automáticamente al conectar;
// `channel:<id>` se une explícitamente al abrir ese canal en la UI (valida que
// el canal sea del mismo workspace del token antes de unir, para no filtrar
// mensajes entre workspaces). `voice:<id>` es la señalización de un canal de voz
// (ver eventos voice:* más abajo) — independiente de `channel:<id>`, a propósito:
// esa se une/abandona atada a que el panel de chat esté abierto, y una llamada de
// voz debe sobrevivir a que el panel se cierre.
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true)
        callback(new Error('Not allowed by CORS'))
      },
      credentials: true,
    },
  })

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) throw new Error('No token provided')
      socket.user = verifyToken(token) // { userId, workspaceId, role, isSuperAdmin, ... }
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    const { userId, workspaceId } = socket.user
    socket.join(`user:${userId}`)
    socket.join(`workspace:${workspaceId}`)

    // Snapshot de presencia de voz de este workspace, para que un cliente recién
    // conectado (o reconectado) pinte los badges/vistas previas de "quién está"
    // sin esperar el próximo voice:presence — no requiere unirse a ninguna sala.
    const snapshot = [...voiceRooms.entries()]
      .filter(([, room]) => room.workspaceId === workspaceId)
      .map(([channelId]) => {
        const participants = roomParticipantsList(channelId)
        return { channelId, count: participants.length, participants }
      })
    socket.emit('voice:presence:snapshot', snapshot)

    socket.on('join-channel', async (channelId) => {
      const id = Number(channelId)
      if (!id) return
      try {
        const channel = await prisma.chatChannel.findFirst({ where: { id, workspaceId }, select: { id: true, isPrivate: true } })
        if (!channel) return
        // Canal privado: solo admin/owner (mismo criterio que assertChannelAccess en
        // chat.controller.js, evaluado acá con el role del JWT porque el socket no
        // vuelve a consultar la membresía en cada join).
        const isAdmin = socket.user.role === 'admin' || socket.user.role === 'owner'
        if (channel.isPrivate && !isAdmin) return
        socket.join(`channel:${id}`)
      } catch (err) {
        console.error('[socket] Error en join-channel:', err.message)
      }
    })

    socket.on('leave-channel', (channelId) => {
      const id = Number(channelId)
      if (id) socket.leave(`channel:${id}`)
    })

    // Canales de voz — señalización WebRTC (mesh: cada peer negocia directo con
    // cada otro peer, el servidor solo rutea SDP/ICE sin interpretarlos).
    socket.on('voice:join', async (channelId) => {
      const id = Number(channelId)
      if (!id) return
      try {
        const channel = await prisma.chatChannel.findFirst({
          where: { id, workspaceId },
          select: { id: true, medium: true, isPrivate: true },
        })
        if (!channel || channel.medium !== 'voice') return
        const isAdmin = socket.user.role === 'admin' || socket.user.role === 'owner'
        if (channel.isPrivate && !isAdmin) return

        // Un socket solo puede estar en una sala de voz a la vez — si ya estaba en
        // otra, se lo saca primero (evita salas huérfanas si el cliente no llamó a
        // voice:leave antes de unirse a esta).
        if (socket.data.voiceChannelId && socket.data.voiceChannelId !== id) {
          leaveVoiceRoom(socket, socket.data.voiceChannelId)
        }

        if (!voiceRooms.has(id)) voiceRooms.set(id, { workspaceId, participants: new Map() })
        const room = voiceRooms.get(id)

        // Roster ANTES de sumarme, enviado solo a mí: el que se une es siempre quien
        // ofrece (offer) a cada participante existente — regla fija para evitar
        // glare en un mesh (dos ofertas cruzándose al mismo tiempo).
        const roster = [...room.participants.entries()].map(([socketId, p]) => ({ socketId, ...p }))
        socket.emit('voice:roster', { channelId: id, participants: roster })

        room.participants.set(socket.id, { userId: socket.user.userId, name: socket.user.name, muted: false })
        socket.data.voiceChannelId = id
        socket.join(`voice:${id}`)
        socket.to(`voice:${id}`).emit('voice:peer-joined', { socketId: socket.id, userId: socket.user.userId, name: socket.user.name, muted: false })
        broadcastPresence(id)
      } catch (err) {
        console.error('[socket] Error en voice:join:', err.message)
      }
    })

    socket.on('voice:leave', (channelId) => {
      const id = Number(channelId)
      if (id) leaveVoiceRoom(socket, id)
    })

    // Relay punto a punto (nunca broadcast a la sala): en mesh cada par de peers
    // negocia su propia oferta/respuesta/candidatos ICE.
    socket.on('voice:signal', ({ to, signal } = {}) => {
      if (!to || !signal) return
      io.to(to).emit('voice:signal', { from: socket.id, signal })
    })

    socket.on('voice:mute', ({ channelId, muted } = {}) => {
      const room = voiceRooms.get(Number(channelId))
      const participant = room?.participants.get(socket.id)
      if (!participant) return
      participant.muted = !!muted
      socket.to(`voice:${channelId}`).emit('voice:peer-muted', { socketId: socket.id, muted: participant.muted })
    })

    socket.on('disconnect', () => {
      if (socket.data.voiceChannelId) leaveVoiceRoom(socket, socket.data.voiceChannelId)
    })
  })

  return io
}

// No-op si el socket todavía no se inicializó (ej. tests, que no levantan el server real).
function emitTo(room, event, payload) {
  io?.to(room).emit(event, payload)
}

module.exports = { initSocket, emitTo }
