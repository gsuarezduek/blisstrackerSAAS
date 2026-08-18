import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useChat } from '../../context/ChatContext'
import { connectSocket } from '../../lib/socket'
import LoadingSpinner from '../LoadingSpinner'
import ChannelSwitcher from './ChannelSwitcher'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import ChannelFormModal from './ChannelFormModal'
import PinnedBar from './PinnedBar'
import ChatSoundToggle from './ChatSoundToggle'

// Chat interno como ícono flotante (no una página/sección aparte): mismo botón y
// posición que antes ocupaba FeedbackButton — Feedback queda en standby por ahora
// (FeedbackButton.jsx/FeedbackModal.jsx siguen en el código, solo sin montar).
// Deep-link desde cualquier lugar de la app vía el evento `bliss:open-chat`
// (mismo patrón que GamificationFab con `bliss:open-game`).
export default function ChatWidget() {
  const { user } = useAuth()
  const {
    channels = [], loadChannels, unreadChannelsCount = 0, mentionChannelsCount = 0,
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
  const [pinnedMessages, setPinnedMessages] = useState([])
  const activeChannelIdRef = useRef(null)
  const switcherRef = useRef(null)

  const activeChannel =
    channels.find(c => c.slug === activeSlug) ||
    channels.find(c => c.kind === 'general') ||
    channels[0] ||
    null

  useEffect(() => {
    function handleOpenChat(e) {
      setActiveSlug(e.detail?.slug || null)
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

  const loadMessages = useCallback((channelId, before) => {
    const qs = before ? `?before=${before}` : ''
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

    socket.on('chat:message', onMessage)
    socket.on('chat:message:edited', onEdited)
    socket.on('chat:message:deleted', onDeleted)
    socket.on('chat:message:pinned', onPinned)
    socket.on('chat:message:reaction', onReaction)
    return () => {
      socket.off('chat:message', onMessage)
      socket.off('chat:message:edited', onEdited)
      socket.off('chat:message:deleted', onDeleted)
      socket.off('chat:message:pinned', onPinned)
      socket.off('chat:message:reaction', onReaction)
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

  async function handleSend(content, gifUrl) {
    await api.post(`/chat/channels/${activeChannel.id}/messages`, { content, gifUrl })
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
      {/* Mismo lugar/tamaño que ocupaba el botón de Feedback — ahora abre el Chat */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Chat del equipo"
        className="fixed bottom-24 right-6 z-40 bg-primary-600 hover:bg-primary-700 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-all hover:scale-110"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223 5.99 5.99 0 00-.003 0zm3.196-5.984a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.75a.75.75 0 01-.75-.75v-.008zm2.996 0a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008zm2.996 0a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008z" clipRule="evenodd" />
        </svg>
        {mentionChannelsCount > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none ring-2 ring-white dark:ring-gray-800">
            {mentionChannelsCount > 9 ? '9+' : mentionChannelsCount}
          </span>
        ) : unreadChannelsCount > 0 ? (
          <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-gray-300 ring-2 ring-white dark:ring-gray-800" />
        ) : null}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end sm:pr-6 sm:pb-24">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full sm:w-[400px] mx-4 sm:mx-0 h-[85vh] sm:h-[600px] flex flex-col z-10">
            {!activeChannel ? (
              <LoadingSpinner size="sm" className="flex-1" />
            ) : (
              <>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <div ref={switcherRef} className="relative min-w-0 flex-1">
                    <button
                      onClick={() => setSwitcherOpen(v => !v)}
                      className="flex items-center gap-1 font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors max-w-full"
                    >
                      <span className="truncate">{activeChannel.isPrivate ? '🔒' : '#'} {activeChannel.name}</span>
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
                  <ChatSoundToggle pref={soundPref} onChange={setSoundPref} />
                  <button
                    onClick={() => setOpen(false)}
                    className="text-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 leading-none flex-shrink-0"
                  >
                    ×
                  </button>
                </div>

                {activeChannel.isPrivate && (
                  <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/40 flex-shrink-0">
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">🔒 Canal privado — solo lo ven los administradores.</p>
                  </div>
                )}

                <PinnedBar pinned={pinnedMessages} onUnpin={handleTogglePin} />

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
                  onSaveEdit={handleSaveEdit}
                  onDelete={handleDelete}
                  onTogglePin={handleTogglePin}
                  onToggleReaction={handleToggleReaction}
                />

                <MessageInput onSend={handleSend} members={members} />
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
    </>
  )
}
