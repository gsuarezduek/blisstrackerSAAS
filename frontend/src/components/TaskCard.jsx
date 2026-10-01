import { useState, useRef, useEffect, memo } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { renderRichText } from '../utils/richText'
import { fmtMins, activeMinutes } from '../utils/format'
import UserLink from './UserLink'
import useMembers from '../hooks/useMembers'
import StarButton from './dashboard/StarButton'
import ReasonModal from './ventas/ReasonModal'

// Fila de tarea del Dashboard (foco del día, Backlog y Programadas). Una sola acción
// principal visible según el estado — el resto (mover al Backlog, eliminar) vive en
// el menú "⋯" para que la lista no se llene de botones. La tarea EN CURSO no se
// renderiza acá sino en <NowCard>, que tiene cronómetro y sus propias acciones.
//
// Con otra tarea en curso, "Iniciar"/"Retomar" no quedan deshabilitados: pausan la
// activa y arrancan esta en un solo click (el backend sigue exigiendo una sola tarea
// IN_PROGRESS por persona; acá solo se encadenan las dos llamadas que antes el
// usuario tenía que hacer a mano). El tooltip avisa qué tarea se va a pausar.

function OverflowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey) }
  }, [open])
  if (items.length === 0) return <div className="w-8 flex-shrink-0" />
  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Más acciones"
        aria-expanded={open}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-48 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg p-1">
          {items.map(it => (
            <button
              key={it.label}
              type="button"
              onClick={() => { setOpen(false); it.onClick() }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                it.danger ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TaskCard({ task, onUpdate, onDelete, activeTask, backlog, future, onAddToToday, onBringToToday, onMoveToBacklog, onOpenComments }) {
  const { members } = useMembers()
  const [loading, setLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showBlock, setShowBlock] = useState(false)

  async function patch(endpoint) {
    const { data } = await api.patch(`/tasks/${task.id}/${endpoint}`)
    return data
  }

  async function run(fn) {
    setLoading(true)
    try { await fn() } catch (err) {
      if (err.response?.data?.error) alert(err.response.data.error)
    } finally { setLoading(false) }
  }

  // Iniciar / retomar / desbloquear — si hay otra tarea en curso, primero la pausa.
  function startOrSwitch(endpoint) {
    return run(async () => {
      if (activeTask && activeTask.id !== task.id) {
        const { data: paused } = await api.patch(`/tasks/${activeTask.id}/pause`)
        onUpdate(paused)
      }
      onUpdate(await patch(endpoint))
    })
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

  const switching = !!activeTask && activeTask.id !== task.id
  const isBlocked = task.status === 'BLOCKED'
  const isPaused = task.status === 'PAUSED'
  const scheduledLabel = task.scheduledFor
    ? new Date(`${task.scheduledFor}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    : null

  // Acción principal (una sola, según contexto)
  let primary = null
  if (future) {
    primary = { label: 'Traer a hoy', onClick: () => run(async () => { const { data } = await api.patch(`/tasks/${task.id}/bring-to-today`); onBringToToday?.(data) }) }
  } else if (backlog) {
    primary = { label: 'Agregar a hoy', onClick: () => run(async () => { const { data } = await api.patch(`/tasks/${task.id}/add-to-today`); onAddToToday?.(data) }) }
  } else if (task.status === 'PENDING') {
    primary = { label: 'Iniciar', onClick: () => startOrSwitch('start'), strong: true }
  } else if (isPaused) {
    primary = { label: 'Retomar', onClick: () => startOrSwitch('resume'), strong: true }
  } else if (isBlocked) {
    primary = { label: 'Desbloquear', onClick: () => startOrSwitch('unblock') }
  }

  const menu = []
  if (!backlog && !future && onMoveToBacklog && task.status === 'PENDING') {
    menu.push({ label: 'Mover al Backlog', onClick: () => run(async () => onUpdate(await patch('move-to-backlog'))) })
  }
  // Bloquear solo existe desde "en curso" (regla del backend). La tarjeta "Ahora"
  // tiene su propio botón; esto cubre la tarea en curso cuando aparece en una lista.
  if (task.status === 'IN_PROGRESS') {
    menu.push({ label: 'Marcar como bloqueada', onClick: () => setShowBlock(true) })
  }
  if (onOpenComments) menu.push({ label: 'Abrir detalle', onClick: () => onOpenComments(task) })
  if (task.status === 'PENDING' || task.status === 'PAUSED') {
    menu.push({ label: 'Eliminar', danger: true, onClick: () => setShowDeleteConfirm(true) })
  }

  const actions = (
    <>
      {primary && (
        <button
          type="button"
          onClick={primary.onClick}
          disabled={loading}
          title={switching && primary.strong ? `Pausa «${activeTask.description.slice(0, 60)}» y empieza esta` : undefined}
          className="text-sm font-medium rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors disabled:opacity-50 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-primary-400 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-gray-700"
        >
          {loading ? '…' : primary.label}
        </button>
      )}
      <OverflowMenu items={menu} />
    </>
  )

  const comments = task._count?.comments ?? 0
  const files = task._count?.files ?? 0

  return (
    <div className={`group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/60 ${loading ? 'opacity-60' : ''}`}>
      <div className="pt-0.5 flex-shrink-0">
        {future
          ? <span className="w-5 h-5 flex items-center justify-center text-indigo-400" title="Programada">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" /></svg>
            </span>
          : <StarButton task={task} onUpdate={onUpdate} />}
      </div>

      <div className="flex-1 min-w-0">
        <p
          onClick={() => onOpenComments?.(task)}
          className={`text-[15px] leading-snug whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100 ${onOpenComments ? 'cursor-pointer hover:text-primary-700 dark:hover:text-primary-400' : ''}`}
        >
          {renderRichText(task.description, { members })}
        </p>

        <div className="flex items-center gap-x-2.5 gap-y-1 mt-1.5 flex-wrap text-xs text-gray-500 dark:text-gray-400">
          <Link to={`/my-projects/${task.project.id}`} className="font-medium text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">
            {task.project.name}
          </Link>
          {future && scheduledLabel && <span className="text-indigo-600 dark:text-indigo-300 capitalize">Aparece el {scheduledLabel}</span>}
          {isPaused && <span className="text-amber-700 dark:text-amber-400">Pausada · {fmtMins(activeMinutes(task))} trabajadas</span>}
          {task.recurrenceId && <span title="Tarea recurrente">🔁 Recurrente</span>}
          {task.contentPiece && (
            <Link to={`/contenido?projectId=${task.project.id}&piece=${task.contentPiece.id}`} className="text-sky-700 dark:text-sky-300 hover:underline" title="Ver pieza de contenido">
              📅 Contenido
            </Link>
          )}
          {task.createdBy && (
            <span>
              De{' '}
              <UserLink userId={task.createdBy.id} className="hover:text-primary-600 dark:hover:text-primary-400">
                {task.createdBy.name.split(' ')[0]}
              </UserLink>
            </span>
          )}
          {onOpenComments && comments > 0 && (
            <button type="button" onClick={() => onOpenComments(task)} className="hover:text-primary-600 dark:hover:text-primary-400" title="Comentarios">
              💬 {comments}
            </button>
          )}
          {onOpenComments && files > 0 && (
            <button type="button" onClick={() => onOpenComments(task)} className="hover:text-primary-600 dark:hover:text-primary-400" title="Adjuntos">
              📎 {files}
            </button>
          )}
        </div>

        {isBlocked && task.blockedReason && (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            <span className="font-medium">Bloqueada:</span> {task.blockedReason}
          </p>
        )}

        <div className="sm:hidden flex items-center justify-between gap-2 mt-2.5">{actions}</div>
      </div>

      <div className="hidden sm:flex items-center gap-1 flex-shrink-0">{actions}</div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Eliminar tarea{task.recurrenceId ? ' recurrente' : ''}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">"{task.description}"</p>
            </div>
            {task.recurrenceId ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">Es una tarea recurrente. ¿Qué querés eliminar?</p>
                <div className="flex flex-col gap-2">
                  <button onClick={() => handleDelete('one')} disabled={loading}
                    className="w-full bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
                    Solo esta
                  </button>
                  <button onClick={() => handleDelete('series')} disabled={loading}
                    className="w-full border border-red-400 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
                    Esta y todas las siguientes
                  </button>
                  <button onClick={() => setShowDeleteConfirm(false)} disabled={loading}
                    className="w-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2.5 text-sm font-medium transition-colors">
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">Esta acción no se puede deshacer.</p>
                <div className="flex gap-3">
                  <button onClick={() => setShowDeleteConfirm(false)} disabled={loading}
                    className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2.5 text-sm font-medium transition-colors">
                    Cancelar
                  </button>
                  <button onClick={() => handleDelete('one')} disabled={loading}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60">
                    {loading ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <ReasonModal
        open={showBlock}
        loading={loading}
        title="¿Qué te está frenando?"
        description="La tarea queda bloqueada con este motivo y avisamos al equipo del proyecto."
        placeholder="Ej. Falta que el cliente mande los accesos…"
        confirmLabel="Marcar como bloqueada"
        onCancel={() => setShowBlock(false)}
        onConfirm={reason => run(async () => {
          const { data } = await api.patch(`/tasks/${task.id}/block`, { reason })
          onUpdate(data)
          setShowBlock(false)
        })}
      />
    </div>
  )
}

export default memo(TaskCard)
