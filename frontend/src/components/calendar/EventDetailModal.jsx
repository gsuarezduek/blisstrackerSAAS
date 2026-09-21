import { useEffect, useState } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { avatarUrl } from '../../utils/avatarUrl'
import PeoplePicker from './PeoplePicker'
import ProjectSearchSelect from './ProjectSearchSelect'

const STATUS_LABEL = { accepted: 'Confirmado', declined: 'Rechazó', pending: 'Sin responder' }
const STATUS_DOT = { accepted: 'bg-green-500', declined: 'bg-red-500', pending: 'bg-gray-300' }

const DURATIONS = [15, 30, 45, 60, 90, 120]
const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0')
  const m = String((i % 4) * 15).padStart(2, '0')
  return `${h}:${m}`
})
const INPUT_CLS = 'w-full mt-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const LABEL_CLS = 'text-xs font-medium text-gray-500 dark:text-gray-400'

/**
 * Detalle de un CalendarEvent: aceptar/rechazar (invitado), editar/cancelar
 * (organizador, solo antes de iniciar), e "Iniciar reunión" (conecta con la
 * ProjectMeeting real — ver calendar.controller.js#startMeetingFromEvent).
 *
 * El contenido va en un panel con scroll propio y los botones de acción quedan
 * en un footer fijo fuera de ese scroll — con muchos participantes (25+), antes
 * el modal crecía más que la pantalla y "Aceptar" quedaba inalcanzable.
 *
 * Si el evento es parte de una serie recurrente (`recurrenceId`), guardar una
 * edición o cancelarlo pregunta el alcance (estilo Google Calendar): "Solo esta
 * reunión" vs "Esta reunión y las siguientes" — ver ?scope=series en
 * calendar.controller.js.
 */
