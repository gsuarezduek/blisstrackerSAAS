import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'
import { adminMemberOptions } from '../../utils/adminMembers'
import { avatarUrl } from '../../utils/avatarUrl'
import RichTextEditor from '../RichTextEditor'
import DOMPurify from 'dompurify'

export function currentWeekStr() {
  const now = new Date()
  // ISO week: move to Thursday of this week, then count from Jan 1
  const thursday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = thursday.getUTCDay() || 7   // 1=Mon … 7=Sun
  thursday.setUTCDate(thursday.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7)
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function adjWeek(weekStr, delta) {
  const match = weekStr.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return weekStr
  const year = parseInt(match[1])
  const week = parseInt(match[2])
  // Compute Monday of this ISO week
  const jan4    = new Date(Date.UTC(year, 0, 4))
  const dow4    = jan4.getUTCDay() || 7
  const monday  = new Date(Date.UTC(year, 0, 4 - dow4 + 1 + (week - 1) * 7))
  monday.setUTCDate(monday.getUTCDate() + delta * 7)

  // Re-derive week string from new Monday
  const thursday = new Date(monday)
  thursday.setUTCDate(monday.getUTCDate() + 3)
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
  const newWeek = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7)
  return `${thursday.getUTCFullYear()}-W${String(newWeek).padStart(2, '0')}`
}

export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function weekLabel(weekStr) {
  const match = weekStr.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return weekStr
  const year = parseInt(match[1])
  const week = parseInt(match[2])
  const jan4   = new Date(Date.UTC(year, 0, 4))
  const dow4   = jan4.getUTCDay() || 7
  const monday = new Date(Date.UTC(year, 0, 4 - dow4 + 1 + (week - 1) * 7))
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const fmtD = (d) => `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`
  return `Sem. ${week} · ${fmtD(monday)}–${fmtD(sunday)}`
}

// ─── Helpers de cronómetro (reunión L10) ──────────────────────────────────────

