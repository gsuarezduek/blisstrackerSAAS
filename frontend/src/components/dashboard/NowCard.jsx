import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api/client'
import { activeSeconds, fmtDuration } from '../../utils/format'
import { renderRichText } from '../../utils/richText'
import useMembers from '../../hooks/useMembers'
import StarButton from './StarButton'

// Tarjeta "Ahora" — arriba de todo del Dashboard. Responde la primera pregunta del
// día: ¿en qué estoy trabajando? Con una tarea en curso muestra el cronómetro en vivo
// y las tres acciones (Completar como principal; Pausar y Bloquear como secundarias).
// Sin tarea en curso propone la siguiente (la destacada de mayor prioridad, si no la
// pausada más reciente, si no la pendiente más nueva) con un solo botón para empezar.

function Timer({ task }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="tabular-nums">{fmtDuration(activeSeconds(task))}</span>
}

function Meta({ task, onOpenComments }) {
  const comments = task._count?.comments ?? 0
  const files = task._count?.files ?? 0
  return (
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-sm text-gray-500 dark:text-gray-400">
      <Link to={`/my-projects/${task.project.id}`} className="font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600">{task.project.name}</Link>
      {task.recurrenceId && <span>🔁 Recurrente</span>}
      {task.contentPiece && (
        <Link to={`/contenido?projectId=${task.project.id}&piece=${task.contentPiece.id}`} className="text-sky-700 dark:text-sky-300 hover:underline">📅 Contenido</Link>
      )}
      {task.createdBy && <span>De {task.createdBy.name.split(' ')[0]}</span>}
      <button type="button" onClick={() => onOpenComments(task)} className="hover:text-primary-600">
        💬 {comments > 0 ? comments : 'Comentar'}
      </button>
      {files > 0 && <button type="button" onClick={() => onOpenComments(task)} className="hover:text-primary-600">📎 {files}</button>}
    </div>
  )
}

export default function NowCard({ activeTask, suggestion, onUpdate, onOpenComments, onAddTask, dayEnded }) {
  const { members } = useMembers()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null) // endpoint en curso
  const [blocking, setBlocking] = useState(false)
  const [reason, setReason] = useState('')
  const reasonRef = useRef(null)

  useEffect(() => { if (blocking) reasonRef.current?.focus() }, [blocking])
  useEffect(() => { setBlocking(false); setReason('') }, [activeTask?.id])

  // "Empezar" sobre la Task "reserva" de una invitación de Calendario ya aceptada
  // arranca la reunión real para todos los que aceptaron (ver tasks/lifecycle.controller.js
  // #startTask) — la respuesta trae `meetingStarted` en vez de la tarea, así que en vez de
  // reflejarla acá se manda al usuario a Reuniones del proyecto para tomar notas.
  async function call(task, endpoint, body) {
    setBusy(endpoint)
    try {
      const { data } = await api.patch(`/tasks/${task.id}/${endpoint}`, body)
      if (data.meetingStarted) {
        navigate(`/my-projects/${data.projectId}?infoTab=reuniones&meeting=${data.meetingId}`)
        return true
      }
      onUpdate(data)
      return true
    } catch (err) {
      if (err.response?.data?.error) alert(err.response.data.error)
      return false
    } finally { setBusy(null) }
  }

  async function confirmBlock() {
    if (!reason.trim()) return
    if (await call(activeTask, 'block', { reason: reason.trim() })) { setBlocking(false); setReason('') }
  }

  if (dayEnded) {
    return (
      <div className="rounded-2xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20 px-6 py-5">
        <p className="text-base font-semibold text-green-800 dark:text-green-300">Jornada finalizada ✓</p>
        <p className="text-sm text-green-700/80 dark:text-green-400/80 mt-0.5">Lo que quedó pendiente pasa automáticamente a mañana.</p>
      </div>
    )
  }

  // ── Con tarea en curso ──
  if (activeTask) {
    return (
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-primary-200 dark:border-primary-900 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_-12px_rgba(247,147,26,.35)] overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-primary-500 via-primary-400 to-primary-500 animate-pulse" />
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-400">
              <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-primary-500 animate-ping opacity-60" /><span className="relative w-2 h-2 rounded-full bg-primary-500" /></span>
              Ahora
            </span>
            <span className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white"><Timer task={activeTask} /></span>
          </div>

          <div className="flex items-start gap-3">
            <div className="pt-1"><StarButton task={activeTask} onUpdate={onUpdate} /></div>
            <div className="min-w-0 flex-1">
              <p onClick={() => onOpenComments(activeTask)}
                className="text-lg sm:text-xl font-semibold leading-snug text-gray-900 dark:text-white whitespace-pre-wrap break-words cursor-pointer hover:text-primary-700 dark:hover:text-primary-400">
                {renderRichText(activeTask.description, { members })}
              </p>
              <div className="mt-2"><Meta task={activeTask} onOpenComments={onOpenComments} /></div>
            </div>
          </div>

          {blocking ? (
            <div className="mt-5 space-y-2">
              <textarea ref={reasonRef} rows={2} value={reason} onChange={e => setReason(e.target.value)}
                placeholder="¿Qué te está frenando? Avisamos al equipo del proyecto."
                className="w-full border border-red-300 dark:border-red-700 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
              <div className="flex gap-2">
                <button onClick={() => { setBlocking(false); setReason('') }}
                  className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Cancelar
                </button>
                <button onClick={confirmBlock} disabled={!reason.trim() || busy === 'block'}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-40">
                  {busy === 'block' ? 'Guardando…' : 'Marcar como bloqueada'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button onClick={() => call(activeTask, 'complete')} disabled={!!busy}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-sm disabled:opacity-50">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>
                {busy === 'complete' ? 'Completando…' : 'Completar'}
              </button>
              <button onClick={() => call(activeTask, 'pause')} disabled={!!busy}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                {busy === 'pause' ? 'Pausando…' : 'Pausar'}
              </button>
              <button onClick={() => setBlocking(true)} disabled={!!busy}
                className="sm:ml-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" /></svg>
                Estoy bloqueado
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Sin tarea en curso: proponer la siguiente ──
  if (suggestion) {
    const isPaused = suggestion.status === 'PAUSED'
    return (
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
          No estás trabajando en nada · Te sugerimos seguir con
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="pt-0.5"><StarButton task={suggestion} onUpdate={onUpdate} /></div>
            <div className="min-w-0">
              <p onClick={() => onOpenComments(suggestion)}
                className="text-base sm:text-lg font-semibold leading-snug text-gray-900 dark:text-white break-words cursor-pointer hover:text-primary-700">
                {renderRichText(suggestion.description, { members })}
              </p>
              <div className="mt-1.5"><Meta task={suggestion} onOpenComments={onOpenComments} /></div>
            </div>
          </div>
          <button onClick={() => call(suggestion, isPaused ? 'resume' : 'start')} disabled={!!busy}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-sm disabled:opacity-50 whitespace-nowrap">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.34-5.89a1.5 1.5 0 0 0 0-2.54L6.3 2.84Z" /></svg>
            {busy ? 'Arrancando…' : isPaused ? 'Retomar' : 'Empezar'}
          </button>
        </div>
      </div>
    )
  }

  // ── Nada para hoy ──
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 px-6 py-10 text-center">
      <p className="text-base font-semibold text-gray-900 dark:text-white">No tenés tareas para hoy</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Agregá una, o traé algo de tu Backlog más abajo.</p>
      <button onClick={onAddTask} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white">
        + Agregar tarea
      </button>
    </div>
  )
}
