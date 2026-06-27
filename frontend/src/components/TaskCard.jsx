import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { linkify } from '../utils/linkify'
import { fmtMins, activeMinutes, completedDuration, completedMinutes } from '../utils/format'
import UserLink from './UserLink'

export default function TaskCard({ task, onUpdate, onDelete, hasActiveTask, backlog, future, onAddToToday, onBringToToday, onMoveToBacklog, onOpenComments }) {
  const [loading, setLoading] = useState(false)
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [blockReason, setBlockReason] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editingDuration, setEditingDuration] = useState(false)
  const [durationInput, setDurationInput] = useState('')
  const blockInputRef   = useRef(null)
  const durationInputRef = useRef(null)
  const cancelDuration  = useRef(false)

  useEffect(() => {
    if (showBlockForm) blockInputRef.current?.focus()
  }, [showBlockForm])

  async function call(endpoint) {
    setLoading(true)
    try {
      const { data } = await api.patch(`/tasks/${task.id}/${endpoint}`)
      onUpdate(data)
    } catch (err) {
      if (err.response?.data?.error) alert(err.response.data.error)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(scope) {
    setLoading(true)
    try {
      await api.delete(`/tasks/${task.id}${scope === 'series' ? '?scope=series' : ''}`)
      onDelete(task.id, scope === 'series' ? task.recurrenceId : null)
    } finally {
      setLoading(false)
      setShowDeleteConfirm(false)
    }
  }

  async function handleBringToToday() {
    setLoading(true)
    try {
      const { data } = await api.patch(`/tasks/${task.id}/bring-to-today`)
      onBringToToday?.(data)
    } finally {
      setLoading(false)
    }
  }

  // Fecha de aparición de una tarea futura, formateada "DD/MM"
  const scheduledLabel = task.scheduledFor
    ? task.scheduledFor.slice(8, 10) + '/' + task.scheduledFor.slice(5, 7)
    : null

  async function handleStar() {
    setLoading(true)
    try {
      const { data } = await api.patch(`/tasks/${task.id}/star`)
      onUpdate(data)
    } catch (err) {
      if (err.response?.status === 409) alert(err.response.data.error)
    } finally {
      setLoading(false)
    }
  }

  function startEditDuration() {
    cancelDuration.current = false
    setDurationInput(String(completedMinutes(task) ?? 0))
    setEditingDuration(true)
    setTimeout(() => { durationInputRef.current?.select() }, 0)
  }

  async function handleSaveDuration() {
    if (cancelDuration.current) return
    const mins = parseInt(durationInput, 10)
    if (isNaN(mins) || mins < 0) { setEditingDuration(false); return }
    setLoading(true)
    try {
      const { data } = await api.patch(`/tasks/${task.id}/duration`, { minutes: mins })
      onUpdate(data)
    } catch (err) {
      if (err.response?.data?.error) alert(err.response.data.error)
    } finally {
      setLoading(false)
      setEditingDuration(false)
    }
  }

  async function handleBlock() {
    if (!blockReason.trim()) return
    setLoading(true)
    try {
      const { data } = await api.patch(`/tasks/${task.id}/block`, { reason: blockReason.trim() })
      onUpdate(data)
      setShowBlockForm(false)
      setBlockReason('')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddToToday() {
    setLoading(true)
    try {
      const { data } = await api.patch(`/tasks/${task.id}/add-to-today`)
      onAddToToday?.(data)
    } finally {
      setLoading(false)
    }
  }

  async function handleMoveToBacklog() {
    setLoading(true)
    try {
      const { data } = await api.patch(`/tasks/${task.id}/move-to-backlog`)
      onUpdate(data)
    } finally {
      setLoading(false)
    }
  }

  const statusBadge = {
    PENDING:     'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
    IN_PROGRESS: 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400',
    PAUSED:      'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
    BLOCKED:     'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
    COMPLETED:   'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  }

  const statusLabel = {
    PENDING:     'Pendiente',
    IN_PROGRESS: 'En curso',
    PAUSED:      'Pausada',
    BLOCKED:     'Bloqueada',
    COMPLETED:   'Completada',
  }

  const canStart  = task.status === 'PENDING'  && !hasActiveTask
  const canResume = task.status === 'PAUSED'   && !hasActiveTask
  const isBlocked = task.status === 'BLOCKED'

  const canMoveToBacklog = !backlog
    && !future
    && onMoveToBacklog
    && task.status === 'PENDING'

  const borderClass = isBlocked
    ? 'border-red-300 dark:border-red-700'
    : 'dark:border-gray-700'

  return (
    <div className={`relative bg-white dark:bg-gray-800 rounded-xl border p-4 flex flex-col gap-3 transition-opacity ${task.status === 'COMPLETED' ? 'opacity-70' : ''} ${borderClass}`}>

      {/* Delete button — top-right corner, for PENDING and PAUSED tasks */}
      {(task.status === 'PENDING' || task.status === 'PAUSED') && (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          title="Eliminar tarea"
          className="absolute -top-2.5 -right-2.5 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 hover:text-red-400 dark:hover:text-red-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 transition-colors text-xs leading-none shadow-sm"
        >
          ×
        </button>
      )}

      {/* Main row */}
      <div className="flex items-start gap-3">
        {/* Star (unified status + priority indicator) */}
        <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
          {future ? (
            <div className="w-4 h-4 flex items-center justify-center text-indigo-400" title="Tarea futura">📅</div>
          ) : task.status !== 'COMPLETED' ? (
            <button
              onClick={handleStar}
              disabled={loading}
              title={task.starred ? 'Cambiar prioridad' : 'Destacar tarea'}
              className="transition-transform hover:scale-110 disabled:opacity-50"
            >
              {task.starred === 0 && task.status === 'IN_PROGRESS' && (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-green-400 animate-pulse">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                </svg>
              )}
              {task.starred === 0 && task.status !== 'IN_PROGRESS' && (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-300 dark:text-gray-600 hover:text-green-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                </svg>
              )}
              {task.starred === 1 && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 text-green-400 ${task.status === 'IN_PROGRESS' ? 'animate-pulse' : ''}`}>
                  <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                </svg>
              )}
              {task.starred === 2 && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 text-yellow-400 ${task.status === 'IN_PROGRESS' ? 'animate-pulse' : ''}`}>
                  <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                </svg>
              )}
              {task.starred === 3 && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 text-red-500 ${task.status === 'IN_PROGRESS' ? 'animate-pulse' : ''}`}>
                  <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ) : (
            <div className="w-4 h-4" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p
            onClick={() => onOpenComments?.(task)}
            className={`text-sm font-medium text-justify whitespace-pre-wrap break-words ${task.status === 'COMPLETED' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'} ${onOpenComments ? 'cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors' : ''}`}
          >
            {linkify(task.description)}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Link to={`/my-projects/${task.project.id}`} className="text-xs bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded px-2 py-0.5 hover:bg-primary-100 dark:hover:bg-primary-900/70 transition-colors">{task.project.name}</Link>
            {future
              ? <span className="text-xs rounded px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">📅 {scheduledLabel}</span>
              : <span className={`text-xs rounded px-2 py-0.5 ${statusBadge[task.status]}`}>{statusLabel[task.status]}</span>}
            {task.recurrenceId && (
              <span title="Tarea recurrente" className="text-xs rounded px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">🔁</span>
            )}

            {task.status === 'IN_PROGRESS' && task.startedAt && (
              <span className="text-xs text-blue-500">⏱ {fmtMins(activeMinutes(task))}</span>
            )}
            {task.status === 'PAUSED' && (
              <span className="text-xs text-yellow-600">⏸ {fmtMins(activeMinutes(task))} trabajadas</span>
            )}
            {task.status === 'COMPLETED' && (
              editingDuration ? (
                <span className="flex items-center gap-1">
                  <input
                    ref={durationInputRef}
                    type="number"
                    min="0"
                    value={durationInput}
                    onChange={e => setDurationInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  { e.preventDefault(); handleSaveDuration() }
                      if (e.key === 'Escape') { cancelDuration.current = true; setEditingDuration(false) }
                    }}
                    onBlur={handleSaveDuration}
                    className="w-14 text-xs border border-green-400 dark:border-green-600 rounded px-1.5 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-green-400 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  />
                  <span className="text-xs text-gray-400">min</span>
                  <button
                    onMouseDown={() => { cancelDuration.current = true; setEditingDuration(false) }}
                    className="text-xs text-gray-400 hover:text-gray-600 leading-none"
                    title="Cancelar">✕</button>
                </span>
              ) : (
                <button
                  onClick={startEditDuration}
                  title="Editar duración"
                  className="group flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors"
                >
                  ✓ {completedDuration(task) ?? '—'}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor"
                    className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity ml-0.5">
                    <path d="M8.54.47a1.6 1.6 0 0 1 2.26 2.26L9.5 4.03 7.97 2.5 8.54.47ZM7.03 3.44 1.5 9a.5.5 0 0 0-.13.24L1 11.17a.25.25 0 0 0 .3.3l1.93-.37A.5.5 0 0 0 3.47 11l5.56-5.53L7.03 3.44Z"/>
                  </svg>
                </button>
              )
            )}
            {task.createdBy && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Asignada por{' '}
                <UserLink userId={task.createdBy.id} className="hover:text-primary-600 dark:hover:text-primary-400">
                  {task.createdBy.name.split(' ')[0]}
                </UserLink>
              </span>
            )}
            {onOpenComments && (task._count?.comments ?? 0) > 0 && (
              <button
                onClick={() => onOpenComments(task)}
                className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                💬 {task._count.comments}
              </button>
            )}
            {onOpenComments && (task._count?.comments ?? 0) === 0 && (
              <button
                onClick={() => onOpenComments(task)}
                title="Comentar"
                className="text-xs text-gray-300 dark:text-gray-600 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
              >
                💬
              </button>
            )}
          </div>
        </div>

        {/* Action column */}
        <div className={`flex flex-col gap-1.5 flex-shrink-0 ${backlog || future ? 'w-28' : 'w-24'}`}>

          {/* Future mode: single "Traer a hoy" action */}
          {future && (
            <button
              onClick={handleBringToToday}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-40"
            >
              {loading ? '...' : 'Traer a hoy'}
            </button>
          )}

          {/* Backlog mode: single "Agregar a hoy" action */}
          {!future && backlog && (
            <button
              onClick={handleAddToToday}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/50 disabled:opacity-40"
            >
              {loading ? '...' : 'Agregar a hoy'}
            </button>
          )}

          {/* Normal mode: state-based actions */}
          {!backlog && !future && task.status === 'PENDING' && (
            <button
              onClick={() => call('start')}
              disabled={loading || !canStart}
              title={hasActiveTask ? 'Pausá o completá la tarea en curso primero' : ''}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 ${
                canStart
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              Iniciar
            </button>
          )}

          {!backlog && task.status === 'IN_PROGRESS' && (
            <>
              <button
                onClick={() => call('complete')}
                disabled={loading}
                className="w-full text-xs border border-green-400 text-green-600 dark:text-green-400 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Completar
              </button>
              <button
                onClick={() => call('pause')}
                disabled={loading}
                className="w-full text-xs border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Pausar
              </button>
              <button
                onClick={() => { setShowBlockForm(v => !v); setBlockReason('') }}
                disabled={loading}
                className="w-full text-xs border border-red-300 dark:border-red-700 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Bloquear
              </button>
            </>
          )}

          {!backlog && task.status === 'PAUSED' && (
            <button
              onClick={() => call('resume')}
              disabled={loading || !canResume}
              title={hasActiveTask ? 'Pausá o completá la tarea en curso primero' : ''}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 ${
                canResume
                  ? 'border border-primary-400 dark:border-primary-600 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'
                  : 'border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              Continuar
            </button>
          )}

          {!backlog && isBlocked && (
            <button
              onClick={() => call('unblock')}
              disabled={loading}
              className="text-xs border border-primary-400 dark:border-primary-600 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Continuar
            </button>
          )}

          {/* Move to backlog — secondary action solo para tareas PENDING (no empezadas) de hoy */}
          {canMoveToBacklog && (
            <button
              onClick={handleMoveToBacklog}
              disabled={loading}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-40 text-center w-full mt-0.5"
              title="Mover al Backlog"
            >
              → Backlog
            </button>
          )}
        </div>
      </div>

      {/* Blocked reason display */}
      {isBlocked && task.blockedReason && (
        <div className="ml-6 flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg px-3 py-2">
          <span className="text-red-400 text-xs mt-0.5 flex-shrink-0">⚠</span>
          <p className="text-xs text-red-700 dark:text-red-400">{task.blockedReason}</p>
        </div>
      )}

      {/* Block form */}
      {showBlockForm && (
        <div className="ml-6 flex flex-col gap-2">
          <textarea
            ref={blockInputRef}
            rows={2}
            value={blockReason}
            onChange={e => setBlockReason(e.target.value)}
            placeholder="¿Por qué está bloqueada esta tarea?"
            className="w-full border border-red-300 dark:border-red-700 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleBlock}
              disabled={loading || !blockReason.trim()}
              className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Confirmar bloqueo
            </button>
            <button
              onClick={() => { setShowBlockForm(false); setBlockReason('') }}
              className="text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Eliminar tarea{task.recurrenceId ? ' recurrente' : ''}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">"{task.description}"</p>
            </div>
            {task.recurrenceId ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">Es una tarea recurrente. ¿Qué querés eliminar?</p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => handleDelete('one')}
                    disabled={loading}
                    className="w-full bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    Solo esta
                  </button>
                  <button
                    onClick={() => handleDelete('series')}
                    disabled={loading}
                    className="w-full border border-red-400 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    Esta y todas las siguientes
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={loading}
                    className="w-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2.5 text-sm font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">Esta acción no se puede deshacer.</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={loading}
                    className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2.5 text-sm font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDelete('one')}
                    disabled={loading}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    {loading ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