// Duración en minutos → "1h 05m" / "12m".
export function fmtDuration(mins) {
  if (mins == null) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

// Segundos transcurridos → "12:34" / "1:02:05".
export function fmtElapsed(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// ─── AddParticipant ────────────────────────────────────────────────────────────
// Dropdown para sumar un participante a la reunión (miembros activos del workspace).

export function AddParticipant({ members, existingIds, onAdd }) {
  const [open, setOpen] = useState(false)
  const avail = members.filter(m => !existingIds.has(m.id))
  if (avail.length === 0) return null
  const team   = avail.filter(m => m.inTeam)
  const others = avail.filter(m => !m.inTeam)

  function pick(id) { onAdd(id); setOpen(false) }

  const row = (m) => (
    <button key={m.id} onClick={() => pick(m.id)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center gap-2">
      <img src={avatarUrl(m.avatar)} alt="" className="w-5 h-5 rounded-full object-cover" />{m.name}
    </button>
  )

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
      >
        + Participante
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg w-56 max-h-72 overflow-y-auto py-1">
            {team.length > 0 && (
              <>
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Equipo del proyecto</p>
                {team.map(row)}
              </>
            )}
            {others.length > 0 && (
              <>
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Otros del workspace</p>
                {others.map(row)}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── MeetingTimer ──────────────────────────────────────────────────────────────

export function MeetingTimer({ meeting, onStart, onFinish }) {
  const [, force] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!meeting?.running) return
    const id = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [meeting?.running])

  async function handleStartClick() {
    setBusy(true)
    try { await onStart() } finally { setBusy(false) }
  }
  async function handleFinishClick() {
    setBusy(true)
    try { await onFinish() } finally { setBusy(false) }
  }

  if (meeting?.running) {
    const secs = Math.max(0, Math.floor((Date.now() - new Date(meeting.startedAt).getTime()) / 1000))
    return (
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-mono font-semibold text-red-600 dark:text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {fmtElapsed(secs)}
        </span>
        <button
          onClick={handleFinishClick}
          disabled={busy}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
        >
          {busy ? 'Finalizando…' : '■ Finalizar'}
        </button>
      </div>
    )
  }

  if (meeting?.durationMins != null) {
    return <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">⏱ {fmtDuration(meeting.durationMins)}</span>
  }

  return (
    <button
      onClick={handleStartClick}
      disabled={busy}
      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
    >
      {busy ? 'Iniciando…' : '▶ Iniciar reunión'}
    </button>
  )
}

// ─── TodoDashboardLink ──────────────────────────────────────────────────────────
// Envía un To-Do de L10 al dashboard del responsable como tarea normal (hoy), futura
// (aparece en una fecha elegida) o recurrente (se repite) — mismas opciones que el
// modal de "Agregar tarea" del dashboard.

const SEND_FREQ_OPTIONS = [['daily', 'Diaria'], ['weekly', 'Semanal'], ['monthly', 'Mensual'], ['annual', 'Anual']]
const SEND_WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export function TodoDashboardLink({ todo, meetingProjectReady, onSend }) {
  const [open, setOpen]         = useState(false)
  const [sending, setSending]   = useState(false)
  const [mode, setMode]         = useState('now') // now | future | recurring
  const [scheduledDate, setScheduledDate] = useState('')
  const [frequency, setFrequency]         = useState('weekly')
  const [weekdays, setWeekdays]           = useState([])
  const [recurDate, setRecurDate]         = useState(() => new Date().toLocaleDateString('en-CA'))
  const [endMode, setEndMode]             = useState('never')
  const [endDate, setEndDate]             = useState('')
  const [err, setErr]                     = useState('')
  const boxRef = useRef(null)

  const todayStr = new Date().toLocaleDateString('en-CA')
  const toggleWeekday = d => setWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b))

  useEffect(() => {
    if (!open) return
    function handleClick(e) { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Ya vinculado → badge de estado (verde si la tarea ya se completó).
  if (todo.taskId) {
    const done = todo.task?.status === 'COMPLETED'
    const recurring = !done && todo.task?.recurrenceId
    const future    = !done && !recurring && todo.task?.scheduledFor
    const icon  = done ? '📋' : recurring ? '🔁' : future ? '📅' : '📋'
    const label = done ? 'Hecha' : recurring ? 'Recurrente' : future ? 'Programada' : 'En dashboard'
    const title = done
      ? 'Tarea completada en el dashboard'
      : recurring ? 'Se convirtió en una tarea recurrente del responsable'
      : future    ? `Tarea futura del responsable — aparece el ${todo.task.scheduledFor}`
      : 'Enviada al dashboard del responsable'
    return (
      <span
        title={title}
        className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
          done
            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
            : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
        }`}
      >
        {icon} {label}
      </span>
    )
  }

  // Sin responsable → no se puede enviar.
  if (!todo.ownerId) {
    return (
      <span
        title="Asigná un responsable para enviarla al dashboard"
        className="shrink-0 text-gray-300 dark:text-gray-600 text-sm px-1 cursor-not-allowed select-none"
      >
        📋
      </span>
    )
  }

  // Sin proyecto de EOS configurado → deshabilitado con aviso.
  if (!meetingProjectReady) {
    return (
      <span
        title="Configurá el proyecto de EOS en Preferencias → Módulos adicionales"
        className="shrink-0 text-gray-300 dark:text-gray-600 text-sm px-1 cursor-not-allowed select-none"
      >
        📋
      </span>
    )
  }

  function validate() {
    if (mode === 'future') {
      if (!scheduledDate) return 'Elegí la fecha en que debe aparecer la tarea.'
      if (scheduledDate <= todayStr) return 'La fecha debe ser posterior a hoy.'
    }
    if (mode === 'recurring') {
      if (frequency === 'weekly' && weekdays.length === 0) return 'Elegí al menos un día de la semana.'
      if ((frequency === 'monthly' || frequency === 'annual') && !recurDate) return 'Elegí desde el calendario el día en que se repite.'
      if (endMode === 'custom' && !endDate) return 'Elegí la fecha de finalización o seleccioná "Nunca".'
      if (endMode === 'custom' && endDate && endDate < todayStr) return 'La fecha de finalización no puede ser anterior a hoy.'
    }
    return ''
  }

  async function submit() {
    const validationErr = validate()
    if (validationErr) { setErr(validationErr); return }
    setErr('')
    const opts = {}
    if (mode === 'future') {
      opts.scheduledFor = scheduledDate
    } else if (mode === 'recurring') {
      opts.recurrence = {
        frequency,
        ...(frequency === 'weekly' ? { weekdays } : {}),
        ...(frequency === 'monthly' ? { dayOfMonth: Number(recurDate.slice(8, 10)) } : {}),
        ...(frequency === 'annual' ? { dayOfMonth: Number(recurDate.slice(8, 10)), month: Number(recurDate.slice(5, 7)) } : {}),
        ...(endMode === 'custom' && endDate ? { endDate } : {}),
      }
    }
    setSending(true)
    const ok = await onSend(todo.id, opts)   // sin projectId: el backend usa el proyecto de EOS configurado
    setSending(false)
    if (ok !== false) setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={sending}
        title="Enviar al dashboard del responsable"
        className={`opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary-500 text-sm transition-all px-1 disabled:opacity-50 ${open ? 'opacity-100 text-primary-500' : ''}`}
      >
        📋
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg w-64 p-3 space-y-2.5 text-left">
          <div className="flex gap-1">
            {[['now', 'Ahora'], ['future', '📅 Futura'], ['recurring', '🔁 Recurrente']].map(([val, lbl]) => (
              <button
                key={val}
                type="button"
                onClick={() => { setMode(val); setErr('') }}
                className={`flex-1 rounded-md py-1 text-[11px] font-medium border transition-colors ${
                  mode === val
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {mode === 'future' && (
            <div>
              <input
                type="date"
                min={todayStr}
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">Aparece en el dashboard del responsable ese día.</p>
            </div>
          )}

          {mode === 'recurring' && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-1">
                {SEND_FREQ_OPTIONS.map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFrequency(val)}
                    className={`rounded-md py-1 text-[10px] font-medium border transition-colors ${
                      frequency === val
                        ? 'bg-primary-600 border-primary-600 text-white'
                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              {frequency === 'weekly' && (
                <div className="flex gap-1">
                  {SEND_WEEKDAY_LABELS.map((lbl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleWeekday(idx)}
                      className={`flex-1 rounded-md py-1 text-[9px] font-medium border transition-colors ${
                        weekdays.includes(idx)
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              )}

              {(frequency === 'monthly' || frequency === 'annual') && (
                <input
                  type="date"
                  value={recurDate}
                  onChange={e => setRecurDate(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              )}

              <div className="flex gap-1.5 items-center">
                <select
                  value={endMode}
                  onChange={e => setEndMode(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-1.5 py-1 text-[10px] focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="never">Nunca termina</option>
                  <option value="custom">Hasta...</option>
                </select>
                {endMode === 'custom' && (
                  <input
                    type="date"
                    min={todayStr}
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-1.5 py-1 text-[10px] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                )}
              </div>
            </div>
          )}

          {err && <p className="text-[10px] text-red-500">{err}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={sending}
            className="w-full rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium py-1.5 transition-colors disabled:opacity-60"
          >
            {sending ? 'Enviando…' : 'Enviar al dashboard'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── TodoItem ─────────────────────────────────────────────────────────────────

export function TodoItem({ todo, members, meetingProjectReady, onUpdate, onDelete, onSendToDashboard }) {
  const [editing, setEditing]     = useState(false)
  const [titleDraft, setTitleDraft] = useState(todo.title)
  const inputRef = useRef(null)

  useEffect(() => { setTitleDraft(todo.title) }, [todo.title])

  function saveTitle() {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== todo.title) {
      onUpdate(todo.id, { title: trimmed })
    } else {
      setTitleDraft(todo.title)
    }
    setEditing(false)
  }

  function startEdit() {
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const owner = members.find(m => m.id === todo.ownerId)

  return (
    <div className={`flex items-center gap-2.5 py-1.5 group rounded-lg px-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${todo.done ? 'opacity-60' : ''}`}>
      {/* Checkbox */}
      <button
        onClick={() => onUpdate(todo.id, { done: !todo.done })}
        className={`w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
          todo.done
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 dark:border-gray-500 hover:border-green-400'
        }`}
      >
        {todo.done && <span className="text-[10px] font-bold">✓</span>}
      </button>

      {/* Title */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          className="flex-1 text-sm bg-transparent border-b border-primary-400 text-gray-800 dark:text-gray-200 focus:outline-none py-0.5"
          value={titleDraft}
          onChange={e => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={e => {
            if (e.key === 'Enter')  saveTitle()
            if (e.key === 'Escape') { setTitleDraft(todo.title); setEditing(false) }
          }}
        />
      ) : (
        <span
          onClick={startEdit}
          className={`flex-1 text-sm cursor-text leading-snug ${
            todo.done
              ? 'line-through text-gray-400 dark:text-gray-500'
              : 'text-gray-800 dark:text-gray-200'
          }`}
          title="Click para editar"
        >
          {todo.title}
        </span>
      )}

      {/* Owner select */}
      <select
        value={todo.ownerId ?? ''}
        onChange={e => onUpdate(todo.id, { ownerId: e.target.value || null })}
        className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-400 max-w-[120px]"
      >
        <option value="">—</option>
        {adminMemberOptions(members, todo.ownerId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>

      {/* Owner avatar */}
      {owner && (
        <img
          src={avatarUrl(owner.avatar)}
          alt={owner.name}
          title={owner.name}
          className="w-6 h-6 rounded-full object-cover shrink-0"
        />
      )}

      {/* Vínculo con el dashboard */}
      <TodoDashboardLink todo={todo} meetingProjectReady={meetingProjectReady} onSend={onSendToDashboard} />

      {/* Delete */}
      <button
        onClick={() => { if (confirm('¿Eliminar este To-Do?')) onDelete(todo.id) }}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-sm transition-all px-1"
      >
        ✕
      </button>
    </div>
  )
}

// ─── QuickAddTodo ─────────────────────────────────────────────────────────────

export function QuickAddTodo({ onAdd }) {
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  async function submit() {
    if (!text.trim()) return
    await onAdd(text.trim())
    setText('')
    inputRef.current?.focus()
  }

  return (
    <div className="flex items-center gap-2 px-1 py-1.5 border-t border-gray-100 dark:border-gray-700 mt-1">
      <span className="w-5 h-5 shrink-0 rounded border-2 border-dashed border-gray-300 dark:border-gray-600" />
      <input
        ref={inputRef}
        type="text"
        className="flex-1 text-sm bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none"
        placeholder="Nuevo to-do... (Enter para guardar)"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter')  submit()
          if (e.key === 'Escape') setText('')
        }}
      />
    </div>
  )
}

// ─── MeetingCard ──────────────────────────────────────────────────────────────

export const MEETING_TYPES = [
  { value: 'weekly',    label: 'Semanal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'annual',    label: 'Anual' },
]

export function MeetingCard({ week, meeting, members, meetingProjectReady, onSave, onStart, onFinish, onAddParticipant, onRemoveParticipant, onSeedFromProject }) {
  const [date, setDate]     = useState(meeting?.date || '')
  const [type, setType]     = useState(meeting?.type || 'weekly')
  const notes               = meeting?.notes || ''

  const started      = !!meeting?.started
  const participants = meeting?.participants || []
  // Miembros del equipo del proyecto que todavía no son participantes.
  const participantIds = new Set(participants.map(p => p.userId))
  const teamToAdd = members.filter(m => m.inTeam && !participantIds.has(m.id)).length

  // Edit/Save/Cancel del WYSIWYG (sólo para las notas)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft,   setNotesDraft]   = useState(notes)
  const [savingNotes,  setSavingNotes]  = useState(false)

  useEffect(() => {
    setDate(meeting?.date || '')
    setType(meeting?.type || 'weekly')
    setEditingNotes(false)
    setNotesDraft(meeting?.notes || '')
  }, [week, meeting?.id])

  function save(patch) {
    const payload = {
      date,
      type,
      ...patch,
    }
    onSave(payload)
  }

  function handleEditNotes() {
    setNotesDraft(notes)
    setEditingNotes(true)
  }

  async function handleSaveNotes() {
    setSavingNotes(true)
    try {
      await onSave({ date, type, notes: notesDraft })
      setEditingNotes(false)
    } finally {
      setSavingNotes(false)
    }
  }

  function handleCancelNotes() {
    setNotesDraft(notes)
    setEditingNotes(false)
  }

  const notesIsEmpty = !notes || notes === '<p></p>'

  return (
    <div className={`bg-white dark:bg-gray-800 border rounded-xl p-4 space-y-3 ${
      type === 'annual'    ? 'border-purple-300 dark:border-purple-700' :
      type === 'quarterly' ? 'border-amber-300 dark:border-amber-700' :
                             'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Registro de reunión
        </h4>
        {type !== 'weekly' && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            type === 'annual'
              ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
              : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
          }`}>
            {type === 'annual' ? '🎯 Reunión Anual' : '📊 Reunión Trimestral'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-6 items-end">
        {/* Fecha */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={e => { setDate(e.target.value); save({ date: e.target.value }) }}
            className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
        </div>

        {/* Tipo */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
          <select
            value={type}
            disabled={started}
            onChange={e => { setType(e.target.value); save({ type: e.target.value }) }}
            className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-60"
          >
            {MEETING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Cronómetro */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Duración</label>
          {!meeting?.running && meeting?.durationMins == null && !meetingProjectReady ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Configurá el proyecto de EOS en Preferencias
            </span>
          ) : (
            <MeetingTimer
              meeting={meeting}
              onStart={() => onStart(week)}
              onFinish={() => onFinish(week)}
            />
          )}
        </div>
      </div>

      {/* Participantes */}
      <div>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">Participantes</label>
        <div className="flex flex-wrap items-center gap-2">
          {participants.map(p => {
            const live = p.taskStatus === 'IN_PROGRESS'
            const done = p.taskStatus === 'COMPLETED'
            return (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 text-xs font-medium pl-1 pr-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                title={live ? 'En reunión' : done ? 'Tiempo registrado' : ''}
              >
                <img src={avatarUrl(p.avatar)} alt="" className="w-5 h-5 rounded-full object-cover" />
                {p.name}
                {live && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                {done && <span className="text-green-500">✓</span>}
                {!started && (
                  <button
                    onClick={() => onRemoveParticipant(week, p.userId)}
                    className="text-gray-400 hover:text-red-500 ml-0.5"
                    title="Quitar"
                  >
                    ✕
                  </button>
                )}
              </span>
            )
          })}
          {!started && (
            <AddParticipant
              members={members}
              existingIds={new Set(participants.map(p => p.userId))}
              onAdd={userId => onAddParticipant(week, userId)}
            />
          )}
          {!started && teamToAdd > 0 && (
            <button
              onClick={() => onSeedFromProject(week)}
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border border-dashed border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            >
              ⟳ Traer equipo del proyecto ({teamToAdd})
            </button>
          )}
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 leading-snug">
          {started
            ? 'Se está contando el tiempo de cada participante en el proyecto de EOS; al finalizar queda registrado como tiempo trabajado.'
            : !meetingProjectReady
              ? 'Asociá un proyecto de EOS en Preferencias → Módulos adicionales para poder iniciar la reunión.'
              : 'Al iniciar la reunión se contará el tiempo de cada participante. No se puede iniciar si alguien tiene una tarea en curso.'}
        </p>
      </div>

      {/* Notas */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Notas / Decisiones / Compromisos</label>
          {!editingNotes && (
            <button
              onClick={handleEditNotes}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              {notesIsEmpty ? '+ Agregar' : 'Editar'}
            </button>
          )}
        </div>

        {editingNotes ? (
          <div>
            <RichTextEditor
              defaultContent={notesDraft}
              onChange={setNotesDraft}
              minHeight={220}
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="text-sm px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {savingNotes ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={handleCancelNotes}
                className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : notesIsEmpty ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic">
            Sin notas registradas todavía.
          </p>
        ) : (
          <div
            className="situation-content text-sm text-gray-700 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notes) }}
          />
        )}
      </div>
    </div>
  )
}

// ─── MeetingSection ───────────────────────────────────────────────────────────

export function MeetingSection() {
  const [week, setWeek]                  = useState(currentWeekStr)
  const [todos, setTodos]                = useState([])
  const [meeting, setMeeting]            = useState(null)
  const [members, setMembers]            = useState([])
  const [specialMeetings, setSpecialMeetings] = useState([])
  const [showSpecials, setShowSpecials]  = useState(false)
  const [meetingProjectId, setMeetingProjectId] = useState(null)
  const [loading, setLoading]            = useState(true)
  const [error, setError]                = useState(null)
  const seededWeeks = useRef(new Set())   // semanas donde ya auto-traje el equipo

  useEffect(() => { loadWeek() }, [week])
  useEffect(() => { loadSpecials() }, [])

  async function handleStartMeeting(wk) {
    try {
      const { data } = await api.post(`/eos/traction/meetings/${wk}/start`)
      setMeeting(data)
    } catch (err) {
      alert(err?.response?.data?.error || 'No se pudo iniciar la reunión')
    }
  }

  async function handleFinishMeeting(wk) {
    try {
      const { data } = await api.post(`/eos/traction/meetings/${wk}/finish`)
      setMeeting(data)
    } catch (err) {
      alert(err?.response?.data?.error || 'No se pudo finalizar la reunión')
    }
  }

  async function handleAddParticipant(wk, userId) {
    try {
      const { data } = await api.post(`/eos/traction/meetings/${wk}/participants`, { userId })
      setMeeting(data)
    } catch (err) {
      alert(err?.response?.data?.error || 'No se pudo agregar el participante')
    }
  }

  async function handleRemoveParticipant(wk, userId) {
    try {
      const { data } = await api.delete(`/eos/traction/meetings/${wk}/participants/${userId}`)
      setMeeting(data)
    } catch (err) {
      alert(err?.response?.data?.error || 'No se pudo quitar el participante')
    }
  }

  async function handleSeedFromProject(wk) {
    try {
      const { data } = await api.post(`/eos/traction/meetings/${wk}/participants/from-project`)
      setMeeting(data)
    } catch (err) {
      alert(err?.response?.data?.error || 'No se pudo traer el equipo del proyecto')
    }
  }

  async function loadWeek() {
    try {
      setLoading(true)
      setError(null)
      const { data } = await api.get(`/eos/traction/week?week=${week}`)
      setMembers(data.members)
      setTodos(data.todos)
      setMeetingProjectId(data.meetingProjectId ?? null)

      let meeting = data.meeting
      // Auto-traer el equipo del proyecto en la semana actual, la primera vez que se abre.
      if (
        !meeting &&
        week === currentWeekStr() &&
        data.meetingProjectId &&
        (data.members || []).some(m => m.inTeam) &&
        !seededWeeks.current.has(week)
      ) {
        seededWeeks.current.add(week)
        try {
          const res = await api.post(`/eos/traction/meetings/${week}/participants/from-project`)
          meeting = res.data
        } catch { /* si falla, queda sin participantes; se puede traer manualmente */ }
      }
      setMeeting(meeting)
    } catch {
      setError('No se pudo cargar la semana')
    } finally {
      setLoading(false)
    }
  }

  async function loadSpecials() {
    try {
      const { data } = await api.get('/eos/traction/meetings/special')
      setSpecialMeetings(data.meetings || [])
    } catch {}
  }

  async function handleAddTodo(title) {
    try {
      const { data } = await api.post('/eos/traction/todos', { title, week })
      setTodos(prev => [...prev, data])
    } catch {}
  }

  async function handleUpdateTodo(id, patch) {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    try {
      const { data } = await api.patch(`/eos/traction/todos/${id}`, patch)
      setTodos(prev => prev.map(t => t.id === id ? data : t))
    } catch { loadWeek() }
  }

  async function handleDeleteTodo(id) {
    setTodos(prev => prev.filter(t => t.id !== id))
    try {
      await api.delete(`/eos/traction/todos/${id}`)
    } catch { loadWeek() }
  }

  // Envía el To-Do al dashboard del responsable (crea + vincula la tarea) usando el
  // proyecto de EOS configurado en Preferencias (el backend lo resuelve solo). `opts`
  // puede traer `scheduledFor` (tarea futura) o `recurrence` (tarea recurrente).
  async function handleSendToDashboard(id, opts = {}) {
    try {
      const { data } = await api.post(`/eos/traction/todos/${id}/send-to-dashboard`, opts)
      setTodos(prev => prev.map(t => t.id === id ? data : t))
      return true
    } catch (err) {
      alert(err?.response?.data?.error || 'No se pudo enviar al dashboard')
      return false
    }
  }

  async function handleSaveMeeting(patch) {
    try {
      const { data } = await api.put(`/eos/traction/meetings/${week}`, patch)
      setMeeting(data)
      // Si el tipo cambió, refresco la lista de especiales
      if (patch.type !== undefined) loadSpecials()
    } catch {}
  }

  const doneCount  = todos.filter(t => t.done).length
  const totalCount = todos.length
  const rate       = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : null

  // Ordenar: pendientes primero, luego completados
  const sortedTodos = [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.order - b.order
  })

  // ── Navegación entre reuniones del mismo tipo (cuando estás en una trimestral/anual)
  const currentType = meeting?.type || 'weekly'
  const isSpecial   = currentType !== 'weekly'

  function specialNeighbors() {
    // Asume specialMeetings ordenadas por week DESC (lo devuelve el backend).
    const sameType = specialMeetings.filter(m => m.type === currentType)
    const idx      = sameType.findIndex(m => m.week === week)
    if (idx === -1) return { prev: null, next: null }
    return {
      prev: sameType[idx + 1]?.week ?? null, // más vieja (DESC)
      next: sameType[idx - 1]?.week ?? null, // más nueva
    }
  }

  const { prev: prevSpecialWeek, next: nextSpecialWeek } = isSpecial ? specialNeighbors() : { prev: null, next: null }

  return (
    <div className="space-y-5">
      {/* Week nav */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setWeek(w => adjWeek(w, -1))}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Semana anterior"
        >
          ◀
        </button>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 min-w-[180px] text-center">
          {weekLabel(week)}
        </span>
        <button
          onClick={() => setWeek(w => adjWeek(w, 1))}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Semana siguiente"
        >
          ▶
        </button>

        {/* Pills de navegación rápida */}
        {isSpecial ? (
          <div className="flex items-center gap-1 ml-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
            <button
              onClick={() => prevSpecialWeek && setWeek(prevSpecialWeek)}
              disabled={!prevSpecialWeek}
              className="px-3 py-1 text-xs font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← {currentType === 'annual' ? 'Anual' : 'Trimestral'} anterior
            </button>
            <button
              onClick={() => nextSpecialWeek && setWeek(nextSpecialWeek)}
              disabled={!nextSpecialWeek}
              className="px-3 py-1 text-xs font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Próxima {currentType === 'annual' ? 'anual' : 'trimestral'} →
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 ml-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
            {[
              { label: 'Anterior', delta: -1 },
              { label: 'Hoy',      delta:  0 },
              { label: 'Próxima',  delta:  1 },
            ].map(({ label, delta }) => {
              const target   = delta === 0 ? currentWeekStr() : adjWeek(currentWeekStr(), delta)
              const isActive = week === target
              return (
                <button
                  key={label}
                  onClick={() => setWeek(target)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {/* Dropdown reuniones especiales */}
        {specialMeetings.length > 0 && (
          <div className="relative ml-2">
            <button
              onClick={() => setShowSpecials(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800 transition-colors"
            >
              📋 Trimestrales / Anuales
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 transition-transform ${showSpecials ? 'rotate-180' : ''}`}>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
            {showSpecials && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowSpecials(false)} />
                <div className="absolute right-0 mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg w-72 max-h-80 overflow-y-auto py-1">
                  {specialMeetings.map(m => {
                    const isActive = m.week === week
                    return (
                      <button
                        key={m.week}
                        onClick={() => { setWeek(m.week); setShowSpecials(false) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2 ${
                          isActive ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            m.type === 'annual'
                              ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                              : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                          }`}>
                            {m.type === 'annual' ? 'Anual' : 'Trim.'}
                          </span>
                          <span className="text-gray-800 dark:text-gray-200">{weekLabel(m.week)}</span>
                        </div>
                        {m.durationMins != null && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">⏱ {fmtDuration(m.durationMins)}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-gray-400 py-4 text-center">Cargando semana...</p>}
      {!loading && error && <p className="text-sm text-red-500 py-4 text-center">{error}</p>}

      {!loading && !error && (
        <>
          {/* Meeting card */}
          <MeetingCard
            week={week}
            meeting={meeting}
            members={members}
            meetingProjectReady={!!meetingProjectId}
            onSave={handleSaveMeeting}
            onStart={handleStartMeeting}
            onFinish={handleFinishMeeting}
            onAddParticipant={handleAddParticipant}
            onRemoveParticipant={handleRemoveParticipant}
            onSeedFromProject={handleSeedFromProject}
          />

          {/* To-Dos */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                To-Dos de la semana
              </h4>
              {rate !== null && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  rate >= 90 ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                  : rate >= 70 ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                  : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                }`}>
                  {doneCount}/{totalCount} · {rate}%
                </span>
              )}
            </div>

            {/* Lista */}
            {sortedTodos.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">
                Sin to-dos para esta semana.
              </p>
            )}

            <div>
              {sortedTodos.map(todo => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  members={members}
                  meetingProjectReady={!!meetingProjectId}
                  onUpdate={handleUpdateTodo}
                  onDelete={handleDeleteTodo}
                  onSendToDashboard={handleSendToDashboard}
                />
              ))}
            </div>

            {/* Quick add */}
            <QuickAddTodo onAdd={handleAddTodo} />
          </div>

          {/* Meta: objetivo 90% */}
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            Meta EOS: ≥90% de to-dos completados por semana
          </p>
        </>
      )}
    </div>
  )
}

// ─── TraccionTab ──────────────────────────────────────────────────────────────

