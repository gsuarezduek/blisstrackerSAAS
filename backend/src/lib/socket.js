const { Server } = require('socket.io')
const { verifyToken } = require('./jwt')
const { isAllowedOrigin } = require('./corsOrigins')
const prisma = require('./prisma')

let io = null

// Tiempo real del chat: se monta sobre el mismo `httpServer` de Express (Railway
// corre un proceso persistente, no serverless) — no es infraestructura nueva.
// Rooms: `user:<id>` y `workspace:<id>` se unen automáticamente al conectar;
// `channel:<id>` se une explícitamente al abrir ese canal en la UI (valida que
// el canal sea del mismo workspace del token antes de unir, para no filtrar
// mensajes entre workspaces).
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
  })

  return io
}

// No-op si el socket todavía no se inicializó (ej. tests, que no levantan el server real).
function emitTo(room, event, payload) {
  io?.to(room).emit(event, payload)
}

module.exports = { initSocket, emitTo }
