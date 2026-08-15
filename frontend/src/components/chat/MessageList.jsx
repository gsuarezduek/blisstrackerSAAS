import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { avatarUrl } from '../../utils/avatarUrl'
import UserLink from '../UserLink'
import LoadingSpinner from '../LoadingSpinner'
import { renderMessageText } from './messageText'
import MessageReactionPicker from './MessageReactionPicker'
import { groupReactions } from './reactions'

const GROUP_WINDOW_MS = 5 * 60 * 1000

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

function sameGroup(a, b) {
  return a.authorId === b.authorId && (new Date(b.createdAt) - new Date(a.createdAt)) < GROUP_WINDOW_MS
}

export default function MessageList({
  messages, loading, loadingMore, hasMore, onLoadMore,
  firstUnreadMessageId, currentUserId, canModerate,
  onSaveEdit, onDelete, onTogglePin, onToggleReaction,
}) {
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const bottomRef = useRef(null)
  const stickToBottomRef = useRef(true)
  const [didInitialScroll, setDidInitialScroll] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [reactingId, setReactingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')

  function startEdit(m) {
    setMenuOpenId(null)
    setEditingId(m.id)
    setEditValue(m.content || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValue('')
  }

  async function commitEdit(id) {
    const value = editValue.trim()
    if (!value) return
    await onSaveEdit(id, value)
    setEditingId(null)
    setEditValue('')
  }

  // Al entrar al canal: ir siempre al final (últimos mensajes), sin importar si hay no
  // leídos — el divisor rojo "No leídos" se sigue mostrando en su lugar (más arriba en
  // el scroll) como referencia, pero ya no salta ahí automáticamente.
  // Se re-arma cada vez que arranca una carga nueva (loading=true): al reabrir el panel
  // o cambiar de canal, este componente puede montar/renderizar un instante con el
  // `messages`/`loading` que ChatWidget todavía no actualizó (quedan del canal anterior)
  // antes de que dispare la recarga real — sin el re-arme, ese render transitorio
  // consumía el flag y el scroll-al-final ya no se repetía cuando llegaban los mensajes
  // correctos, dejando la vista al principio del canal en vez de al final.
  useEffect(() => {
    if (loading) {
      setDidInitialScroll(false)
      return
    }
    if (didInitialScroll) return
    bottomRef.current?.scrollIntoView()
    setDidInitialScroll(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Autoscroll al fondo cuando llega un mensaje nuevo, solo si ya estábamos abajo
  // (si el usuario subió a buscar "no leídos" o hizo scroll-back, no lo interrumpe).
  const prevLenRef = useRef(0)
  const prependAdjustRef = useRef(null)
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

  // Al cargar más mensajes hacia arriba, mantener fija la posición visual (si no,
  // el navegador conserva el scrollTop en píxeles y el usuario "salta" a leer
  // mensajes mucho más viejos de golpe).
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !prependAdjustRef.current) return
    const { scrollHeight, scrollTop } = prependAdjustRef.current
    el.scrollTop = scrollTop + (el.scrollHeight - scrollHeight)
    prependAdjustRef.current = null
  }, [messages])

  // Contenido que crece DESPUÉS del scroll inicial (típicamente un GIF: el <img> no
  // tiene ancho/alto fijo, así que recién empuja el layout cuando termina de descargar)
  // deja la vista "a mitad de camino" en vez de al final, aunque ya habíamos scrolleado
  // al fondo. Mientras estemos pegados al final, cualquier crecimiento del contenido nos
  // vuelve a pegar ahí — no interfiere con la carga de mensajes viejos hacia arriba
  // porque ahí `stickToBottomRef` ya es false (para eso hay que estar scrolleado arriba).
  // `contentRef` solo existe en el DOM una vez que se pasó de la pantalla de carga al
  // listado real (early-return de arriba) — por eso este efecto se re-arma cuando cambia
  // `loading` o cuando el canal pasa de "sin mensajes" a "con mensajes" (mismo motivo:
  // esas dos ramas usan JSX sin `contentRef`), y no depende de `[]` a secas.
  useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (prependAdjustRef.current || !stickToBottomRef.current) return
      bottomRef.current?.scrollIntoView()
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [loading, messages.length === 0])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    if (loadingMore || !hasMore) return
    if (el.scrollTop < 80) {
      prependAdjustRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop }
      onLoadMore()
    }
  }

  if (loading) return <LoadingSpinner size="sm" className="flex-1 py-10" />

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">Sin mensajes todavía. Sé el primero en escribir.</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3">
      {loadingMore && <LoadingSpinner size="sm" className="py-2" />}
      <div ref={contentRef}>
      {messages.map((m, i) => {
        const prev = messages[i - 1]
        const isNewDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt)
        const grouped = !isNewDay && prev && sameGroup(prev, m)
        const isUnreadDivider = firstUnreadMessageId && m.id === firstUnreadMessageId
        const canEdit = m.authorId === currentUserId
        const canDelete = canEdit || canModerate

        return (
          <div key={m.id} id={`chat-msg-${m.id}`}>
            {isNewDay && (
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{dayLabel(m.createdAt)}</span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>
            )}
            {isUnreadDivider && (
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-red-300 dark:bg-red-700" />
                <span className="text-xs font-semibold text-red-500 dark:text-red-400">No leídos</span>
                <div className="flex-1 h-px bg-red-300 dark:bg-red-700" />
              </div>
            )}
            <div
              className={`group flex items-start gap-3 rounded-lg px-2 -mx-2 hover:bg-gray-50 dark:hover:bg-gray-800/60 ${grouped ? 'py-0.5' : 'py-1.5'}`}
            >
              {grouped ? (
                <span className="w-9 flex-shrink-0 text-[10px] text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 pt-1 text-right">
                  {timeLabel(m.createdAt)}
                </span>
              ) : (
                <UserLink userId={m.author.id} className="flex-shrink-0">
                  <img
                    src={avatarUrl(m.author.avatar)}
                    alt={m.author.name}
                    className="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                  />
                </UserLink>
              )}
              <div className="flex-1 min-w-0">
                {!grouped && (
                  <div className="flex items-baseline gap-2">
                    <UserLink userId={m.author.id} className="text-sm font-semibold text-gray-800 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400">
                      {m.author.name}
                    </UserLink>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{timeLabel(m.createdAt)}</span>
                    {m.pinnedAt && (
                      <span title={m.pinnedBy ? `Fijado por ${m.pinnedBy.name}` : 'Fijado'} className="text-xs text-amber-500 dark:text-amber-400">📌</span>
                    )}
                  </div>
                )}
                {editingId === m.id ? (
                  <div className="mt-0.5">
                    <textarea
                      autoFocus
                      rows={2}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(m.id) }
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-primary-300 dark:border-primary-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <button onClick={() => commitEdit(m.id)} className="text-xs px-2.5 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-md font-medium">Guardar</button>
                      <button onClick={cancelEdit} className="text-xs px-2.5 py-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cancelar</button>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500">Enter para guardar · Esc para cancelar</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {m.content && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug whitespace-pre-wrap break-words">
                        {renderMessageText(m.content)}
                        {m.editedAt && <span className="text-[11px] text-gray-400 dark:text-gray-500 ml-1">(editado)</span>}
                      </p>
                    )}
                    {m.gifUrl && (
                      <img src={m.gifUrl} alt="GIF" className="mt-1 rounded-lg max-w-[220px] max-h-[220px] object-contain" />
                    )}
                    {groupReactions(m.reactions, currentUserId).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {groupReactions(m.reactions, currentUserId).map(g => (
                          <button
                            key={g.emoji}
                            type="button"
                            onClick={() => onToggleReaction(m, g.emoji)}
                            title={g.names.join(', ')}
                            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                              g.reacted
                                ? 'bg-primary-100 dark:bg-primary-900/40 border-primary-300 dark:border-primary-600 text-primary-700 dark:text-primary-300'
                                : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            <span>{g.emoji}</span>
                            <span className="font-medium">{g.count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {editingId !== m.id && (
                <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="relative">
                    <button
                      onClick={() => setReactingId(id => id === m.id ? null : m.id)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Reaccionar"
                    >
                      🙂
                    </button>
                    {reactingId === m.id && (
                      <MessageReactionPicker
                        onSelect={emoji => onToggleReaction(m, emoji)}
                        onClose={() => setReactingId(null)}
                      />
                    )}
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpenId(id => id === m.id ? null : m.id)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Opciones"
                    >
                      ⋯
                    </button>
                    {menuOpenId === m.id && (
                      <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 z-10 w-36">
                        <button
                          onClick={() => { setMenuOpenId(null); onTogglePin(m) }}
                          className="w-full text-left px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          📌 {m.pinnedAt ? 'Desfijar' : 'Fijar'}
                        </button>
                        {canEdit && m.content != null && (
                          <button
                            onClick={() => startEdit(m)}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            ✏️ Editar
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => { setMenuOpenId(null); onDelete(m) }}
                            className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            🗑 Eliminar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
      </div>
    </div>
  )
}
