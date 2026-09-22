import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import { connectSocket } from '../../lib/socket'
import LoadingSpinner from '../LoadingSpinner'
import ChannelSwitcher from './ChannelSwitcher'
import MessageList, { scrollToMessage } from './MessageList'
import MessageInput from './MessageInput'
import ChannelFormModal from './ChannelFormModal'
import PinnedBar from './PinnedBar'
import VoiceRoomBar from './VoiceRoomBar'
import ChannelSearch from './ChannelSearch'
import ChatSoundToggle from './ChatSoundToggle'
import FeedbackModal from '../FeedbackModal'

// Panel de Chat interno (no una página/sección aparte) — sin botón propio, es
// FloatingDock (frontend/src/components/FloatingDock.jsx) quien decide cuándo
// mostrar el trigger y el badge (vía useChat, mismo hook que consume este
// componente). Feedback queda en standby por ahora (FeedbackButton.jsx sigue en
// el código sin montar; FeedbackModal.jsx se abre desde ChannelSwitcher).
// Deep-link desde cualquier lugar de la app vía el evento `bliss:open-chat`
// (mismo patrón que GamificationFab con `bliss:open-game`).
export default function ChatWidget() {
  const { user } = useAuth()
  const {
    channels = [], loaded = false, loadChannels,
    soundPref = 'mentions', setSoundPref = () => {},
  } = useChat() || {}

  const [open, setOpen] = useState(false)
  const [activeSlug, setActiveSlug] = useState(null)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [members, setMembers] = useState([])
  const [messages, setMessages] = useState([])
  const [msgLoading, setMsgLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(null)
  const [channelForm, setChannelForm] = useState(null) // null | true (crear) | channel (editar)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState([])
  const [replyingTo, setReplyingTo] = useState(null)
  const [jumpToMessageId, setJumpToMessageId] = useState(null)
  const [jumpMode, setJumpMode] = useState(false) // true = la ventana cargada quedó "parada" en un mensaje del pasado (via around), no en lo más reciente
  const [typingUsers, setTypingUsers] = useState([]) // [{userId, name}] — solo del canal activo, efímero
  const [searchOpen, setSearchOpen] = useState(false)
  const activeChannelIdRef = useRef(null)
  const jumpModeRef = useRef(false) // espejo de jumpMode, para leerlo dentro del listener estable de onConnect
  const switcherRef = useRef(null)
  const typingTimeoutsRef = useRef(new Map()) // userId -> timeout, para ocultar solo si no llegó otro evento suyo

  useEffect(() => { jumpModeRef.current = jumpMode }, [jumpMode])

  // Sin fallback a #general/primero: si no hay un canal elegido en la sesión,
  // activeChannel queda null y se muestra el listado completo (ver más abajo) en vez
  // de caer directo a un canal que la mayoría de las veces no es al que se quiere ir.
  const activeChannel = activeSlug ? channels.find(c => c.slug === activeSlug) || null : null

  useEffect(() => {
    function handleOpenChat(e) {
      // Un deep-link con slug (mención, botón "Chat" de un proyecto, volver a la
      // llamada de voz) va directo a ese canal. Sin slug (ícono del dock), NO se
      // toca activeSlug — se mantiene el último canal elegido en la sesión, o el
      // listado completo si todavía no se eligió ninguno.
      if (e.detail?.slug) setActiveSlug(e.detail.slug)
      setOpen(true)
    }
    window.addEventListener('bliss:open-chat', handleOpenChat)
    return () => window.removeEventListener('bliss:open-chat', handleOpenChat)
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) setSwitcherOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!open || members.length) return
    api.get('/workspaces/current/members').then(r => setMembers(r.data.filter(m => m.active))).catch(() => {})
  }, [open, members.length])

  const loadMessages = useCallback((channelId, before, around) => {
    const qs = around ? `?around=${around}` : before ? `?before=${before}` : ''
    return api.get(`/chat/channels/${channelId}/messages${qs}`).then(r => r.data)
  }, [])

  const loadPinned = useCallback((channelId) => {
    return api.get(`/chat/channels/${channelId}/pinned`).then(r => setPinnedMessages(r.data)).catch(() => setPinnedMessages([]))
  }, [])

  // Cambio de canal (con el panel abierto): cargar mensajes, marcar leído, unirse a la room del socket.
  useEffect(() => {
    if (!open || !activeChannel) return
    activeChannelIdRef.current = activeChannel.id
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
    setSearchOpen(false)

    loadMessages(activeChannel.id).then(data => {
      if (activeChannelIdRef.current !== activeChannel.id) return
      setMessages(data.messages)
      setHasMore(data.hasMore)
      setFirstUnreadMessageId(data.firstUnreadMessageId)
      setMsgLoading(false)
      api.post(`/chat/channels/${activeChannel.id}/read`).then(loadChannels).catch(() => {})
    })
    loadPinned(activeChannel.id)

    const socket = connectSocket()
    socket?.emit('join-channel', activeChannel.id)
    return () => socket?.emit('leave-channel', activeChannel.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeChannel?.id])

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

  async function handleLoadMore() {
    if (!activeChannel || loadingMore || !hasMore || messages.length === 0) return
    setLoadingMore(true)
    try {
      const data = await loadMessages(activeChannel.id, messages[0].id)
      setMessages(prev => [...data.messages, ...prev])
      setHasMore(data.hasMore)
    } finally {
      setLoadingMore(false)
    }
  }

  // Tocar un mensaje fijado (PinnedBar) lleva hasta él dentro del hilo real, en vez de
  // dejarlo solo visible ahí recortado a una línea. Si ya está en la ventana cargada,
  // solo hace falta el scroll; si quedó fuera (fijado hace tiempo), se trae el contexto
  // alrededor con `around` y la ventana de mensajes se reemplaza por esa — `jumpMode`
  // queda activo para poder volver después a lo más reciente.
  async function handleJumpToMessage(message) {
    if (messages.some(x => x.id === message.id)) {
      scrollToMessage(message.id)
      return
    }
    const data = await loadMessages(activeChannel.id, null, message.id)
    setMessages(data.messages)
    setHasMore(data.hasMore)
    setFirstUnreadMessageId(null)
    setJumpMode(true)
    setJumpToMessageId(message.id)
  }

  async function handleReturnToRecent() {
    if (!activeChannel) return
    const data = await loadMessages(activeChannel.id)
    setMessages(data.messages)
    setHasMore(data.hasMore)
    setFirstUnreadMessageId(data.firstUnreadMessageId)
    setJumpMode(false)
  }

  async function handleSend(content, gifUrl, replyToId) {
    await api.post(`/chat/channels/${activeChannel.id}/messages`, { content, gifUrl, replyToId })
  }

  // Igual que handleSend, sin update optimista — el mensaje llega vía el socket
  // `chat:message` (incluye al emisor). Multipart: campo `file` + `content`
  // (caption opcional) + `replyToId` opcional.
  async function handleSendMedia(file, caption, replyToId) {
    const form = new FormData()
    form.append('file', file)
    if (caption) form.append('content', caption)
    if (replyToId) form.append('replyToId', replyToId)
    await api.post(`/chat/channels/${activeChannel.id}/messages/media`, form)
  }

  async function handleSaveEdit(messageId, content) {
    await api.patch(`/chat/messages/${messageId}`, { content })
  }

  async function handleDelete(message) {
    if (!window.confirm('¿Eliminar este mensaje?')) return
    await api.delete(`/chat/messages/${message.id}`)
    setMessages(prev => prev.filter(x => x.id !== message.id))
  }

  async function handleTogglePin(message) {
    await api.patch(`/chat/messages/${message.id}/pin`, { pinned: !message.pinnedAt })
  }

  async function handleToggleReaction(message, emoji) {
    // No actualiza el estado local — igual que handleSaveEdit/handleTogglePin, el propio
    // socket (que incluye al emisor, `io.to(room).emit`) es el que refresca el mensaje.
    await api.post(`/chat/messages/${message.id}/reactions`, { emoji })
  }

  async function handleTogglePrivacy() {
    if (!activeChannel) return
    const isPrivate = !activeChannel.isPrivate
    try {
      await api.patch(`/chat/channels/${activeChannel.id}/privacy`, { isPrivate })
      await loadChannels()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo actualizar la privacidad del canal')
    }
  }

  function handleSelectChannel(channel) {
    setSwitcherOpen(false)
    setActiveSlug(channel.slug)
  }

  function handleChannelSaved(channel) {
    setChannelForm(null)
    loadChannels().then(() => setActiveSlug(channel.slug))
  }

  function handleChannelDeleted() {
    setChannelForm(null)
    loadChannels()
    setActiveSlug(null)
  }

  if (!user) return null

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end sm:pr-6 sm:pb-24">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full sm:w-[400px] mx-4 sm:mx-0 h-[85vh] sm:h-[600px] flex flex-col z-10">
            {!loaded ? (
              <LoadingSpinner size="sm" className="flex-1" />
            ) : !activeChannel ? (
              <>
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Chat</h3>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 leading-none flex-shrink-0"
                  >
                    ×
                  </button>
                </div>
                <ChannelSwitcher
                  fullscreen
                  channels={channels}
                  activeChannelId={null}
                  onSelect={handleSelectChannel}
                  isAdmin={!!user?.isAdmin}
                  onCreateChannel={() => setChannelForm(true)}
                  onFeedback={() => setFeedbackOpen(true)}
                />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <button
                    onClick={() => setActiveSlug(null)}
                    title="Ver todos los canales"
                    className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
                  >
                    ☰
                  </button>
                  <div ref={switcherRef} className="relative min-w-0 flex-1">
                    <button
                      onClick={() => setSwitcherOpen(v => !v)}
                      className="flex items-center gap-1 font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors max-w-full"
                    >
                      <span className="truncate">{activeChannel.isPrivate ? '🔒' : activeChannel.medium === 'voice' ? '🔊' : '#'} {activeChannel.name}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                        className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${switcherOpen ? 'rotate-180' : ''}`}>
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {switcherOpen && (
                      <ChannelSwitcher
                        channels={channels}
                        activeChannelId={activeChannel.id}
                        onSelect={handleSelectChannel}
                        isAdmin={!!user?.isAdmin}
                        onCreateChannel={() => { setSwitcherOpen(false); setChannelForm(true) }}
                        onFeedback={() => { setSwitcherOpen(false); setFeedbackOpen(true) }}
                      />
                    )}
                  </div>
                  {user?.isAdmin && activeChannel.kind === 'custom' && (
                    <button
                      onClick={() => setChannelForm(activeChannel)}
                      title="Editar canal"
                      className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
                    >
                      ⚙️
                    </button>
                  )}
                  {user?.isAdmin && (
                    <button
                      onClick={handleTogglePrivacy}
                      title={activeChannel.isPrivate ? 'Canal privado — clic para abrirlo a todo el equipo' : 'Canal abierto — clic para hacerlo privado (solo administradores)'}
                      className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
                    >
                      {activeChannel.isPrivate ? '🔒' : '🔓'}
                    </button>
                  )}
                  <button
                    onClick={() => setSearchOpen(true)}
                    title="Buscar en este canal"
                    className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
                  >
                    🔍
                  </button>
                  <ChatSoundToggle pref={soundPref} onChange={setSoundPref} />
                  <button
                    onClick={() => setOpen(false)}
                    className="text-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 leading-none flex-shrink-0"
                  >
                    ×
                  </button>
                </div>

                {searchOpen ? (
                  <ChannelSearch channelId={activeChannel.id} onClose={() => setSearchOpen(false)} />
                ) : (
                  <>
                {activeChannel.isPrivate && (
                  <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/40 flex-shrink-0">
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">🔒 Canal privado — solo lo ven los administradores.</p>
                  </div>
                )}

                {activeChannel.medium === 'voice' && <VoiceRoomBar channel={activeChannel} />}

                <PinnedBar pinned={pinnedMessages} onUnpin={handleTogglePin} onJump={handleJumpToMessage} />

                <div className="relative flex-1 min-h-0 flex flex-col">
                  <MessageList
                    key={activeChannel.id}
                    messages={messages}
                    loading={msgLoading}
                    loadingMore={loadingMore}
                    hasMore={hasMore}
                    onLoadMore={handleLoadMore}
                    firstUnreadMessageId={firstUnreadMessageId}
                    currentUserId={user?.id}
                    canModerate={!!user?.isAdmin}
                    members={members}
                    projectId={activeChannel.projectId}
                    onSaveEdit={handleSaveEdit}
                    onDelete={handleDelete}
                    onTogglePin={handleTogglePin}
                    onToggleReaction={handleToggleReaction}
                    onReply={setReplyingTo}
                    jumpToMessageId={jumpToMessageId}
                    onJumpHandled={() => setJumpToMessageId(null)}
                  />
                  {jumpMode && (
                    <button
                      onClick={handleReturnToRecent}
                      className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-medium bg-gray-800/90 dark:bg-gray-700/90 text-white px-3 py-1.5 rounded-full shadow-lg hover:bg-gray-900 dark:hover:bg-gray-600 transition-colors"
                    >
                      ↓ Volver a mensajes recientes
                    </button>
                  )}
                </div>

                {typingUsers.length > 0 && (
                  <p className="px-4 pt-1 text-xs italic text-gray-400 dark:text-gray-500 flex-shrink-0">
                    {typingUsers.length === 1
                      ? `${typingUsers[0].name} está escribiendo...`
                      : typingUsers.length === 2
                        ? `${typingUsers[0].name} y ${typingUsers[1].name} están escribiendo...`
                        : 'Varias personas están escribiendo...'}
                  </p>
                )}

                <MessageInput
                  onSend={handleSend}
                  onSendMedia={handleSendMedia}
                  members={members}
                  replyingTo={replyingTo}
                  onCancelReply={() => setReplyingTo(null)}
                  channelId={activeChannel.id}
                  projectId={activeChannel.projectId}
                />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {channelForm && (
        <ChannelFormModal
          channel={channelForm === true ? null : channelForm}
          onClose={() => setChannelForm(null)}
          onSaved={handleChannelSaved}
          onDeleted={handleChannelDeleted}
        />
      )}

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  )
}
