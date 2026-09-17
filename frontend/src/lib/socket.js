import { io } from 'socket.io-client'

// Singleton de socket.io-client para el chat en tiempo real. `connectSocket()`
// es idempotente: si ya hay una conexión viva la reutiliza (la llaman tanto
// ChatContext como cada apertura de canal en Chat.jsx, sin pisarse). Solo crea
// una nueva tras `disconnectSocket()` (logout), momento en que el token pudo
// haber cambiado.
let socket = null
let visibilityListenerAdded = false

// En una tablet/celular, cuando la pestaña pasa a background el navegador suspende
// los timers de JS y el socket puede terminar cayéndose (más margen de lo normal
// gracias al pingTimeout subido en el backend, pero no infinito). El propio
// socket.io-client reconecta solo con backoff, pero acá lo apuramos: apenas la
// pestaña vuelve a estar visible y el socket sigue caído, se fuerza `connect()` en
// vez de esperar el próximo intento programado — así el chat y la llamada de voz
// (VoiceCallContext hace un rejoin completo en el `connect` que esto dispara) se
// recuperan apenas el usuario vuelve, no unos segundos después.
function ensureVisibilityReconnect() {
  if (visibilityListenerAdded || typeof document === 'undefined') return
  visibilityListenerAdded = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && socket && !socket.connected) {
      socket.connect()
    }
  })
}

export function connectSocket() {
  if (socket) return socket
  const token = localStorage.getItem('token')
  if (!token) return null
  socket = io(import.meta.env.VITE_API_URL, {
    auth: { token },
    withCredentials: true,
  })
  ensureVisibilityReconnect()
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
