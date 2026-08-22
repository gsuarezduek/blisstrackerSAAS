import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { connectSocket } from '../../lib/socket'
import LoadingSpinner from '../LoadingSpinner'
import WhatsappConnectForm from './WhatsappConnectForm'
import WhatsappConversationList from './WhatsappConversationList'
import WhatsappMessageList from './WhatsappMessageList'
import WhatsappMessageInput from './WhatsappMessageInput'

const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

function isWindowExpired(conversation) {
  if (!conversation?.lastInboundAt) return true
  return Date.now() - new Date(conversation.lastInboundAt).getTime() > SESSION_WINDOW_MS
}

// Inbox de WhatsApp — Fase 1 del plan: conectar, ver y responder. Todavía no
// está embebido dentro de cada Lead (Fase 2) ni tiene bot (Fase 4); por ahora
// es un tab propio dentro de Ventas, como el resto de las secciones.
export default function WhatsappTab() {
  const { user } = useAuth()
  const [loadingAccount, setLoadingAccount] = useState(true)
  const [account, setAccount] = useState(null)
  const [showConnectForm, setShowConnectForm] = useState(false)

  const [conversations, setConversations] = useState([])
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [activeConversation, setActiveConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const activeIdRef = useRef(null)
  activeIdRef.current = activeId

  const loadAccount = useCallback(async () => {
    setLoadingAccount(true)
    try {
      const { data } = await api.get('/whatsapp/account')
      setAccount(data)
    } finally {
      setLoadingAccount(false)
    }
  }, [])

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true)
    try {
      const { data } = await api.get('/whatsapp/conversations')
      setConversations(data)
    } finally {
      setLoadingConversations(false)
    }
  }, [])

  useEffect(() => { loadAccount() }, [loadAccount])
  useEffect(() => { if (account) loadConversations() }, [account, loadConversations])

  const openConversation = useCallback(async (id) => {
    setActiveId(id)
    setLoadingMessages(true)
    setMessages([])
    try {
      const { data } = await api.get(`/whatsapp/conversations/${id}/messages`)
      setActiveConversation(data.conversation)
      setMessages(data.messages)
      setHasMore(data.hasMore)
      await api.post(`/whatsapp/conversations/${id}/read`)
      loadConversations() // refresca el punto de no-leído en la lista
    } finally {
      setLoadingMessages(false)
    }
  }, [loadConversations])

  const loadMoreMessages = useCallback(async () => {
    if (!activeId || messages.length === 0) return
    setLoadingMore(true)
    try {
      const before = messages[0].id
      const { data } = await api.get(`/whatsapp/conversations/${activeId}/messages`, { params: { before } })
      setMessages(prev => [...data.messages, ...prev])
      setHasMore(data.hasMore)
    } finally {
      setLoadingMore(false)
    }
  }, [activeId, messages])

  const handleSend = useCallback(async (content) => {
    const { data } = await api.post(`/whatsapp/conversations/${activeId}/messages`, { content })
    setMessages(prev => (prev.some(m => m.id === data.id) ? prev : [...prev, data]))
    loadConversations()
  }, [activeId, loadConversations])

  // Tiempo real: un solo listener para todo el tab (no hay concepto de "unirse
  // a un canal" como en el chat interno — WhatsApp emite directo a
  // workspace:<id>, ver backend/src/webhooks/whatsapp.webhook.js).
  useEffect(() => {
    if (!account) return
    const socket = connectSocket()
    if (!socket) return

    function onMessage({ conversationId, message }) {
      if (conversationId === activeIdRef.current) {
        setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]))
        api.post(`/whatsapp/conversations/${conversationId}/read`).catch(() => {})
      }
      loadConversations()
    }
    function onStatus({ waMessageId, status }) {
      setMessages(prev => prev.map(m => (m.waMessageId === waMessageId ? { ...m, status } : m)))
    }

    socket.on('whatsapp:message', onMessage)
    socket.on('whatsapp:status', onStatus)
    return () => {
      socket.off('whatsapp:message', onMessage)
      socket.off('whatsapp:status', onStatus)
    }
  }, [account, loadConversations])

  if (loadingAccount) return <LoadingSpinner size="sm" className="py-10" />

  if (!account) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
        <p className="text-5xl mb-4">💬</p>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Todavía no hay un WhatsApp conectado</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
          {user?.isAdmin
            ? 'Conectá el número del workspace para ver y responder las conversaciones de los leads desde acá.'
            : 'Pedile a un admin del workspace que conecte un número de WhatsApp desde acá.'}
        </p>
        {user?.isAdmin && (
          <button onClick={() => setShowConnectForm(true)} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl">
            Conectar WhatsApp
          </button>
        )}
        {showConnectForm && (
          <WhatsappConnectForm onClose={() => setShowConnectForm(false)} onConnected={(acc) => { setAccount(acc); setShowConnectForm(false) }} />
        )}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
        <span className="text-sm text-gray-600 dark:text-gray-300">
          📞 {account.displayPhoneNumber || account.phoneNumberId}
          {!account.pluginId && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              Falta Plugin ID — no se puede responder
            </span>
          )}
        </span>
        {user?.isAdmin && (
          <div className="flex items-center gap-3">
            <button onClick={() => setShowConnectForm(true)} className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400">
              Editar
            </button>
            <button
              onClick={async () => {
                if (!window.confirm('¿Desconectar este WhatsApp? Se borran también las conversaciones guardadas.')) return
                await api.delete('/whatsapp/account')
                setAccount(null)
                setConversations([])
                setActiveId(null)
              }}
              className="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400"
            >
              Desconectar
            </button>
          </div>
        )}
      </div>
      {showConnectForm && (
        <WhatsappConnectForm
          initialAccount={account}
          onClose={() => setShowConnectForm(false)}
          onConnected={(acc) => { setAccount(acc); setShowConnectForm(false) }}
        />
      )}

      <div className="flex h-[70vh]">
        <div className="w-72 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col">
          {loadingConversations && conversations.length === 0 ? (
            <LoadingSpinner size="sm" className="flex-1 py-10" />
          ) : (
            <WhatsappConversationList conversations={conversations} activeId={activeId} onSelect={openConversation} />
          )}
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {activeId ? (
            <>
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {activeConversation?.contactName || activeConversation?.phoneE164}
                </p>
                {activeConversation?.contactName && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">{activeConversation.phoneE164}</p>
                )}
              </div>
              <WhatsappMessageList messages={messages} loading={loadingMessages} loadingMore={loadingMore} hasMore={hasMore} onLoadMore={loadMoreMessages} />
              <WhatsappMessageInput onSend={handleSend} windowExpired={isWindowExpired(activeConversation)} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">Elegí una conversación para ver los mensajes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