export default function EventDetailModal({ event, onClose, onChanged, onDeleted, onStarted }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('view') // 'view' | 'edit'
  const [projects, setProjects] = useState([])
  const [form, setForm] = useState(null)
  const [scopePrompt, setScopePrompt] = useState(null) // null | 'save' | 'delete'

  useEffect(() => {
    setMode('view')
    setError('')
    setScopePrompt(null)
    setBusy(false)
  }, [event?.id])

  if (!event) return null

  const isOrganizer = event.organizerId === user.id
  const myParticipation = event.participants.find(p => p.userId === user.id)
  const canRespond = !!myParticipation && !isOrganizer && !event.realMeetingId
  const canEdit = isOrganizer && !event.realMeetingId
  const isRecurring = !!event.recurrenceId

  async function respond(status) {
    setBusy(true); setError('')
    try {
      const res = await api.post(`/calendar/events/${event.id}/respond`, { status })
      onChanged(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo responder')
    } finally {
      setBusy(false)
    }
  }

  function startEdit() {
    setForm({
      title: event.title, date: event.date, startTime: event.startTime, durationMins: event.durationMins,
      projectId: event.projectId ? String(event.projectId) : '',
      participantIds: event.participants.filter(p => p.userId !== event.organizerId).map(p => p.userId),
      meetLink: event.meetLink || '', notes: event.notes || '',
    })
    setError('')
    setScopePrompt(null)
    setMode('edit')
    if (projects.length === 0) api.get('/projects').then(r => setProjects(r.data)).catch(() => {})
  }

  function requestSave() {
    if (!form.title.trim() || !form.date || !form.startTime) { setError('Completá título, fecha y hora'); return }
    if (!form.projectId) { setError('Elegí un proyecto para la reunión'); return }
    setError('')
    if (isRecurring) { setScopePrompt('save'); return }
    doSave(null)
  }

  async function doSave(scope) {
    setBusy(true); setError('')
    try {
      const body = {
        title: form.title.trim(), startTime: form.startTime, durationMins: form.durationMins,
        projectId: form.projectId, participantIds: form.participantIds,
        meetLink: form.meetLink.trim() || null, notes: form.notes.trim() || null,
      }
      // La fecha es la identidad de la ocurrencia dentro de la serie — no se
      // puede mover (ver calendar.controller.js), así que ni se manda.
      if (!isRecurring) body.date = form.date
      const qs = scope === 'series' ? '?scope=series' : ''
      const res = await api.patch(`/calendar/events/${event.id}${qs}`, body)
      onChanged(res.data.event || res.data)
      setMode('view')
      setScopePrompt(null)
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo guardar')
      setScopePrompt(null)
    } finally {
      setBusy(false)
    }
  }

  function requestDelete() {
    if (isRecurring) { setScopePrompt('delete'); return }
    if (!window.confirm('¿Cancelar esta reunión? Se avisa a todos los invitados.')) return
    doDelete(null)
  }

  async function doDelete(scope) {
    setBusy(true); setError('')
    try {
      const qs = scope === 'series' ? '?scope=series' : ''
      await api.delete(`/calendar/events/${event.id}${qs}`)
      onDeleted(event.id)
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cancelar')
      setBusy(false)
      setScopePrompt(null)
    }
  }

  async function startMeeting() {
    setBusy(true); setError('')
    try {
      const res = await api.post(`/calendar/events/${event.id}/start-meeting`, {})
      onStarted(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo iniciar la reunión')
      setBusy(false)
    }
  }

  const projectMemberIds = form
    ? (projects.find(p => String(p.id) === form.projectId)?.members?.map(pm => pm.user.id) || [])
    : []

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {mode === 'view' ? (
            <>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    {isRecurring && <span title="Reunión recurrente" className="mr-1">🔁</span>}
                    {event.title}
                  </h3>
                  {canEdit && (
                    <button onClick={startEdit} className="text-xs text-primary-600 hover:underline shrink-0 whitespace-nowrap">
                      ✏️ Editar
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {event.date} · {event.startTime} · {event.durationMins} min
                </p>
                {event.project && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Proyecto: {event.project.name}</p>}
              </div>

              {event.meetLink && (
                <a href={event.meetLink} target="_blank" rel="noreferrer" className="text-sm text-primary-600 hover:underline break-all">
                  🔗 {event.meetLink}
                </a>
              )}

              {event.notes && <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{event.notes}</p>}

              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Participantes ({event.participants.length})</p>
                <div className="flex flex-col gap-1">
                  {event.participants.map(p => (
                    <div key={p.userId} className="flex items-center gap-2 text-sm">
                      <img src={avatarUrl(p.user?.avatar)} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300 truncate">{p.user?.name}</span>
                      {p.userId === event.organizerId && <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">(organizador)</span>}
                      <span className={`ml-auto shrink-0 w-2 h-2 rounded-full ${STATUS_DOT[p.status]}`} title={STATUS_LABEL[p.status]} />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Editar reunión</h3>

              {isRecurring && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                  🔁 Esta reunión es parte de una serie — el día no se puede mover para una sola ocurrencia. Al guardar vas a elegir si el cambio aplica solo acá o a esta y las siguientes.
                </p>
              )}

              <div>
                <label className={LABEL_CLS}>Título</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={INPUT_CLS} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={LABEL_CLS}>Fecha</label>
                  <input
                    type="date" value={form.date} disabled={isRecurring}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className={`${INPUT_CLS} ${isRecurring ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Hora</label>
                  <select value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className={INPUT_CLS}>
                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>Duración</label>
                  <select value={form.durationMins} onChange={e => setForm(f => ({ ...f, durationMins: Number(e.target.value) }))} className={INPUT_CLS}>
                    {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={LABEL_CLS}>Proyecto</label>
                <div className="mt-1">
                  <ProjectSearchSelect projects={projects} value={form.projectId} onChange={id => setForm(f => ({ ...f, projectId: id }))} />
                </div>
              </div>

              <div>
                <label className={LABEL_CLS}>Participantes</label>
                <div className="mt-1">
                  <PeoplePicker
                    value={form.participantIds}
                    onChange={ids => setForm(f => ({ ...f, participantIds: ids }))}
                    excludeIds={[event.organizerId]}
                    projectMemberIds={projectMemberIds}
                  />
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                  Si cambiás el horario o los participantes, quienes ya habían aceptado vuelven a "sin responder" y se les avisa de nuevo.
                </p>
              </div>

              <div>
                <label className={LABEL_CLS}>Link de Meet (opcional)</label>
                <input
                  value={form.meetLink} onChange={e => setForm(f => ({ ...f, meetLink: e.target.value }))}
                  placeholder="https://meet.google.com/..." className={INPUT_CLS}
                />
              </div>

              <div>
                <label className={LABEL_CLS}>Notas (opcional)</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={`${INPUT_CLS} resize-none`} />
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer fijo, fuera del área con scroll — siempre alcanzable. */}
        <div className="flex flex-col gap-2 p-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
          {scopePrompt ? (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center px-2">
                {scopePrompt === 'save' ? '¿Aplicar el cambio a...?' : '¿Cancelar...?'}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={() => (scopePrompt === 'save' ? doSave('this') : doDelete('this'))}
                  className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2 text-xs font-medium transition-colors disabled:opacity-60"
                >
                  Solo esta reunión
                </button>
                <button
                  disabled={busy}
                  onClick={() => (scopePrompt === 'save' ? doSave('series') : doDelete('series'))}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-xl py-2 text-xs font-medium transition-colors disabled:opacity-60"
                >
                  Esta y las siguientes
                </button>
              </div>
              <button disabled={busy} onClick={() => setScopePrompt(null)} className="text-xs text-gray-400 dark:text-gray-500 hover:underline">
                Cancelar
              </button>
            </>
          ) : mode === 'edit' ? (
            <div className="flex gap-3">
              <button
                onClick={() => setMode('view')} disabled={busy}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={requestSave} disabled={busy}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          ) : (
            <>
              {canRespond && (
                <div className="flex gap-3">
                  <button
                    onClick={() => respond('declined')} disabled={busy}
                    className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => respond('accepted')} disabled={busy}
                    className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                  >
                    Aceptar
                  </button>
                </div>
              )}

              {isOrganizer && !event.realMeetingId && (
                <button
                  onClick={requestDelete} disabled={busy}
                  className="w-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl py-2 text-sm font-medium transition-colors disabled:opacity-60"
                >
                  Cancelar reunión
                </button>
              )}

              {event.projectId && !event.realMeetingId && (
                <button
                  onClick={startMeeting} disabled={busy}
                  className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
                >
                  ▶ Iniciar reunión
                </button>
              )}

              {event.realMeetingId && (
                <p className="text-xs text-center text-gray-400 dark:text-gray-500">Esta reunión ya se inició — el tiempo de los participantes que aceptaron ya está corriendo.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
