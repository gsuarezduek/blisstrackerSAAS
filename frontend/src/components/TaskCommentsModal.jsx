import { useState, useEffect, useRef } from 'react'
import api from '../api/client'
import { linkify } from '../utils/linkify'

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function TaskCommentsModal({ task, onClose, onCommentAdded }) {
  const [comments, setComments]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [text, setText]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const bottomRef                 = useRef(null)
  const textareaRef               = useRef(null)

  useEffect(() => {
    api.get(`/tasks/${task.id}/comments`)
      .then(r => setComments(r.data))
      .finally(() => setLoading(false))
  }, [task.id])

  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [loading, comments.length])

  async function handleSubmit() {
    if (!text.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      const { data } = await api.post(`/tasks/${task.id}/comments`, { text: text.trim() })
      const newComments = [...comments, data]
      setComments(newComments)
      setText('')
      onCommentAdded?.(newComments.length)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al enviar el comentario')
    } finally {
      setSaving(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{task.project?.name}</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug line-clamp-2">
                {task.description}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-2xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 leading-none flex-shrink-0 -mt-0.5"
            >
              ×
            </button>
          </div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-3">
            Comentarios
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <p className="text-sm text-gray-400 text-center py-6">Cargando...</p>
          )}
          {!loading && comments.length === 0 && (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">💬</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin comentarios todavía. Sé el primero.</p>
            </div>
          )}
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-3">
              <img
                src={`/perfiles/${c.user.avatar ?? 'bee.png'}`}
                alt={c.user.name}
                className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{c.user.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug mt-0.5">
                  {linkify(c.content)}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
          <textarea
            ref={textareaRef}
            rows={2}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Agregar un comentario... (Ctrl+Enter para enviar)"
            className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
          />
          {error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
          <div className="flex justify-end mt-2">
            <button
              onClick={handleSubmit}
              disabled={saving || !text.trim()}
              className="text-sm px-4 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              {saving ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
