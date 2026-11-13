import { useEffect, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { connectSocket } from '../lib/socket'

// Contadores de los avisos de la barra lateral y de la pestaña WhatsApp de Ventas
// (`GET /api/nav/counts`, un solo request para todos los módulos).
//
// Mismo patrón de caché que `useStarredProjects.js`: Navbar se vuelve a montar en cada
// navegación, así que la respuesta vive en una caché a nivel de módulo y el intervalo
// es UNO solo compartido, con contador de suscriptores (la barra y Ventas montan el
// hook a la vez).
//
// Cadencias: TTL 60s (una navegación después de un rato de inactividad trae dato
// fresco) y polling cada 120s, que es la cadencia ya establecida en la app para
// frescura de fondo (`NotificationBell`, el `/workspaces/mine` de Navbar). Una
// solicitud de vacaciones o una factura vencida no son eventos de tiempo real; lo que
// sí lo es — un mensaje de WhatsApp entrante — llega por socket.
//
// Para que un badge baje al instante sin esperar los 120s, quien resuelve algo llama a
// `notifyNavCountsChanged()` (mismo contrato que `notifyProjectStarChanged`).

const TTL_MS      = 60 * 1000
const POLL_MS     = 120 * 1000
const SOCKET_DEBOUNCE_MS = 2000
const EVENT       = 'bliss:nav-counts-changed'
const EMPTY       = { modules: {} }

let cache = null        // { userId, slug, at, data }
let inflight = null
let timer = null
let socketBound = false
let socketDebounce = null
let subscribers = 0

function fetchCounts(userId, slug) {
  if (inflight) return inflight
  inflight = api.get('/nav/counts')
    .then(({ data }) => {
      cache = { userId, slug, at: Date.now(), data: data || EMPTY }
      window.dispatchEvent(new CustomEvent(EVENT))
      return cache.data
    })
    .finally(() => { inflight = null })
  return inflight
}

function refresh() {
  if (!cache) return
  fetchCounts(cache.userId, cache.slug).catch(() => {})
}

/** Invalida la caché y vuelve a pedir: lo llama quien acaba de resolver algo. */
export function notifyNavCountsChanged() {
  refresh()
}

export default function useNavCounts() {
  const { user } = useAuth()
  const { slug } = useWorkspace()
  const userId = user?.id
  const fresh = cache && cache.userId === userId && cache.slug === slug
  const [data, setData] = useState(fresh ? cache.data : EMPTY)

  useEffect(() => {
    if (!userId || !slug) return
    let alive = true

    const stale = !fresh || Date.now() - cache.at > TTL_MS
    if (stale) fetchCounts(userId, slug).then(d => { if (alive) setData(d) }).catch(() => {})

    const onChange = () => { if (cache) setData(cache.data) }
    window.addEventListener(EVENT, onChange)

    subscribers += 1
    if (!timer) timer = setInterval(refresh, POLL_MS)

    // Un mensaje de WhatsApp entrante sí es tiempo real. Se REFETCHEA en vez de
    // incrementar: el mismo evento se emite también para los mensajes que manda el
    // equipo desde la app, y no sabe si esta persona ya los leyó.
    if (!socketBound) {
      const socket = connectSocket()
      if (socket) {
        // `whatsapp:read`: el leído de WhatsApp es compartido por el equipo, así que
        // cuando otra persona abre (o marca no leído) un chat, el número cambia acá.
        const onWhatsappEvent = () => {
          // Si esta persona no tiene Ventas, el evento igual le llega (va al room del
          // workspace entero): no hay nada que refrescar.
          if (!cache?.data?.modules?.ventas) return
          clearTimeout(socketDebounce)
          socketDebounce = setTimeout(refresh, SOCKET_DEBOUNCE_MS)
        }
        socket.on('whatsapp:message', onWhatsappEvent)
        socket.on('whatsapp:read', onWhatsappEvent)
        socketBound = true
      }
    }

    return () => {
      alive = false
      window.removeEventListener(EVENT, onChange)
      subscribers -= 1
      if (subscribers <= 0 && timer) { clearInterval(timer); timer = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, slug])

  return data
}
