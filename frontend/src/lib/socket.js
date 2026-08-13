import { io } from 'socket.io-client'

// Singleton de socket.io-client para el chat en tiempo real. `connectSocket()`
// es idempotente: si ya hay una conexión viva la reutiliza (la llaman tanto
// ChatContext como cada apertura de canal en Chat.jsx, sin pisarse). Solo crea
// una nueva tras `disconnectSocket()` (logout), momento en que el token pudo
// haber cambiado.
let socket = null

export function connectSocket() {
  if (socket) return socket
  const token = localStorage.getItem('token')
  if (!token) return null
  socket = io(import.meta.env.VITE_API_URL, {
    auth: { token },
    withCredentials: true,
  })
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
