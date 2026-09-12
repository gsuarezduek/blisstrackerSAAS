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
    channels = [], loadChannels,
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
    setReplyingTo(null)

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

  async function handleSend(content, gifUrl, replyToId) {
    await api.post(`/chat/channels/${activeChannel.id}/messages`, { content, gifUrl, replyToId })
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
                  members={members}
                  onSaveEdit={handleSaveEdit}
                  onDelete={handleDelete}
                  onTogglePin={handleTogglePin}
                  onToggleReaction={handleToggleReaction}
                  onReply={setReplyingTo}
                />

                <MessageInput
                  onSend={handleSend}
                  members={members}
                  replyingTo={replyingTo}
                  onCancelReply={() => setReplyingTo(null)}
                />
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
