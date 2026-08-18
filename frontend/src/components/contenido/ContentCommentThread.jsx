import { useState, useRef, useEffect } from 'react'
import { useMentionAutocomplete } from '../chat/useMentionAutocomplete'
import { renderRichText } from '../../utils/richText'
import { avatarUrl } from '../../utils/avatarUrl'

function formatWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * Hilo de comentarios de una pieza. Reusa el autocompletado de @menciones y el
 * resaltado de texto del chat interno (mismo componente, dos contextos).
 *
 * `visibility` filtra qué comentarios se muestran ('internal' o 'client') y con
 * qué visibilidad se postean los nuevos — así este mismo componente sirve tanto
 * para "Comentarios" (equipo, F4) como para "Feedback del cliente" (F7, cuando
 * el portal pueda escribir en el hilo 'client') sin duplicar la UI.
 */
export default function ContentCommentThread({ comments, visibility, currentUserId, isAdmin, members, canPost, onSubmit, onDelete, emptyLabel }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const textareaRef = useRef(null)
  const listRef = useRef(null)

  const { mentionQuery, mentionMatches, mentionIdx, handleTextChange, handleMentionKeyDown, selectMention } =
    useMentionAutocomplete({ text, setText, textareaRef, members })

  const thread = comments.filter(c => c.visibility === visibility)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [thread.length])

  async function handleSend() {
    const clean = text.trim()
    if (!clean || sending) return
    setSending(true)
    setError(null)
    try {
      await onSubmit(clean, visibility)
      setText('')
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar el comentario')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (handleMentionKeyDown(e)) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleDelete(id) {
    setError(null)
    try { await onDelete(id) }
    catch (err) { setError(err.response?.data?.error || 'No se pudo eliminar el comentario') }
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 pb-2 max-h-64">
        {thread.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">{emptyLabel ?? 'Sin comentarios todavía.'}</p>
        )}
        {thread.map(c => {
          const canDelete = isAdmin || (c.author.isTeam && c.author.id === currentUserId)
          return (
            <div key={c.id} className="flex items-start gap-2.5 group">
              {c.author.isTeam ? (
                <img src={avatarUrl(c.author.avatar)} alt="" className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-600 shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center text-xs font-bold shrink-0">🤝</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{c.author.name}</span>
                  {!c.author.isTeam && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">cliente</span>}
                  <span className="text-xs text-gray-400 dark:text-gray-500">{formatWhen(c.createdAt)}</span>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-500 transition-opacity ml-auto"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line break-words">{renderRichText(c.body, { members })}</p>
              </div>
            </div>
          )
        })}
      </div>

      {canPost && (
        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 shrink-0">
          {error && <p className="text-xs text-red-600 dark:text-red-400 mb-1.5">{error}</p>}
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder="Escribí un comentario… Usá @ para mencionar"
                className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none max-h-28"
              />
              {mentionQuery !== null && mentionMatches.length > 0 && (
                <div className="absolute bottom-full mb-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden z-10">
                  {mentionMatches.map((m, i) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); selectMention(m) }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${i === mentionIdx ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      <img src={avatarUrl(m.avatar)} alt="" className="w-6 h-6 rounded-full object-cover border border-gray-200 dark:border-gray-600 shrink-0" />
                      <span className="text-gray-800 dark:text-gray-200 font-medium">{m.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white transition-colors"
              title="Enviar (Enter)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 -ml-0.5">
                <path d="M3.105 3.105a.75.75 0 01.815-.157l14.5 6.25a.75.75 0 010 1.376l-14.5 6.25a.75.75 0 01-1.028-.917L4.606 10 2.892 4.023a.75.75 0 01.213-.918z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
