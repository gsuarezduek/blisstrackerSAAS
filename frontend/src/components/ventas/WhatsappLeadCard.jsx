import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../api/client'
import { useFeatureFlag } from '../../hooks/useFeatureFlag'
import useMembers from '../../hooks/useMembers'
import { connectSocket } from '../../lib/socket'
import WhatsappMessageList from './WhatsappMessageList'
import WhatsappMessageInput from './WhatsappMessageInput'
import WhatsappBotToggle from './WhatsappBotToggle'

const card = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden'
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

function isWindowExpired(conversation) {
  if (!conversation?.lastInboundAt) return true
  return Date.now() - new Date(conversation.lastInboundAt).getTime() > SESSION_WINDOW_MS
}

// Card autocontenida (mismo patrón que ResearchPanel/ProposalsPanel) que
// embebe la conversación de WhatsApp del contacto principal del lead — reusa
// tal cual el panel de mensajes de Fase 1 (WhatsappMessageList/Input), solo
// agrega la resolución lead → conversación y el responsable puntual (Fase 2
// del plan de WhatsApp). Requiere el feature flag `whatsapp` propio, además
// de `ventas` (ya validado por la página que renderiza a LeadDetail).
export default function WhatsappLeadCard({ leadId, lead, onChanged }) {
  const { enabled } = useFeatureFlag('whatsapp')
  const { members } = useMembers()

  const [loading, setLoading] = useState(true)
  const [hasAccount, setHasAccount] = useState(false)
  const [contact, setContact] = useState(null)
  const [conversation, setConversation] = useState(null)
  const [botConfig, setBotConfig] = useState(null)

  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const conversationIdRef = useRef(null)
  conversationIdRef.current = conversation?.id || null

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    setLoading(true)
    try {
      const { data } = await api.get(`/ventas/leads/${leadId}/whatsapp`)
      setHasAccount(data.hasAccount)
      setContact(data.contact)
      setConversation(data.conversation)
      if (data.hasAccount) api.get('/whatsapp/bot').then(({ data: bc }) => setBotConfig(bc)).catch(() => {})
    } finally {
      setLoading(false)
    }
  }, [leadId, enabled])

  useEffect(() => { load() }, [load])

  const loadMessages = useCallback(async (conversationId) => {
    setLoadingMessages(true)
    try {
      const { data } = await api.get(`/whatsapp/conversations/${conversationId}/messages`)
      setMessages(data.messages)
      setHasMore(data.hasMore)
      await api.post(`/whatsapp/conversations/${conversationId}/read`)
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  useEffect(() => {
    if (conversation?.id) loadMessages(conversation.id)
  }, [conversation?.id, loadMessages])

  const loadMoreMessages = useCallback(async () => {
    if (!conversation?.id || messages.length === 0) return
    setLoadingMore(true)
    try {
      const before = messages[0].id
      const { data } = await api.get(`/whatsapp/conversations/${conversation.id}/messages`, { params: { before } })
      setMessages(prev => [...data.messages, ...prev])
      setHasMore(data.hasMore)
    } finally {
      setLoadingMore(false)
    }
  }, [conversation?.id, messages])

  const handleSend = useCallback(async (content) => {
    const { data } = await api.post(`/whatsapp/conversations/${conversation.id}/messages`, { content })
    setMessages(prev => (prev.some(m => m.id === data.id) ? prev : [...prev, data]))
    onChanged?.() // refresca el timeline del lead (quedó una entrada liviana del mensaje)
  }, [conversation?.id, onChanged])

  // Adjuntos (Fase 3 del plan) — multipart, campo `file` + `caption` opcional.
  const handleSendMedia = useCallback(async (file, caption) => {
    const form = new FormData()
    form.append('file', file)
    if (caption) form.append('caption', caption)
    const { data } = await api.post(`/whatsapp/conversations/${conversation.id}/media`, form)
    setMessages(prev => (prev.some(m => m.id === data.id) ? prev : [...prev, data]))
    onChanged?.()
  }, [conversation?.id, onChanged])

  // Reabrir con plantilla (Fase 5 del plan) — único envío posible con la
  // ventana de 24hs vencida.
  const handleReopen = useCallback(async (templateId, variables) => {
    const { data } = await api.post(`/whatsapp/conversations/${conversation.id}/reopen`, { templateId, variables })
    setMessages(prev => (prev.some(m => m.id === data.id) ? prev : [...prev, data]))
    onChanged?.()
  }, [conversation?.id, onChanged])

  async function reassign(e) {
    const userId = e.target.value || null
    setAssigning(true)
    try {
      const { data } = await api.patch(`/whatsapp/conversations/${conversation.id}/assign`, { userId })
      setConversation(c => ({ ...c, assignedToId: data.assignedToId, assignedTo: data.assignedTo }))
    } finally {
      setAssigning(false)
    }
  }

  // Tiempo real: un solo listener acotado a la conversación de este lead
  // (mismo patrón que WhatsappTab, pero sin la lista de conversaciones).
  useEffect(() => {
    if (!conversation?.id) return
    const socket = connectSocket()
    if (!socket) return

    function onMessage({ conversationId, message }) {
      if (conversationId !== conversationIdRef.current) return
      setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]))
      api.post(`/whatsapp/conversations/${conversationId}/read`).catch(() => {})
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
  }, [conversation?.id])

  if (!enabled || loading || !hasAccount) return null

  const assignedToId = conversation?.assignedToId || lead?.ownerId || ''
  const activeMembers = members.filter(m => m.active)

  return (
    <div className={card}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">💬 WhatsApp</h3>
        {conversation && (
          <div className="flex items-center gap-2">
            <WhatsappBotToggle
              conversationId={conversation.id}
              botEnabled={conversation.botEnabled}
              workspaceBotEnabled={botConfig?.enabled}
              onChanged={(botEnabled) => setConversation(c => ({ ...c, botEnabled }))}
            />
            <select
              value={assignedToId}
              onChange={reassign}
              disabled={assigning}
              title="Responsable de esta conversación"
              className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 disabled:opacity-50"
            >
              <option value="">Sin asignar</option>
              {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {!conversation ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 px-5 py-4">
          {contact
            ? `${contact.name} todavía no escribió por WhatsApp.`
            : 'Este lead no tiene un contacto con teléfono vinculado — no hay con qué matchear una conversación de WhatsApp.'}
        </p>
      ) : (
        <div className="flex flex-col h-96">
          <WhatsappMessageList messages={messages} loading={loadingMessages} loadingMore={loadingMore} hasMore={hasMore} onLoadMore={loadMoreMessages} />
          <WhatsappMessageInput onSend={handleSend} onSendMedia={handleSendMedia} onReopen={handleReopen} windowExpired={isWindowExpired(conversation)} />
        </div>
      )}
    </div>
  )
}
