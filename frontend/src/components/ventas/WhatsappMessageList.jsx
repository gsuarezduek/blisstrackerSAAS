import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import LoadingSpinner from '../LoadingSpinner'
import { whatsappMediaUrl } from '../../utils/whatsappMediaUrl'

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

function fmtBytes(n) {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Adjunto de un mensaje (Fase 3 del plan) — la url es siempre pública/no
// adivinable, ver whatsappMediaUrl. Documento se muestra como tarjeta con
// ícono + nombre + tamaño y abre en pestaña nueva; el resto se renderiza inline.
function MediaContent({ media }) {
  const url = whatsappMediaUrl(media.id)
  if (media.kind === 'image' || media.kind === 'sticker') {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="" className="rounded-lg max-w-full max-h-64 object-contain mb-1" />
      </a>
    )
  }
  if (media.kind === 'video') {
    return <video controls src={url} className="rounded-lg max-w-full max-h-64 mb-1" />
  }
  if (media.kind === 'audio') {
    return <audio controls src={url} className="max-w-full mb-1" style={{ minWidth: 220 }} />
  }
  // document
  return (
    <a
      href={url} target="_blank" rel="noreferrer"
      className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-lg px-2.5 py-2 mb-1 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
    >
      <span className="text-xl">📄</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium truncate max-w-[180px]">{media.fileName || 'Documento'}</span>
        {media.sizeBytes ? <span className="block text-[10px] opacity-70">{fmtBytes(media.sizeBytes)}</span> : null}
      </span>
    </a>
  )
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
                {m.media && <MediaContent media={m.media} />}
                {m.content && <p className="whitespace-pre-wrap break-words leading-snug">{m.content}</p>}
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
