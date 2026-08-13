import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api/client'
import { linkify } from '../utils/linkify'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'
import { fmtMins, activeMinutes, completedDuration } from '../utils/format'
import { avatarUrl } from '../utils/avatarUrl'
import UserLink from './UserLink'

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

export default function TaskCommentsModal({ task, onClose, onCommentAdded, onTaskEdited, onTaskDeleted, onFollowChanged }) {
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

  // @mención al editar la descripción (contra los miembros del workspace, no solo del
  // proyecto — cualquiera puede ser mencionado y notificado, sea o no responsable).
  const [editMentionQuery, setEditMentionQuery] = useState(null) // null = inactivo
  const [editMentionStart, setEditMentionStart] = useState(-1)
  const [editMentionIdx, setEditMentionIdx]     = useState(0)

  // Edición de proyecto / responsable / fecha futura
  const [projects, setProjects]       = useState([])
  const [wsMembers, setWsMembers]     = useState([])
  const [editProjectId, setEditProjectId]   = useState(String(task.project?.id ?? task.projectId ?? ''))
  const [editAssignee, setEditAssignee]     = useState(String(task.userId ?? ''))
  const [editSchedule, setEditSchedule]     = useState(task.scheduledFor || '')
  const [currentProject, setCurrentProject] = useState(task.project?.name || '')
  const todayStr = new Date().toLocaleDateString('en-CA')
  // Solo las tareas futuras one-off (no recurrentes) permiten editar la fecha
  const isFutureTask = !!task.scheduledFor && !task.recurrenceId

  // Cargar proyectos + miembros del workspace solo cuando se entra en modo edición
  useEffect(() => {
    if (!editing || projects.length) return
    api.get('/projects').then(r => setProjects(r.data)).catch(() => {})
    api.get('/workspaces/current/members')
      .then(r => setWsMembers(r.data.filter(m => m.active)))
      .catch(() => {})
  }, [editing, projects.length])

  const editMentionMatches = editMentionQuery !== null
    ? wsMembers.filter(m => m.name.toLowerCase().includes(editMentionQuery.toLowerCase()))
    : []

  const selectEditMention = useCallback((member) => {
    const cursorPos = editRef.current?.selectionStart ?? editDesc.length
    const before = editDesc.slice(0, editMentionStart)
    const after  = editDesc.slice(cursorPos)
    const newText = `${before}@${member.name} ${after}`
    setEditDesc(newText)
    setEditMentionQuery(null)
    setEditMentionStart(-1)
    const newCursor = editMentionStart + member.name.length + 2
    setTimeout(() => {
      editRef.current?.focus()
      editRef.current?.setSelectionRange(newCursor, newCursor)
    }, 0)
  }, [editDesc, editMentionStart])

  function handleEditDescChange(e) {
    const val = e.target.value
    const pos = e.target.selectionStart
    setEditDesc(val)
    const before = val.slice(0, pos)
    const atIdx  = before.lastIndexOf('@')
    if (atIdx !== -1) {
      const afterAt = before.slice(atIdx + 1)
      if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
        setEditMentionQuery(afterAt)
        setEditMentionStart(atIdx)
        setEditMentionIdx(0)
        return
      }
    }
    setEditMentionQuery(null)
    setEditMentionStart(-1)
  }

  // Equipo del proyecto seleccionado vs resto del workspace (etiqueta, no barrera)
  const projectMemberIds = new Set(
    (projects.find(p => String(p.id) === editProjectId)?.members ?? []).map(pm => pm.user.id)
  )
  const teamOptions  = wsMembers.filter(m => projectMemberIds.has(m.id))
  const otherOptions = wsMembers.filter(m => !projectMemberIds.has(m.id))

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [deleteError, setDeleteError]     = useState('')

  // Admin/owner del workspace, dueño de la tarea, o quien la delegó (creador)
  const canEdit = user && (user.isAdmin || user.id === task.userId || user.id === task.createdById)

  // Seguimiento de la tarea
  const [following, setFollowing]       = useState(null)  // null = aún cargando
  const [followSaving, setFollowSaving] = useState(false)

  useEffect(() => {
    api.get(`/tasks/${task.id}/follow`)
      .then(r => setFollowing(!!r.data.following))
      .catch(() => setFollowing(false))
  }, [task.id])

  async function handleToggleFollow() {
    if (followSaving || following === null) return
    setFollowSaving(true)
    const next = !following
    setFollowing(next)  // optimista
    try {
      if (next) await api.post(`/tasks/${task.id}/follow`)
      else      await api.delete(`/tasks/${task.id}/follow`)
      onFollowChanged?.(task.id, next)
    } catch {
      setFollowing(!next)  // revertir
    } finally {
      setFollowSaving(false)
    }
  }

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
    if (isFutureTask && editSchedule && editSchedule <= todayStr) {
      setEditError('La fecha debe ser posterior a hoy.')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      const body = { description: editDesc.trim() }
      if (editProjectId) body.projectId = editProjectId
      if (editAssignee) body.targetUserId = editAssignee
      if (isFutureTask && editSchedule) body.scheduledFor = editSchedule
      const { data } = await api.patch(`/tasks/${task.id}`, body)
      setCurrentDesc(data.description)
      setCurrentProject(data.project?.name || '')
      setEditing(false)
      onTaskEdited?.(data)
    } catch (err) {
      setEditError(err.response?.data?.error || 'Error al guardar')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await api.delete(`/tasks/${task.id}`)
      onTaskDeleted?.(task.id)
      onClose()
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Error al eliminar la tarea')
      setDeleting(false)
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
    if (editMentionQuery !== null && editMentionMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setEditMentionIdx(i => Math.min(i + 1, editMentionMatches.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setEditMentionIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectEditMention(editMentionMatches[editMentionIdx]); return }
      if (e.key === 'Escape') { setEditMentionQuery(null); return }
    }
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
            <p className="text-xs text-gray-400 dark:text-gray-500">{currentProject}</p>
            <div className="flex items-center gap-2 flex-shrink-0 -mt-1">
              {/* Seguir tarea: notifica al seguidor cuando se completa o se comenta */}
              <button
                onClick={handleToggleFollow}
                disabled={following === null || followSaving}
                title={following ? 'Dejar de seguir esta tarea' : 'Seguir esta tarea (te avisa si se completa o comenta)'}
                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition-colors disabled:opacity-50 ${
                  following
                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <span>{following ? '👁️' : '👁'}</span>
                {following ? 'Siguiendo' : 'Seguir'}
              </button>
              <button
                onClick={onClose}
                className="text-2xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 leading-none"
              >
                ×
              </button>
            </div>
          </div>

          {/* Descripción editable */}
          {editing ? (
            <div className="space-y-2">
              <div className="relative">
                <textarea
                  ref={editRef}
                  rows={3}
                  value={editDesc}
                  onChange={handleEditDescChange}
                  onKeyDown={handleEditKeyDown}
                  placeholder="Usá @ para mencionar a alguien"
                  className="w-full text-sm px-3 py-2 rounded-xl border border-primary-300 dark:border-primary-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
                />
                {editMentionQuery !== null && editMentionMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden">
                    {editMentionMatches.map((m, i) => (
                      <button
                        key={m.id}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); selectEditMention(m) }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${i === editMentionIdx ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
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

              {/* Proyecto — no editable en tareas completadas (reescribiría horas históricas) */}
              {task.status === 'COMPLETED' ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  El proyecto y el responsable no se pueden cambiar en una tarea completada.
                </p>
              ) : (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Proyecto</label>
                <select
                  value={editProjectId}
                  onChange={e => setEditProjectId(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                </select>
              </div>
              )}

              {/* Responsable */}
              {task.status !== 'COMPLETED' && wsMembers.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Responsable</label>
                  <select
                    value={editAssignee}
                    onChange={e => setEditAssignee(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  >
                    {teamOptions.length > 0 && (
                      <optgroup label="Equipo del proyecto">
                        {teamOptions.map(u => (
                          <option key={u.id} value={String(u.id)}>{u.name}{String(u.id) === String(user?.id) ? ' (yo)' : ''}</option>
                        ))}
                      </optgroup>
                    )}
                    {otherOptions.length > 0 && (
                      <optgroup label="Otros del workspace">
                        {otherOptions.map(u => (
                          <option key={u.id} value={String(u.id)}>{u.name}{String(u.id) === String(user?.id) ? ' (yo)' : ''}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}

              {/* Fecha programada (solo tareas futuras one-off) */}
              {isFutureTask && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Aparece el día</label>
                  <input
                    type="date"
                    min={todayStr}
                    value={editSchedule}
                    onChange={e => setEditSchedule(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </div>
              )}

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
                  onClick={() => {
                    setEditing(false); setEditDesc(currentDesc); setEditError('')
                    setEditProjectId(String(task.project?.id ?? task.projectId ?? ''))
                    setEditAssignee(String(task.userId ?? ''))
                    setEditSchedule(task.scheduledFor || '')
                  }}
                  className="text-xs px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">Ctrl+Enter para guardar</span>
              </div>
            </div>
          ) : (
            <div className="group flex items-start gap-2">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug flex-1 whitespace-pre-wrap break-words">
                {linkify(currentDesc)}
              </p>
              {canEdit && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      setEditDesc(currentDesc); setEditing(true)
                      setEditProjectId(String(task.project?.id ?? task.projectId ?? ''))
                      setEditAssignee(String(task.userId ?? ''))
                      setEditSchedule(task.scheduledFor || '')
                    }}
                    title="Editar tarea"
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-all rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => { setDeleteConfirm(true); setDeleteError('') }}
                    title="Eliminar tarea"
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-all rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 3.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Confirmación de borrado */}
          {deleteConfirm && (
            <div className="mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
              <p className="text-xs text-red-700 dark:text-red-300 mb-2">¿Eliminar esta tarea? No se puede deshacer.</p>
              {deleteError && <p className="text-xs text-red-500 mb-2">{deleteError}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
                <button
                  onClick={() => { setDeleteConfirm(false); setDeleteError('') }}
                  className="text-xs px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
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
                {task.createdBy && <span className="text-gray-500 dark:text-gray-400"> · Asignada por <UserLink userId={task.createdBy.id} className="font-medium hover:text-primary-600 dark:hover:text-primary-400">{task.createdBy.name}</UserLink></span>}
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
              <UserLink userId={c.user.id} className="flex-shrink-0 mt-0.5">
                <img
                  src={avatarUrl(c.user.avatar)}
                  alt={c.user.name}
                  className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-600 hover:opacity-90 transition-opacity"
                />
              </UserLink>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <UserLink userId={c.user.id} className="text-xs font-semibold text-gray-800 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400">{c.user.name}</UserLink>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug mt-0.5 whitespace-pre-wrap break-words">
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
