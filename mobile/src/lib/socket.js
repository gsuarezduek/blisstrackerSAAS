import { io } from 'socket.io-client'
import { getToken } from '../api/session'

// Mismo protocolo que el chat web (backend/src/lib/socket.js): handshake con
// el JWT en `auth.token`, el server une automáticamente los rooms
// `user:<id>` y `workspace:<id>`; `channel:<id>` se une explícitamente al
// abrir ese canal (ver ChatScreen). Una sola conexión para toda la app,
// abierta tras login y cerrada en logout (AuthContext).
let socket = null

export async function connectSocket() {
  if (socket?.connected) return socket
  const token = await getToken()
  if (!token) return null

  socket = io(process.env.EXPO_PUBLIC_API_URL, {
    auth: { token },
    transports: ['websocket'],
  })
  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
