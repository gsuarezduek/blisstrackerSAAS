import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/client'
import { linkify } from '../utils/linkify'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'
import { fmtMins, activeMinutes, completedDuration } from '../utils/format'
import { avatarUrl } from '../utils/avatarUrl'

// Resalta @menciones en texto plano. Captura exactamente una palabra después del @.
// El backend maneja la detección de nombres de dos palabras por su cuenta.
function renderWithMentions(text) {
  const parts = []
  let lastIndex = 0
  const regex = /@([A-Za-záéíóúÁÉÍÓÚñÑüÜ]+)/g
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push(<span key={match.index} className="text-purple-600 dark:text-purple-400 font-medium">{match[0]}</span>)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length > 0 ? parts : text
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)    return 'hace un momento'
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

const STATUS_LABEL = {
  PENDING:     'Pendiente',
  IN_PROGRESS: 'En curso',
  PAUSED:      'Pausada',
  BLOCKED:     'Bloqueada',
  COMPLETED:   'Completada',
}
const STATUS_CLASS = {
  PENDING:     'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  IN_PROGRESS: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400',
  PAUSED:      'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
  BLOCKED:     'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  COMPLETED:   'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
}

export default function TaskCommentsModal({ task, onClose, onCommentAdded, onTaskEdited }) {
  const { user } = useAuth()
  const [comments, setComments]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [text, setText]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const bottomRef                 = useRef(null)
  const textareaRef               = useRef(null)

  // @mention autocomplete
  const [members, setMembers]               = useState([])
  const [mentionQuery, setMentionQuery]     = useState(null)  // null = inactive
  const [mentionStart, setMentionStart]     = useState(-1)
  const [mentionIdx, setMentionIdx]         = useState(0)
  const mentionMatches = mentionQuery !== null
    ? members.filter(m => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : []

  // Edit state
  const [editing, setEditing]         = useState(false)
  const [editDesc, setEditDesc]       = useState(task.description)
  const [editSaving, setEditSaving]   = useState(false)
  const [editError, setEditError]     = useState('')
  const [currentDesc, setCurrentDesc] = useState(task.description)
  const editRef                       = useRef(null)

  const canEdit = user && (user.isAdmin || user.id === task.userId)

  useEffect(() => {
    api.get(`/tasks/${task.id}/comments`)
      .then(r => setComments(r.data))
      .finally(() => setLoading(false))
  }, [task.id])

  useEffect(() => {
    const projectId = task.project?.id ?? task.projectId
    if (projectId) {
      api.get(`/projects/${projectId}/members`)
        .then(r => setMembers(r.data))
        .catch(() => {})
    }
  }, [task.project?.id, task.projectId])

  const selectMention = useCallback((member) => {
    const cursorPos = textareaRef.current?.selectionStart ?? text.length
    const before = text.slice(0, mentionStart)
    const after  = text.slice(cursorPos)
    const newText = `${before}@${member.name} ${after}`
    setText(newText)
    setMentionQuery(null)
    setMentionStart(-1)
    const newCursor = mentionStart + member.name.length + 2
    setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(newCursor, newCursor)
    }, 0)
  }, [text, mentionStart])

  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [loading, comments.length])

  useEffect(() => {
    if (editing) editRef.current?.focus()
  }, [editing])

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

  async function handleSaveEdit() {
    if (!editDesc.trim() || editSaving) return
    if (editDesc.trim() === currentDesc) { setEditing(false); return }
    setEditSaving(true)
    setEditError('')
    try {
      const { data } = await api.patch(`/tasks/${task.id}`, { description: editDesc.trim() })
      setCurrentDesc(data.description)
      setEditing(false)
      onTaskEdited?.(data)
    } catch (err) {
      setEditError(err.response?.data?.error || 'Error al guardar')
    } finally {
      setEditSaving(false)
    }
  }

  function handleTextChange(e) {
    const val = e.target.value
    const pos = e.target.selectionStart
    setText(val)
    // Detect if cursor is inside a @mention being typed
    const before = val.slice(0, pos)
    const atIdx  = before.lastIndexOf('@')
    if (atIdx !== -1) {
      const afterAt = before.slice(atIdx + 1)
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        setMentionQuery(afterAt)
        setMentionStart(atIdx)
        setMentionIdx(0)
        return
      }
    }
    setMentionQuery(null)
    setMentionStart(-1)
  }

  function handleKeyDown(e) {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIdx(i => Math.min(i + 1, mentionMatches.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIdx(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectMention(mentionMatches[mentionIdx])
        return
      }
      if (e.key === 'Escape') {
        setMentionQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleEditKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSaveEdit()
    }
    if (e.key === 'Escape') {
      setEditing(false)
      setEditDesc(currentDesc)
      setEditError('')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-xs text-gray-400 dark:text-gray-500">{task.project?.name}</p>
            <button
              onClick={onClose}
              className="text-2xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 leading-none flex-shrink-0 -mt-1"
            >
              ×
            </button>
          </div>

          {/* Descripción editable */}
          {editing ? (
            <div className="space-y-2">
              <textarea
                ref={editRef}
                rows={3}
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="w-full text-sm px-3 py-2 rounded-xl border border-primary-300 dark:border-primary-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
              />
              {editError && <p className="text-xs text-red-500">{editError}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving || !editDesc.trim()}
                  className="text-xs px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {editSaving ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  onClick={() => { setEditing(false); setEditDesc(currentDesc); setEditError('') }}
                  className="text-xs px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">Ctrl+Enter para guardar</span>
              </div>
            </div>
          ) : (
            <div className="group flex items-start gap-2">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug flex-1">
                {linkify(currentDesc)}
              </p>
              {canEdit && (
                <button
                  onClick={() => { setEditDesc(currentDesc); setEditing(true) }}
                  title="Editar descripción"
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-all rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Metadatos */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {/* Estado */}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[task.status]}`}>
              {STATUS_LABEL[task.status]}
            </span>

            {/* Tiempo trabajado / duración */}
            {task.status === 'IN_PROGRESS' && task.startedAt && (
              <span className="text-xs text-blue-500">⏱ {fmtMins(activeMinutes(task))} en curso</span>
            )}
            {task.status === 'PAUSED' && (
              <span className="text-xs text-yellow-600">⏸ {fmtMins(activeMinutes(task))} trabajadas</span>
            )}
            {task.status === 'COMPLETED' && completedDuration(task) && (
              <span className="text-xs text-green-600">✓ {completedDuration(task)}</span>
            )}
            {task.status === 'BLOCKED' && task.blockedReason && (
              <span className="text-xs text-red-500">🔒 {task.blockedReason}</span>
            )}
          </div>

          {/* Creación y asignación */}
          <div className="mt-2 space-y-0.5">
            {task.createdAt && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Creada el {fmtDate(task.createdAt)}
                {task.createdBy && <span className="text-gray-500 dark:text-gray-400"> · Asignada por <span className="font-medium">{task.createdBy.name}</span></span>}
              </p>
            )}
            {task.completedAt && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Completada el {fmtDate(task.completedAt)}
              </p>
            )}
          </div>

          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mt-4">
            Comentarios
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && <LoadingSpinner size="sm" className="py-6" />}
          {!loading && comments.length === 0 && (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">💬</p>
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin comentarios todavía. Sé el primero.</p>
            </div>
          )}
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-3">
              <img
                src={avatarUrl(c.user.avatar)}
                alt={c.user.name}
                className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{c.user.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug mt-0.5">
                  {renderWithMentions(c.content)}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="relative">
            <textarea
              ref={textareaRef}
              rows={2}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="Agregar un comentario... Usá @ para mencionar"
              className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
            />
            {/* Mention autocomplete dropdown */}
            {mentionQuery !== null && mentionMatches.length > 0 && (
              <div className="absolute bottom-full mb-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden z-10">
                {mentionMatches.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); selectMention(m) }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${i === mentionIdx ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  >
                    <img
                      src={avatarUrl(m.avatar)}
                      alt={m.name}
                      className="w-6 h-6 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0"
                    />
                    <span className="text-gray-800 dark:text-gray-200 font-medium">{m.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
