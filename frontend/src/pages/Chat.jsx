import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { connectSocket } from '../lib/socket'
import ChatSidebar from '../components/chat/ChatSidebar'
import MessageList from '../components/chat/MessageList'
import MessageInput from '../components/chat/MessageInput'
import ChannelFormModal from '../components/chat/ChannelFormModal'

export default function Chat() {
  const { user } = useAuth()
  const { channels, loaded, loadChannels } = useChat()
  const { slug } = useParams()
  const navigate = useNavigate()

  const [members, setMembers] = useState([])
  const [messages, setMessages] = useState([])
  const [msgLoading, setMsgLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState(null)
  const [channelForm, setChannelForm] = useState(null) // null | true (crear) | channel (editar)
  const [sidebarOpen, setSidebarOpen] = useState(false) // mobile
  const activeChannelIdRef = useRef(null)

  useEffect(() => {
    api.get('/workspaces/current/members').then(r => setMembers(r.data.filter(m => m.active))).catch(() => {})
  }, [])

  const activeChannel =
    channels.find(c => c.slug === slug) ||
    channels.find(c => c.kind === 'general') ||
    channels[0] ||
    null

  // Sin slug en la URL: fijar el canal por defecto apenas se conoce.
  useEffect(() => {
    if (!slug && activeChannel) navigate(`/chat/${activeChannel.slug}`, { replace: true })
  }, [slug, activeChannel, navigate])

  const loadMessages = useCallback((channelId, before) => {
    const qs = before ? `?before=${before}` : ''
    return api.get(`/chat/channels/${channelId}/messages${qs}`).then(r => r.data)
  }, [])

  // Cambio de canal: cargar mensajes, marcar leído, unirse a la room del socket.
  useEffect(() => {
    if (!activeChannel) return
    activeChannelIdRef.current = activeChannel.id
    setMsgLoading(true)
    setMessages([])
    setFirstUnreadMessageId(null)

    loadMessages(activeChannel.id).then(data => {
      if (activeChannelIdRef.current !== activeChannel.id) return
      setMessages(data.messages)
      setHasMore(data.hasMore)
      setFirstUnreadMessageId(data.firstUnreadMessageId)
      setMsgLoading(false)
      api.post(`/chat/channels/${activeChannel.id}/read`).then(loadChannels).catch(() => {})
    })

    const socket = connectSocket()
    socket?.emit('join-channel', activeChannel.id)
    return () => socket?.emit('leave-channel', activeChannel.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel?.id])

  // Listeners de tiempo real — se montan una sola vez, filtran por el canal activo actual.
  useEffect(() => {
    const socket = connectSocket()
    if (!socket) return

    function onMessage(m) {
      if (m.channelId !== activeChannelIdRef.current) return
      setMessages(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]))
      // Ya lo estoy viendo: mantener el canal marcado como leído.
      api.post(`/chat/channels/${m.channelId}/read`).then(loadChannels).catch(() => {})
    }
    function onEdited(m) {
      if (m.channelId !== activeChannelIdRef.current) return
      setMessages(prev => prev.map(x => (x.id === m.id ? m : x)))
    }
    function onDeleted({ id, channelId }) {
      if (channelId !== activeChannelIdRef.current) return
      setMessages(prev => prev.filter(x => x.id !== id))
    }

    socket.on('chat:message', onMessage)
    socket.on('chat:message:edited', onEdited)
    socket.on('chat:message:deleted', onDeleted)
    return () => {
      socket.off('chat:message', onMessage)
      socket.off('chat:message:edited', onEdited)
      socket.off('chat:message:deleted', onDeleted)
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

  function handleSelectChannel(channel) {
    setSidebarOpen(false)
    navigate(`/chat/${channel.slug}`)
  }

  function handleChannelSaved(channel) {
    setChannelForm(null)
    loadChannels().then(() => navigate(`/chat/${channel.slug}`))
  }

  function handleChannelDeleted() {
    setChannelForm(null)
    loadChannels()
    navigate('/chat')
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="flex-1 flex overflow-hidden max-w-6xl w-full mx-auto border-x border-gray-100 dark:border-gray-800">
        {/* Sidebar — colapsable en mobile */}
        <div className={`${sidebarOpen ? 'block' : 'hidden'} md:block absolute md:relative inset-0 md:inset-auto z-30 md:z-auto bg-gray-50 dark:bg-gray-900 md:bg-transparent`}>
          {!loaded ? (
            <div className="w-56"><LoadingSpinner size="sm" className="py-10" /></div>
          ) : (
            <ChatSidebar
              channels={channels}
              activeChannelId={activeChannel?.id}
              onSelect={handleSelectChannel}
              isAdmin={!!user?.isAdmin}
              onCreateChannel={() => setChannelForm(true)}
            />
          )}
        </div>

        {/* Ventana del canal */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900">
          {!activeChannel ? (
            <LoadingSpinner size="sm" className="flex-1" />
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                <button
                  onClick={() => setSidebarOpen(v => !v)}
                  className="md:hidden p-1.5 -ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ☰
                </button>
                <div className="min-w-0">
                  <h1 className="font-semibold text-gray-900 dark:text-white truncate"># {activeChannel.name}</h1>
                  {activeChannel.description && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{activeChannel.description}</p>
                  )}
                </div>
                {user?.isAdmin && activeChannel.kind === 'custom' && (
                  <button
                    onClick={() => setChannelForm(activeChannel)}
                    className="ml-auto p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    title="Editar canal"
                  >
                    ⚙️
                  </button>
                )}
              </div>

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
              />

              <MessageInput onSend={handleSend} members={members} />
            </>
          )}
        </div>
      </div>

      {channelForm && (
        <ChannelFormModal
          channel={channelForm === true ? null : channelForm}
          onClose={() => setChannelForm(null)}
          onSaved={handleChannelSaved}
          onDeleted={handleChannelDeleted}
        />
      )}
    </div>
  )
}
