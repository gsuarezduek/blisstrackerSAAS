import { useEffect, useState } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import PeoplePicker from './PeoplePicker'

const DURATIONS = [15, 30, 45, 60, 90, 120]
const INPUT_CLS = 'w-full mt-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const LABEL_CLS = 'text-xs font-medium text-gray-500 dark:text-gray-400'

/**
 * Modal "Agendar reunión". `initial` (opcional) prellena fecha/hora — viene de
 * clickear un hueco vacío en WeekTimeGrid. Solo se hace la creación acá (sin
 * edición): el evento se puede editar después desde EventDetailModal.
 */
export default function ScheduleEventModal({ open, initial, onClose, onCreated }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState([])
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [durationMins, setDurationMins] = useState(30)
  const [projectId, setProjectId] = useState('')
  const [participantIds, setParticipantIds] = useState([])
  const [meetLink, setMeetLink] = useState('')
  const [notes, setNotes] = useState('')
  const [freeSlots, setFreeSlots] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDate(initial?.date || '')
    setStartTime(initial?.startTime || '')
    setDurationMins(30)
    setProjectId('')
    setParticipantIds(initial?.participantIds || [])
    setMeetLink('')
    setNotes('')
    setFreeSlots(null)
    setError('')
    api.get('/projects').then(r => setProjects(r.data)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  // Ayuda visual: huecos comunes del día elegido entre el organizador + invitados.
  useEffect(() => {
    if (!open || !date || participantIds.length === 0 || !user) { setFreeSlots(null); return }
    let cancelled = false
    api.post('/calendar/availability/common-free-slots', { userIds: [...participantIds, user.id], date, durationMins })
      .then(r => { if (!cancelled) setFreeSlots(r.data.slots) })
      .catch(() => { if (!cancelled) setFreeSlots(null) })
    return () => { cancelled = true }
  }, [open, date, participantIds, durationMins, user])

  if (!open) return null

  async function submit() {
    if (!title.trim() || !date || !startTime) { setError('Completá título, fecha y hora'); return }
    setSaving(true)
    setError('')
    try {
      const res = await api.post('/calendar/events', {
        title: title.trim(), date, startTime, durationMins,
        projectId: projectId || null,
        participantIds,
        meetLink: meetLink.trim() || null,
        notes: notes.trim() || null,
      })
      onCreated(res.data)
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo agendar la reunión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Agendar reunión</h3>

        <div>
          <label className={LABEL_CLS}>Título</label>
          <input
            autoFocus value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Ej. Reunión de seguimiento" className={INPUT_CLS}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={LABEL_CLS}>Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className={LABEL_CLS}>Hora</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label className={LABEL_CLS}>Duración</label>
            <select value={durationMins} onChange={e => setDurationMins(Number(e.target.value))} className={INPUT_CLS}>
              {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL_CLS}>Proyecto (opcional)</label>
          <select value={projectId} onChange={e => setProjectId(e.target.value)} className={INPUT_CLS}>
            <option value="">Sin proyecto</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {projectId && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              Con proyecto vas a poder iniciar la reunión real (con cronómetro) desde el evento, una vez que llegue la hora.
            </p>
          )}
        </div>

        <div>
          <label className={LABEL_CLS}>Participantes</label>
          <div className="mt-1">
            <PeoplePicker value={participantIds} onChange={setParticipantIds} excludeIds={user ? [user.id] : []} />
          </div>
          {freeSlots && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              {freeSlots.length
                ? `Libres ese día para todos: ${freeSlots.map(s => `${s.start}–${s.end}`).join(', ')}`
                : 'No hay huecos libres en común ese día.'}
            </p>
          )}
        </div>

        <div>
          <label className={LABEL_CLS}>Link de Meet (opcional)</label>
          <input
            value={meetLink} onChange={e => setMeetLink(e.target.value)}
            placeholder="https://meet.google.com/..." className={INPUT_CLS}
          />
        </div>

        <div>
          <label className={LABEL_CLS}>Notas (opcional)</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={`${INPUT_CLS} resize-none`} />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose} disabled={saving}
            className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={submit} disabled={saving}
            className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {saving ? 'Agendando…' : 'Agendar'}
          </button>
        </div>
      </div>
    </div>
  )
}
