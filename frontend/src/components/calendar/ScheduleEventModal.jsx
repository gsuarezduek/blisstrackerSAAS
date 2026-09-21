import { useEffect, useState } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import PeoplePicker from './PeoplePicker'
import ProjectSearchSelect from './ProjectSearchSelect'

const DURATIONS = [15, 30, 45, 60, 90, 120]
const INPUT_CLS = 'w-full mt-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const LABEL_CLS = 'text-xs font-medium text-gray-500 dark:text-gray-400'

// Horarios cada 15 minutos (00:00–23:45) — evita minutos sueltos tipo "9:38".
const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0')
  const m = String((i % 4) * 15).padStart(2, '0')
  return `${h}:${m}`
})

// Redondea "HH:MM" al múltiplo de 15 más cercano (por si `initial.startTime` viniera desalineado).
function roundToQuarter(hhmm) {
  if (!hhmm) return hhmm
  const [h, m] = hhmm.split(':').map(Number)
  const total = Math.min(23 * 60 + 45, Math.round((h * 60 + m) / 15) * 15)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

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

  // Reunión recurrente ("todos los lunes a las 9") — mismo estilo/controles que
  // AddTaskModal, pero sin un picker de "día del mes" aparte: `date` ya está
  // siempre presente acá y sirve de primera ocurrencia (monthly/annual derivan
  // el día/mes de esa misma fecha, ver buildRecurrenceParams en el backend).
  const [repeat, setRepeat] = useState(false)
  const [frequency, setFrequency] = useState('weekly') // daily | weekly | monthly | annual
  const [weekdays, setWeekdays] = useState([]) // 0=domingo … 6=sábado (solo weekly)
  const [endMode, setEndMode] = useState('never') // never | custom
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDate(initial?.date || '')
    setStartTime(roundToQuarter(initial?.startTime) || '')
    setDurationMins(30)
    setProjectId('')
    setParticipantIds(initial?.participantIds || [])
    setMeetLink('')
    setNotes('')
    setFreeSlots(null)
    setError('')
    setRepeat(false)
    setFrequency('weekly')
    setWeekdays([])
    setEndMode('never')
    setEndDate('')
    api.get('/projects').then(r => setProjects(r.data)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  const toggleWeekday = (d) => setWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b))
  const projectMemberIds = projects.find(p => String(p.id) === String(projectId))?.members?.map(pm => pm.user.id) || []

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
    if (!projectId) { setError('Elegí un proyecto para la reunión'); return }
    if (repeat) {
      if (frequency === 'weekly' && weekdays.length === 0) { setError('Elegí al menos un día de la semana.'); return }
      if (endMode === 'custom' && !endDate) { setError('Elegí la fecha de finalización o seleccioná "Nunca".'); return }
      if (endMode === 'custom' && endDate && endDate < date) { setError('La fecha de finalización no puede ser anterior a la primera reunión.'); return }
    }
    setSaving(true)
    setError('')
    try {
      const body = {
        title: title.trim(), date, startTime, durationMins,
        projectId,
        participantIds,
        meetLink: meetLink.trim() || null,
        notes: notes.trim() || null,
      }
      if (repeat) {
        body.recurrence = {
          frequency,
          ...(frequency === 'weekly' ? { weekdays } : {}),
          ...(endMode === 'custom' && endDate ? { endDate } : {}),
        }
      }
      const res = await api.post('/calendar/events', body)
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
            <select value={startTime} onChange={e => setStartTime(e.target.value)} className={INPUT_CLS}>
              <option value="" disabled>Elegir</option>
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Duración</label>
            <select value={durationMins} onChange={e => setDurationMins(Number(e.target.value))} className={INPUT_CLS}>
              {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL_CLS}>Proyecto</label>
          <div className="mt-1">
            <ProjectSearchSelect projects={projects} value={projectId} onChange={setProjectId} />
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
            Cada invitado que acepte le va a ver aparecer una tarea en su dashboard en este proyecto (con el título de la reunión) — y vas a poder iniciar la reunión real (con cronómetro) una vez que llegue la hora.
          </p>
        </div>

        <div>
          <label className={LABEL_CLS}>Participantes</label>
          <div className="mt-1">
            <PeoplePicker
              value={participantIds} onChange={setParticipantIds} excludeIds={user ? [user.id] : []}
              projectMemberIds={projectMemberIds}
            />
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
          <button
            type="button"
            onClick={() => setRepeat(r => !r)}
            className={`w-full rounded-lg py-1.5 text-xs font-medium border transition-colors ${
              repeat
                ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 text-primary-700 dark:text-primary-400'
                : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            🔁 Reunión recurrente
          </button>

          {repeat && (
            <div className="mt-2 space-y-3 rounded-lg bg-gray-50 dark:bg-gray-700/40 p-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Se repite</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[['daily', 'Diaria'], ['weekly', 'Semanal'], ['monthly', 'Mensual'], ['annual', 'Anual']].map(([val, lbl]) => (
                    <button
                      key={val} type="button" onClick={() => setFrequency(val)}
                      className={`rounded-md py-1.5 text-xs font-medium border transition-colors ${
                        frequency === val
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {frequency === 'weekly' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Los días</label>
                  <div className="flex gap-1">
                    {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((lbl, idx) => (
                      <button
                        key={idx} type="button" onClick={() => toggleWeekday(idx)}
                        className={`flex-1 rounded-md py-1.5 text-[11px] font-medium border transition-colors ${
                          weekdays.includes(idx)
                            ? 'bg-primary-600 border-primary-600 text-white'
                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(frequency === 'monthly' || frequency === 'annual') && date && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {frequency === 'monthly'
                    ? `Se repite el día ${Number(date.slice(8, 10))} de cada mes.`
                    : `Se repite cada año en esa misma fecha.`}
                </p>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Fecha de finalización</label>
                <div className="flex gap-2 items-center">
                  <select
                    value={endMode} onChange={e => setEndMode(e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="never">Nunca</option>
                    <option value="custom">Personalizada</option>
                  </select>
                  {endMode === 'custom' && (
                    <input
                      type="date" min={date} value={endDate} onChange={e => setEndDate(e.target.value)}
                      className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  )}
                </div>
              </div>

              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Cada ocurrencia se agenda por separado — cada invitado la acepta cuando le toca, y aparece como tarea del día en su dashboard.
              </p>
            </div>
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
