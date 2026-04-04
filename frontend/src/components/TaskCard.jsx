import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { linkify } from '../utils/linkify'
import { fmtMins, activeMinutes, completedDuration } from '../utils/format'

export default function TaskCard({ task, onUpdate, onDelete, hasActiveTask, backlog, onAddToToday, onMoveToBacklog }) {
  const [loading, setLoading] = useState(false)
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [blockReason, setBlockReason] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const blockInputRef = useRef(null)

  useEffect(() => {
    if (showBlockForm) blockInputRef.current?.focus()
  }, [showBlockForm])

  async function call(endpoint) {
    setLoading(true)
    try {
      const { data } = await api.patch(`/tasks/${task.id}/${endpoint}`)
      onUpdate(data)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    try {
      await api.delete(`/tasks/${task.id}`)
      onDelete(task.id)
    } finally {
      setLoading(false)
      setShowDeleteConfirm(false)
    }
  }

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

  const statusDot = {
    PENDING:     'bg-gray-300',
    IN_PROGRESS: 'bg-primary-500 animate-pulse',
    PAUSED:      'bg-gray-400',
    BLOCKED:     'bg-red-500',
    COMPLETED:   'bg-green-500',
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
    && onMoveToBacklog
    && ['PENDING', 'PAUSED', 'BLOCKED'].includes(task.status)

  const borderClass = isBlocked
    ? 'border-red-300 dark:border-red-700'
    : 'dark:border-gray-700'

  return (
    <div className={`relative bg-white dark:bg-gray-800 rounded-xl border p-4 flex flex-col gap-3 transition-opacity ${task.status === 'COMPLETED' ? 'opacity-70' : ''} ${borderClass}`}>

      {/* Delete button — top-right corner, only for PENDING tasks */}
      {task.status === 'PENDING' && (
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
        {/* Status dot + star stacked vertically */}
        <div className="flex flex-col items-center gap-1.5 flex-shrink-0 mt-0.5">
          <div className={`w-2.5 h-2.5 rounded-full ${statusDot[task.status]}`} />
          {task.status !== 'COMPLETED' && (
            <button
              onClick={handleStar}
              disabled={loading}
              title={task.starred ? 'Cambiar prioridad' : 'Destacar tarea'}
              className="transition-transform hover:scale-110 disabled:opacity-50"
            >
              {task.starred === 0 && (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 hover:text-yellow-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                </svg>
              )}
              {task.starred === 1 && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-yellow-400">
                  <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                </svg>
              )}
              {task.starred === 2 && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-orange-400">
                  <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                </svg>
              )}
              {task.starred === 3 && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-red-500">
                  <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium text-justify ${task.status === 'COMPLETED' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
            {linkify(task.description)}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Link to={`/my-projects/${task.project.id}`} className="text-xs bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded px-2 py-0.5 hover:bg-primary-100 dark:hover:bg-primary-900/70 transition-colors">{task.project.name}</Link>
            <span className={`text-xs rounded px-2 py-0.5 ${statusBadge[task.status]}`}>{statusLabel[task.status]}</span>

            {task.status === 'IN_PROGRESS' && task.startedAt && (
              <span className="text-xs text-blue-500">⏱ {fmtMins(activeMinutes(task))}</span>
            )}
            {task.status === 'PAUSED' && (
              <span className="text-xs text-yellow-600">⏸ {fmtMins(activeMinutes(task))} trabajadas</span>
            )}
            {task.status === 'COMPLETED' && completedDuration(task) && (
              <span className="text-xs text-green-600">✓ {completedDuration(task)}</span>
            )}
            {task.createdBy && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Asignada por {task.createdBy.name.split(' ')[0]}
              </span>
            )}
          </div>
        </div>

        {/* Action column */}
        <div className={`flex flex-col gap-1.5 flex-shrink-0 ${backlog ? 'w-28' : 'w-24'}`}>

          {/* Backlog mode: single "Agregar a hoy" action */}
          {backlog && (
            <button
              onClick={handleAddToToday}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/50 disabled:opacity-40"
            >
              {loading ? '...' : 'Agregar a hoy'}
            </button>
          )}

          {/* Normal mode: state-based actions */}
          {!backlog && task.status === 'PENDING' && (
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

          {/* Move to backlog — secondary action for PENDING / PAUSED / BLOCKED today tasks */}
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
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Eliminar tarea</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">"{task.description}"</p>
            </div>
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
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {loading ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
