import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api/client'
import { useAuth } from './AuthContext'
import { connectSocket, disconnectSocket } from '../lib/socket'

const ChatContext = createContext(null)

// Único punto que trae la lista de canales + no-leídos/menciones y mantiene el
// socket vivo — Navbar (badge) y la página de Chat (sidebar) leen de acá en vez
// de duplicar el fetch cada uno.
export function ChatProvider({ children }) {
  const { user } = useAuth()
  const [channels, setChannels] = useState([])
  const [loaded, setLoaded] = useState(false)

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
    socket.on('chat:message', refresh)
    socket.on('chat:unread', refresh)
    socket.on('chat:read', refresh)
    socket.on('notification:new', refresh)
    socket.on('connect', refresh) // reconciliar tras una reconexión

    return () => {
      socket.off('chat:message', refresh)
      socket.off('chat:unread', refresh)
      socket.off('chat:read', refresh)
      socket.off('notification:new', refresh)
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
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export const useChat = () => useContext(ChatContext)
