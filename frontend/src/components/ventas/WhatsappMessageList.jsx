import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import LoadingSpinner from '../LoadingSpinner'

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })
}

function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const sameDay = (a, b) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return 'Hoy'
  if (sameDay(d, yesterday)) return 'Ayer'
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined, timeZone: 'America/Argentina/Buenos_Aires' })
}

// ✓ enviado · ✓✓ entregado · ✓✓ (azul) leído · ⚠️ falló — mismo lenguaje visual
// que WhatsApp, para que el equipo lo lea de un vistazo.
function StatusTicks({ status }) {
  if (status === 'failed') return <span title="Falló el envío">⚠️</span>
  if (status === 'read')   return <span className="text-sky-400" title="Leído">✓✓</span>
  if (status === 'delivered') return <span title="Entregado">✓✓</span>
  return <span title="Enviado">✓</span>
}

// Vista de hilo estilo WhatsApp: burbujas a la derecha (nosotros) / izquierda
// (el lead) — a diferencia del chat interno (MessageList.jsx), acá la
// dirección del mensaje es lo que importa, no quién de nuestro equipo lo
// mandó, así que no hay avatares por mensaje.
export default function WhatsappMessageList({ messages, loading, loadingMore, hasMore, onLoadMore }) {
  const scrollRef = useRef(null)
  const bottomRef = useRef(null)
  const prependAdjustRef = useRef(null)
  const [didInitialScroll, setDidInitialScroll] = useState(false)
  const prevLenRef = useRef(0)

  useEffect(() => {
    if (loading) { setDidInitialScroll(false); return }
    if (didInitialScroll) return
    bottomRef.current?.scrollIntoView()
    setDidInitialScroll(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  useEffect(() => {
    if (!didInitialScroll || prependAdjustRef.current) return
    const el = scrollRef.current
    if (!el) return
    const wasNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    if (messages.length > prevLenRef.current && wasNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevLenRef.current = messages.length
  }, [messages.length, didInitialScroll])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !prependAdjustRef.current) return
    const { scrollHeight, scrollTop } = prependAdjustRef.current
    el.scrollTop = scrollTop + (el.scrollHeight - scrollHeight)
    prependAdjustRef.current = null
  }, [messages])

  function handleScroll() {
    const el = scrollRef.current
    if (!el || loadingMore || !hasMore) return
    if (el.scrollTop < 80) {
      prependAdjustRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop }
      onLoadMore()
    }
  }

  if (loading) return <LoadingSpinner size="sm" className="flex-1 py-10" />

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">Sin mensajes en esta conversación todavía.</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 bg-gray-50 dark:bg-gray-900/40">
      {loadingMore && <LoadingSpinner size="sm" className="py-2" />}
      {messages.map((m, i) => {
        const prev = messages[i - 1]
        const isNewDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt)
        const out = m.direction === 'out'
        return (
          <div key={m.id}>
            {isNewDay && (
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{dayLabel(m.createdAt)}</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>
            )}
            <div className={`flex mb-1.5 ${out ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  out
                    ? 'bg-primary-600 text-white rounded-br-sm'
                    : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-sm'
                }`}
              >
                {out && m.senderType === 'bot' && (
                  <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-75 mb-0.5">🤖 Bot</span>
                )}
                {out && m.senderType === 'user' && m.senderUser && (
                  <span className="block text-[10px] font-semibold opacity-75 mb-0.5">{m.senderUser.name}</span>
                )}
                <p className="whitespace-pre-wrap break-words leading-snug">{m.content}</p>
                <div className={`flex items-center gap-1 justify-end mt-1 text-[10px] ${out ? 'text-primary-100' : 'text-gray-400 dark:text-gray-500'}`}>
                  <span>{timeLabel(m.createdAt)}</span>
                  {out && <StatusTicks status={m.status} />}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
