import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import api from '../api/client'
import { useAuth } from './AuthContext'
import { connectSocket, disconnectSocket } from '../lib/socket'
import { getChatSoundPref, setChatSoundPref, playChatNotificationSound } from '../lib/chatSound'

const ChatContext = createContext(null)

// Único punto que trae la lista de canales + no-leídos/menciones y mantiene el
// socket vivo — Navbar (badge) y la página de Chat (sidebar) leen de acá en vez
// de duplicar el fetch cada uno. También decide cuándo sonar una notificación
// (preferencia `soundPref`, ver lib/chatSound.js) — vive acá y no en ChatWidget
// porque es el único lugar que escucha los eventos de socket sin importar si el
// panel del chat está abierto ni en qué canal.
export function ChatProvider({ children }) {
  const { user } = useAuth()
  const [channels, setChannels] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [soundPref, setSoundPrefState] = useState(() => getChatSoundPref(user?.id))
  const channelsRef = useRef(channels)
  const soundPrefRef = useRef(soundPref)

  useEffect(() => { channelsRef.current = channels }, [channels])
  useEffect(() => { soundPrefRef.current = soundPref }, [soundPref])
  useEffect(() => { setSoundPrefState(getChatSoundPref(user?.id)) }, [user?.id])

  const setSoundPref = useCallback((value) => {
    if (!user?.id) return
    setChatSoundPref(user.id, value)
    setSoundPrefState(value)
  }, [user?.id])

  const loadChannels = useCallback(() => {
    return api.get('/chat/channels').then(r => setChannels(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) {
      disconnectSocket()
      setChannels([])
      setLoaded(false)
      return
    }

    loadChannels().finally(() => setLoaded(true))

    const socket = connectSocket()
    if (!socket) return

    // No hace falta parchear el estado a mano: cualquier evento relevante
    // simplemente re-trae la lista de canales (liviana, decenas de filas).
    const refresh = () => loadChannels()

    // `chat:unread` llega para TODO mensaje nuevo del workspace (no solo el
    // canal abierto) con { channelId, authorId } — es la señal para el modo
    // "favoritos": suena si el canal es de un proyecto destacado y no es propio.
    function onUnread({ channelId, authorId } = {}) {
      loadChannels()
      if (soundPrefRef.current !== 'favorites' || !authorId || authorId === user.id) return
      const channel = channelsRef.current.find(c => c.id === channelId)
      if (channel?.starred) playChatNotificationSound()
    }

    // `notification:new` con type CHAT_MENTION solo llega al room privado de
    // cada usuario mencionado (el propio autor nunca se auto-menciona) — es la
    // señal para el modo "solo menciones".
    function onNotificationNew(payload) {
      loadChannels()
      if (soundPrefRef.current === 'mentions' && payload?.type === 'CHAT_MENTION') {
        playChatNotificationSound()
      }
    }

    socket.on('chat:message', refresh)
    socket.on('chat:unread', onUnread)
    socket.on('chat:read', refresh)
    socket.on('notification:new', onNotificationNew)
    socket.on('connect', refresh) // reconciliar tras una reconexión

    return () => {
      socket.off('chat:message', refresh)
      socket.off('chat:unread', onUnread)
      socket.off('chat:read', refresh)
      socket.off('notification:new', onNotificationNew)
      socket.off('connect', refresh)
    }
  }, [user?.id, loadChannels])

  const unreadChannelsCount = channels.filter(c => c.unreadCount > 0).length
  const mentionChannelsCount = channels.filter(c => c.mentionCount > 0).length

  return (
    <ChatContext.Provider value={{
      channels, loaded, loadChannels,
      unreadChannelsCount, mentionChannelsCount,
      hasMentions: mentionChannelsCount > 0,
      hasUnread: unreadChannelsCount > 0,
      soundPref, setSoundPref,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export const useChat = () => useContext(ChatContext)
