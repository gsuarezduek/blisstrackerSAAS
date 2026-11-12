import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import { connectSocket } from '../../lib/socket'
import { scrollToMessage } from './MessageList'

// Todo el estado de UNA conversación: mensajes, paginación, pins, reply, typing y los
// listeners de socket del canal activo.
//
// Vivía dentro de `ChatWidget.jsx`, que era a la vez el panel flotante y el dueño de
// este estado. Al salir a `pages/Chat.jsx` eso habría quedado duplicado, así que se
// extrajo tal cual: el panel (que sobrevive para mobile) y la página consumen el mismo
// hook, y el cuerpo visual compartido es `ChatConversation.jsx`.
//
// `enabled` reemplaza 1:1 al viejo `open` del panel: con el panel cerrado no se carga
// nada, no se hace `join-channel` ni se marca leído. La página pasa `enabled: true`.
//
// OJO con el efecto de los listeners: se monta UNA sola vez (dep array vacío) y filtra
// por `activeChannelIdRef`. El `onConnect` que vuelve a hacer `join-channel` documenta
// un bug real de producción — los rooms de socket.io no sobreviven a una reconexión —;
// "limpiar" esas dependencias lo revive.
export default function useChannelConversation({ channel, enabled = true, initialAroundId = null }) {
  const { user } = useAuth()
  const { loadChannels } = useChat() || {}

  const [messages, setMessages] = useState([])
  const [msgLoading, setMsgLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(null)
  const [pinnedMessages, setPinnedMessages] = useState([])
  const [replyingTo, setReplyingTo] = useState(null)
  const [jumpToMessageId, setJumpToMessageId] = useState(null)
  // true = la ventana cargada quedó "parada" en un mensaje del pasado (via around),
  // no en lo más reciente
  const [jumpMode, setJumpMode] = useState(false)
  const [typingUsers, setTypingUsers] = useState([]) // [{userId, name}] — efímero, solo del canal activo

  const activeChannelIdRef = useRef(null)
  const jumpModeRef = useRef(false) // espejo de jumpMode, para leerlo dentro del listener estable de onConnect
  const typingTimeoutsRef = useRef(new Map()) // userId -> timeout, para ocultar solo si no llegó otro evento suyo
  const aroundRef = useRef(initialAroundId)   // se consume una sola vez, en la carga inicial del canal

  useEffect(() => { jumpModeRef.current = jumpMode }, [jumpMode])
  useEffect(() => { aroundRef.current = initialAroundId }, [initialAroundId])

  const loadMessages = useCallback((channelId, before, around) => {
    const qs = around ? `?around=${around}` : before ? `?before=${before}` : ''
    return api.get(`/chat/channels/${channelId}/messages${qs}`).then(r => r.data)
  }, [])

  const loadPinned = useCallback((channelId) => {
    return api.get(`/chat/channels/${channelId}/pinned`)
      .then(r => setPinnedMessages(r.data))
      .catch(() => setPinnedMessages([]))
  }, [])

  // Cambio de canal: cargar mensajes, marcar leído, unirse a la room del socket.
  useEffect(() => {
    if (!enabled || !channel) return
    activeChannelIdRef.current = channel.id
    setMsgLoading(true)
    setMessages([])
    setFirstUnreadMessageId(null)
    setPinnedMessages([])
    setReplyingTo(null)
    setJumpMode(false)
    setJumpToMessageId(null)
    setTypingUsers([])
    typingTimeoutsRef.current.forEach(t => clearTimeout(t))
    typingTimeoutsRef.current.clear()

    // Deep-link a un mensaje puntual (`?msg=` de una notificación de mención): la carga
    // inicial se hace con `around`, la misma rama que ya usaba el salto desde un pin.
    const around = aroundRef.current
    aroundRef.current = null

    loadMessages(channel.id, null, around || undefined).then(data => {
      if (activeChannelIdRef.current !== channel.id) return
      setMessages(data.messages)
      setHasMore(data.hasMore)
      setFirstUnreadMessageId(around ? null : data.firstUnreadMessageId)
      setMsgLoading(false)
      if (around) {
        setJumpMode(true)
        setJumpToMessageId(Number(around))
      }
      api.post(`/chat/channels/${channel.id}/read`).then(loadChannels).catch(() => {})
    })
    loadPinned(channel.id)

    const socket = connectSocket()
    socket?.emit('join-channel', channel.id)
    return () => socket?.emit('leave-channel', channel.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, channel?.id])

  // Listeners de tiempo real — se montan una sola vez, filtran por el canal activo actual.
  useEffect(() => {
    const socket = connectSocket()
    if (!socket) return

    function onMessage(m) {
      if (m.channelId !== activeChannelIdRef.current) return
      setMessages(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]))
      api.post(`/chat/channels/${m.channelId}/read`).then(loadChannels).catch(() => {})
    }
    function onEdited(m) {
      if (m.channelId !== activeChannelIdRef.current) return
      setMessages(prev => prev.map(x => (x.id === m.id ? m : x)))
    }
    function onDeleted({ id, channelId }) {
      if (channelId !== activeChannelIdRef.current) return
      setMessages(prev => prev.filter(x => x.id !== id))
      setPinnedMessages(prev => prev.filter(x => x.id !== id))
    }
    function onPinned(m) {
      if (m.channelId !== activeChannelIdRef.current) return
      setMessages(prev => prev.map(x => (x.id === m.id ? m : x)))
      setPinnedMessages(prev => {
        const rest = prev.filter(x => x.id !== m.id)
        return m.pinnedAt ? [m, ...rest] : rest
      })
    }
    function onReaction(m) {
      if (m.channelId !== activeChannelIdRef.current) return
      setMessages(prev => prev.map(x => (x.id === m.id ? m : x)))
    }
    // Sin evento explícito de "dejé de escribir": si no llega otro de la misma
    // persona en 4s, se oculta sola (margen respecto al throttle de emisión de 2.5s).
    function onTyping({ channelId, userId, name } = {}) {
      if (channelId !== activeChannelIdRef.current || userId === user?.id) return
      setTypingUsers(prev => (prev.some(t => t.userId === userId) ? prev : [...prev, { userId, name }]))
      clearTimeout(typingTimeoutsRef.current.get(userId))
      typingTimeoutsRef.current.set(userId, setTimeout(() => {
        setTypingUsers(prev => prev.filter(t => t.userId !== userId))
        typingTimeoutsRef.current.delete(userId)
      }, 4000))
    }

    // Reconexión de socket (cambio de pestaña en una tablet, blip de red, el
    // pingTimeout del server, etc.): los rooms de socket.io NO sobreviven a una
    // reconexión — el servidor le asigna un socket.id nuevo y `channel:<id>` queda
    // vacío de este cliente hasta que vuelva a pedir `join-channel`. Sin este
    // re-join, el canal sigue "abierto" en la UI pero deja de recibir chat:message
    // para siempre (el síntoma reportado: "escribo y envío, pero no se ve
    // reflejado ni para mí ni para el otro" — a ambos lados les pasó lo mismo).
    // Además recarga los últimos mensajes para no perder los que se mandaron
    // mientras estuvo desconectado — salvo que esté mirando historial viejo
    // (jumpMode), donde no tiene sentido pisarle la vista de golpe.
    function onConnect() {
      const channelId = activeChannelIdRef.current
      if (!channelId) return
      socket.emit('join-channel', channelId)
      if (jumpModeRef.current) return
      loadMessages(channelId).then(data => {
        if (activeChannelIdRef.current !== channelId) return
        setMessages(data.messages)
        setHasMore(data.hasMore)
        setFirstUnreadMessageId(data.firstUnreadMessageId)
        // El canal sigue abierto y visible — lo que haya llegado mientras estuvo
        // desconectado ya está "leído" en los hechos, mismo criterio que onMessage.
        api.post(`/chat/channels/${channelId}/read`).then(loadChannels).catch(() => {})
      }).catch(() => {})
    }

    socket.on('chat:message', onMessage)
    socket.on('chat:message:edited', onEdited)
    socket.on('chat:message:deleted', onDeleted)
    socket.on('chat:message:pinned', onPinned)
    socket.on('chat:message:reaction', onReaction)
    socket.on('chat:typing', onTyping)
    socket.on('connect', onConnect)
    return () => {
      socket.off('chat:message', onMessage)
      socket.off('chat:message:edited', onEdited)
      socket.off('chat:message:deleted', onDeleted)
      socket.off('chat:message:pinned', onPinned)
      socket.off('chat:message:reaction', onReaction)
      socket.off('chat:typing', onTyping)
      socket.off('connect', onConnect)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadMore() {
    if (!channel || loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    try {
      const data = await loadMessages(channel.id, messages[0].id)
      setMessages(prev => [...data.messages, ...prev])
      setHasMore(data.hasMore)
    } finally {
      setLoadingMore(false)
    }
  }

  // Tocar un mensaje fijado (PinnedBar) o un resultado de búsqueda lleva hasta él dentro
  // del hilo real, en vez de dejarlo solo visible ahí recortado a una línea. Si ya está
  // en la ventana cargada, solo hace falta el scroll; si quedó fuera, se trae el
  // contexto alrededor con `around` y la ventana de mensajes se reemplaza por esa —
  // `jumpMode` queda activo para poder volver después a lo más reciente.
  async function jumpTo(message) {
    if (!channel) return
    if (messages.some(x => x.id === message.id)) {
      scrollToMessage(message.id)
      return
    }
    const data = await loadMessages(channel.id, null, message.id)
    setMessages(data.messages)
    setHasMore(data.hasMore)
    setFirstUnreadMessageId(null)
    setJumpMode(true)
    setJumpToMessageId(message.id)
  }

  async function returnToRecent() {
    if (!channel) return
    const data = await loadMessages(channel.id)
    setMessages(data.messages)
    setHasMore(data.hasMore)
    setFirstUnreadMessageId(data.firstUnreadMessageId)
    setJumpMode(false)
  }

  async function send(content, gifUrl, replyToId) {
    await api.post(`/chat/channels/${channel.id}/messages`, { content, gifUrl, replyToId })
  }

  // Igual que send, sin update optimista — el mensaje llega vía el socket
  // `chat:message` (incluye al emisor). Multipart: campo `file` + `content`
  // (caption opcional) + `replyToId` opcional.
  async function sendMedia(file, caption, replyToId) {
    const form = new FormData()
    form.append('file', file)
    if (caption) form.append('content', caption)
    if (replyToId) form.append('replyToId', replyToId)
    await api.post(`/chat/channels/${channel.id}/messages/media`, form)
  }

  async function saveEdit(messageId, content) {
    await api.patch(`/chat/messages/${messageId}`, { content })
  }

  async function remove(message) {
    if (!window.confirm('¿Eliminar este mensaje?')) return
    await api.delete(`/chat/messages/${message.id}`)
    setMessages(prev => prev.filter(x => x.id !== message.id))
  }

  async function togglePin(message) {
    await api.patch(`/chat/messages/${message.id}/pin`, { pinned: !message.pinnedAt })
  }

  async function toggleReaction(message, emoji) {
    // No actualiza el estado local — igual que saveEdit/togglePin, el propio socket
    // (que incluye al emisor, `io.to(room).emit`) es el que refresca el mensaje.
    await api.post(`/chat/messages/${message.id}/reactions`, { emoji })
  }

  return {
    messages, msgLoading, loadingMore, hasMore, firstUnreadMessageId,
    pinned: pinnedMessages,
    replyingTo, setReplyingTo,
    typingUsers, jumpMode, jumpToMessageId,
    onJumpHandled: () => setJumpToMessageId(null),
    actions: { loadMore, jumpTo, returnToRecent, send, sendMedia, saveEdit, remove, togglePin, toggleReaction },
  }
}
