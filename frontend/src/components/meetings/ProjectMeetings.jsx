import { useState, useEffect, useRef, useMemo } from 'react'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'
import RichTextEditor from '../RichTextEditor'
import DOMPurify from 'dompurify'
import '../situation-editor.css'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MEETING_TYPES = [
  { value: 'internal', label: 'Interna (equipo)', short: 'Interna', emoji: '👥',
    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800' },
  { value: 'client',   label: 'Con cliente',      short: 'Cliente', emoji: '🤝',
    badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800' },
]
const typeMeta = (t) => MEETING_TYPES.find(x => x.value === t) || MEETING_TYPES[0]

// Opciones del selector de responsable: equipo del proyecto primero, resto del
// workspace después (mismo criterio que AddTaskModal). Cualquiera es asignable.
function OwnerOptions({ members }) {
  const team   = members.filter(m => m.inTeam)
  const others = members.filter(m => !m.inTeam)
  return (
    <>
      <option value="">—</option>
      {team.length > 0 && (
        <optgroup label="Equipo del proyecto">
          {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </optgroup>
      )}
      {others.length > 0 && (
        <optgroup label="Otros del workspace">
          {others.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </optgroup>
      )}
    </>
  )
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function dateLabel(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '')
  if (!m) return str || '—'
  return `${parseInt(m[3])} ${MONTHS_SHORT[parseInt(m[2]) - 1]} ${m[1]}`
}

// Duración en minutos → "1h 05m" / "12m".
function fmtDuration(mins) {
  if (mins == null) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

// Cronómetro en curso (segundos transcurridos) → "12:34" / "1:02:05".
function fmtElapsed(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// ─── AddParticipant ─────────────────────────────────────────────────────────
// Dropdown para sumar un participante (equipo del proyecto primero, resto después).

function AddParticipant({ members, existingIds, onAdd }) {
  const [open, setOpen] = useState(false)
  const avail = members.filter(m => !existingIds.has(m.id))
  if (avail.length === 0) return null
  const team   = avail.filter(m => m.inTeam)
  const others = avail.filter(m => !m.inTeam)

  function pick(id) { onAdd(id); setOpen(false) }

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
                {team.map(m => (
                  <button key={m.id} onClick={() => pick(m.id)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center gap-2">
                    <img src={avatarUrl(m.avatar)} alt="" className="w-5 h-5 rounded-full object-cover" />{m.name}
                  </button>
                ))}
              </>
            )}
            {others.length > 0 && (
              <>
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Otros del workspace</p>
                {others.map(m => (
                  <button key={m.id} onClick={() => pick(m.id)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center gap-2">
                    <img src={avatarUrl(m.avatar)} alt="" className="w-5 h-5 rounded-full object-cover" />{m.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── TodoDashboardLink ────────────────────────────────────────────────────────
// Botón/badge para enviar el to-do al dashboard del responsable (en este proyecto).

function TodoDashboardLink({ todo, onSend }) {
  const [sending, setSending] = useState(false)

  if (todo.taskId) {
    const done = todo.task?.status === 'COMPLETED'
    return (
      <span
        title={done ? 'Tarea completada en el dashboard' : 'Enviada al dashboard del responsable'}
        className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
          done
            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
            : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
        }`}
      >
        📋 {done ? 'Hecha' : 'En dashboard'}
      </span>
    )
  }

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

  async function submit() {
    setSending(true)
    await onSend(todo.id)
    setSending(false)
  }

  return (
    <button
      onClick={submit}
      disabled={sending}
      title="Enviar al dashboard del responsable"
      className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary-500 text-sm transition-all px-1 disabled:opacity-50"
    >
      {sending ? '…' : '📋'}
    </button>
  )
}

// ─── TodoItem ─────────────────────────────────────────────────────────────────

function TodoItem({ todo, members, canEdit, onUpdate, onDelete, onSendToDashboard }) {
  const [editing, setEditing]       = useState(false)
  const [titleDraft, setTitleDraft] = useState(todo.title)
  const inputRef = useRef(null)

  useEffect(() => { setTitleDraft(todo.title) }, [todo.title])

  function saveTitle() {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== todo.title) onUpdate(todo.id, { title: trimmed })
    else setTitleDraft(todo.title)
    setEditing(false)
  }

  const owner = members.find(m => m.id === todo.ownerId)

  return (
    <div className={`flex items-center gap-2.5 py-1.5 group rounded-lg px-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${todo.done ? 'opacity-60' : ''}`}>
      <button
        onClick={() => canEdit && onUpdate(todo.id, { done: !todo.done })}
        disabled={!canEdit}
        className={`w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
          todo.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 dark:border-gray-500 hover:border-green-400'
        } disabled:cursor-not-allowed`}
      >
        {todo.done && <span className="text-[10px] font-bold">✓</span>}
      </button>

      {editing && canEdit ? (
        <input
          ref={inputRef}
          type="text"
          autoFocus
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
          onClick={() => canEdit && setEditing(true)}
          className={`flex-1 text-sm leading-snug ${canEdit ? 'cursor-text' : ''} ${
            todo.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'
          }`}
          title={canEdit ? 'Click para editar' : undefined}
        >
          {todo.title}
        </span>
      )}

      {canEdit ? (
        <select
          value={todo.ownerId ?? ''}
          onChange={e => onUpdate(todo.id, { ownerId: e.target.value || null })}
          className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-400 max-w-[120px]"
        >
          <OwnerOptions members={members} />
        </select>
      ) : owner ? (
        <span className="text-xs text-gray-500 dark:text-gray-400 max-w-[120px] truncate">{owner.name}</span>
      ) : null}

      {owner && (
        <img src={avatarUrl(owner.avatar)} alt={owner.name} title={owner.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
      )}

      <TodoDashboardLink todo={todo} onSend={onSendToDashboard} />

      {canEdit && (
        <button
          onClick={() => onDelete(todo.id)}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-sm transition-all px-1"
        >
          ✕
        </button>
      )}
    </div>
  )
}

// ─── QuickAddTodo ─────────────────────────────────────────────────────────────

function QuickAddTodo({ onAdd }) {
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
        placeholder="Nueva tarea... (Enter para guardar)"
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

// ─── MeetingTimer ─────────────────────────────────────────────────────────────

function MeetingTimer({ meeting, canEdit, onStart, onFinish }) {
  const [, force] = useState(0)

  // Tick cada segundo mientras la reunión está en curso (cronómetro vivo).
  useEffect(() => {
    if (!meeting.running) return
    const id = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [meeting.running])

  if (meeting.running) {
    const secs = Math.max(0, Math.floor((Date.now() - new Date(meeting.startedAt).getTime()) / 1000))
    return (
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-mono font-semibold text-red-600 dark:text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {fmtElapsed(secs)}
        </span>
        {canEdit && (
          <button
            onClick={onFinish}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            ■ Finalizar
          </button>
        )}
      </div>
    )
  }

  if (meeting.durationMins != null) {
    return (
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
        ⏱ {fmtDuration(meeting.durationMins)}
      </span>
    )
  }

  return canEdit ? (
    <button
      onClick={onStart}
      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
    >
      ▶ Iniciar reunión
    </button>
  ) : (
    <span className="text-xs text-gray-400 dark:text-gray-500">Sin iniciar</span>
  )
}

// ─── MeetingCard ──────────────────────────────────────────────────────────────

function MeetingCard({ meeting, members, canEdit, expanded, onToggle, onSave, onDelete, onStart, onFinish,
                       onAddParticipant, onRemoveParticipant, onAddTodo, onUpdateTodo, onDeleteTodo, onSendToDashboard }) {
  const tm = typeMeta(meeting.type)
  const notes = meeting.notes || ''
  const notesIsEmpty = !notes || notes === '<p></p>'

  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft]     = useState(notes)
  const [savingNotes, setSavingNotes]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [titleDraft, setTitleDraft]     = useState(meeting.title || '')

  useEffect(() => { setTitleDraft(meeting.title || '') }, [meeting.title])

  function saveTitle() {
    const trimmed = titleDraft.trim()
    if (trimmed !== (meeting.title || '')) onSave(meeting.id, { title: trimmed })
  }

  const doneCount  = meeting.todos.filter(t => t.done).length
  const totalCount = meeting.todos.length

  async function handleSaveNotes() {
    setSavingNotes(true)
    try {
      await onSave(meeting.id, { notes: notesDraft })
      setEditingNotes(false)
    } finally {
      setSavingNotes(false)
    }
  }

  const sortedTodos = [...meeting.todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.order - b.order
  })

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-l-4 ${tm.border} transition-all`}
         style={{ borderLeftColor: meeting.type === 'client' ? '#10b981' : '#3b82f6' }}>
      {/* Header (colapsable) */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={onToggle}>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${tm.badge}`}>
          {tm.emoji} {tm.short}
        </span>
        {meeting.title ? (
          <span className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{meeting.title}</span>
            <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">{dateLabel(meeting.date)}</span>
          </span>
        ) : (
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{dateLabel(meeting.date)}</span>
        )}
        <div className="flex-1" />
        {meeting.running && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> En curso
          </span>
        )}
        {!meeting.running && meeting.durationMins != null && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500">⏱ {fmtDuration(meeting.durationMins)}</span>
        )}
        {totalCount > 0 && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500">✓ {doneCount}/{totalCount}</span>
        )}
        <span className={`text-gray-400 text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
      </div>

      {/* Cuerpo */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
          {/* Título */}
          <div className="pt-3">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Título</label>
            <input
              type="text"
              value={titleDraft}
              disabled={!canEdit}
              maxLength={120}
              placeholder="Ej: Kickoff de campaña, Revisión mensual…"
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.target.blur() }
                if (e.key === 'Escape') { setTitleDraft(meeting.title || ''); e.target.blur() }
              }}
              className="w-full max-w-md text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-60"
            />
          </div>

          {/* Fecha · Tipo · Cronómetro */}
          <div className="flex flex-wrap gap-x-6 gap-y-3 items-end pt-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
              <input
                type="date"
                value={meeting.date}
                disabled={!canEdit}
                onChange={e => onSave(meeting.id, { date: e.target.value })}
                className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
              <select
                value={meeting.type}
                disabled={!canEdit || meeting.started}
                onChange={e => onSave(meeting.id, { type: e.target.value })}
                className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-60"
              >
                {MEETING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Duración</label>
              <MeetingTimer
                meeting={meeting}
                canEdit={canEdit}
                onStart={() => onStart(meeting.id)}
                onFinish={() => onFinish(meeting.id)}
              />
            </div>
          </div>

          {/* Participantes */}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">Participantes</label>
            <div className="flex flex-wrap items-center gap-2">
              {(meeting.participants || []).map(p => {
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
                    {canEdit && !meeting.started && (
                      <button
                        onClick={() => onRemoveParticipant(meeting.id, p.userId)}
                        className="text-gray-400 hover:text-red-500 ml-0.5"
                        title="Quitar"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                )
              })}
              {canEdit && !meeting.started && (
                <AddParticipant
                  members={members}
                  existingIds={new Set((meeting.participants || []).map(p => p.userId))}
                  onAdd={userId => onAddParticipant(meeting.id, userId)}
                />
              )}
            </div>
            {(meeting.participants || []).length === 0 && !canEdit && (
              <p className="text-xs text-gray-400 dark:text-gray-500">Sin participantes.</p>
            )}
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 leading-snug">
              {meeting.started
                ? 'Al iniciar se cuenta el tiempo de cada participante en este proyecto; al finalizar queda registrado como tiempo del proyecto.'
                : 'Al iniciar la reunión se contará el tiempo de cada participante en este proyecto. No se puede iniciar si alguien tiene una tarea en curso.'}
            </p>
          </div>

          {/* Notas */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">Notas / Anotaciones de la reunión</label>
              {canEdit && !editingNotes && (
                <button
                  onClick={() => { setNotesDraft(notes); setEditingNotes(true) }}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                >
                  {notesIsEmpty ? '+ Agregar' : 'Editar'}
                </button>
              )}
            </div>

            {editingNotes ? (
              <div>
                <RichTextEditor defaultContent={notesDraft} onChange={setNotesDraft} minHeight={200} />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="text-sm px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                  >
                    {savingNotes ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    onClick={() => { setNotesDraft(notes); setEditingNotes(false) }}
                    className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : notesIsEmpty ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">Sin anotaciones todavía.</p>
            ) : (
              <div
                className="situation-content text-sm text-gray-700 dark:text-gray-300"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notes) }}
              />
            )}
          </div>

          {/* Tareas */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Tareas / Compromisos</label>
            <div className="mt-1">
              {sortedTodos.length === 0 && !canEdit && (
                <p className="text-xs text-gray-400 dark:text-gray-500 py-2">Sin tareas registradas.</p>
              )}
              {sortedTodos.map(todo => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  members={members}
                  canEdit={canEdit}
                  onUpdate={onUpdateTodo}
                  onDelete={onDeleteTodo}
                  onSendToDashboard={onSendToDashboard}
                />
              ))}
              {canEdit && <QuickAddTodo onAdd={title => onAddTodo(meeting.id, title)} />}
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 leading-snug">
              📋 Enviá una tarea al dashboard del responsable (en este proyecto). Al completarla, se tilda sola acá.
            </p>
          </div>

          {/* Eliminar */}
          {canEdit && (
            <div className="flex justify-end pt-1 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-lg transition-colors mt-2"
              >
                Eliminar reunión
              </button>
            </div>
          )}
        </div>
      )}

      {/* Confirmación de eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !deleting && setConfirmDelete(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md p-5"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 dark:text-white">¿Eliminar {meeting.title ? `“${meeting.title}”` : `la reunión del ${dateLabel(meeting.date)}`}?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Se borrarán las notas y las tareas de la reunión. Esta acción no se puede deshacer.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setDeleting(true); onDelete(meeting.id) }}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {deleting ? 'Eliminando…' : 'Eliminar reunión'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ProjectMeetings (root) ─────────────────────────────────────────────────────

export default function ProjectMeetings({ projectId, canEdit }) {
  const [meetings, setMeetings] = useState([])
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [openId, setOpenId]     = useState(null)
  const [creating, setCreating] = useState(false)
  const [query, setQuery]       = useState('')

  // Buscador: filtra en memoria por título y fecha (label legible + fecha cruda).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return meetings
    return meetings.filter(m => {
      const hay = `${m.title || ''} ${m.date || ''} ${dateLabel(m.date)}`.toLowerCase()
      return hay.includes(q)
    })
  }, [meetings, query])

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.get(`/projects/${projectId}/meetings`)
      .then(r => {
        if (!alive) return
        setMeetings(r.data.meetings || [])
        setMembers(r.data.members || [])
        // Abrir la reunión más reciente por defecto.
        if (r.data.meetings?.length) setOpenId(r.data.meetings[0].id)
      })
      .catch(() => { if (alive) setError('No se pudieron cargar las reuniones') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [projectId])

  function replaceMeeting(updated) {
    setMeetings(prev => prev.map(m => m.id === updated.id ? { ...updated, todos: updated.todos ?? m.todos } : m))
  }

  async function handleCreate() {
    setCreating(true)
    setError('')
    try {
      const { data } = await api.post(`/projects/${projectId}/meetings`, {})
      setMeetings(prev => [{ ...data, todos: data.todos || [] }, ...prev])
      setOpenId(data.id)
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo crear la reunión')
    } finally {
      setCreating(false)
    }
  }

  async function handleSaveMeeting(id, patch) {
    try {
      const { data } = await api.patch(`/projects/${projectId}/meetings/${id}`, patch)
      replaceMeeting(data)
    } catch (e) { setError(e.response?.data?.error || 'No se pudo guardar') }
  }

  async function handleDeleteMeeting(id) {
    setMeetings(prev => prev.filter(m => m.id !== id))
    try { await api.delete(`/projects/${projectId}/meetings/${id}`) }
    catch { setError('No se pudo eliminar') }
  }

  async function handleStart(id) {
    try {
      const { data } = await api.post(`/projects/${projectId}/meetings/${id}/start`)
      replaceMeeting(data)
    } catch (e) { setError(e.response?.data?.error || 'No se pudo iniciar') }
  }

  async function handleFinish(id) {
    try {
      const { data } = await api.post(`/projects/${projectId}/meetings/${id}/finish`)
      replaceMeeting(data)
    } catch (e) { setError(e.response?.data?.error || 'No se pudo finalizar') }
  }

  async function handleAddParticipant(meetingId, userId) {
    try {
      const { data } = await api.post(`/projects/${projectId}/meetings/${meetingId}/participants`, { userId })
      replaceMeeting(data)
    } catch (e) { setError(e.response?.data?.error || 'No se pudo agregar el participante') }
  }

  async function handleRemoveParticipant(meetingId, userId) {
    try {
      const { data } = await api.delete(`/projects/${projectId}/meetings/${meetingId}/participants/${userId}`)
      replaceMeeting(data)
    } catch (e) { setError(e.response?.data?.error || 'No se pudo quitar el participante') }
  }

  function patchTodos(meetingId, fn) {
    setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, todos: fn(m.todos) } : m))
  }

  async function handleAddTodo(meetingId, title) {
    try {
      const { data } = await api.post(`/projects/${projectId}/meetings/${meetingId}/todos`, { title })
      patchTodos(meetingId, todos => [...todos, data])
    } catch (e) { setError(e.response?.data?.error || 'No se pudo agregar la tarea') }
  }

  function findMeetingOf(todoId) {
    return meetings.find(m => m.todos.some(t => t.id === todoId))
  }

  async function handleUpdateTodo(todoId, patch) {
    const meeting = findMeetingOf(todoId)
    if (!meeting) return
    patchTodos(meeting.id, todos => todos.map(t => t.id === todoId ? { ...t, ...patch } : t))
    try {
      const { data } = await api.patch(`/projects/${projectId}/meetings/${meeting.id}/todos/${todoId}`, patch)
      patchTodos(meeting.id, todos => todos.map(t => t.id === todoId ? data : t))
    } catch { setError('No se pudo guardar la tarea') }
  }

  async function handleDeleteTodo(todoId) {
    const meeting = findMeetingOf(todoId)
    if (!meeting) return
    patchTodos(meeting.id, todos => todos.filter(t => t.id !== todoId))
    try { await api.delete(`/projects/${projectId}/meetings/${meeting.id}/todos/${todoId}`) }
    catch { setError('No se pudo eliminar la tarea') }
  }

  async function handleSendToDashboard(todoId) {
    const meeting = findMeetingOf(todoId)
    if (!meeting) return false
    try {
      const { data } = await api.post(`/projects/${projectId}/meetings/${meeting.id}/todos/${todoId}/send-to-dashboard`)
      patchTodos(meeting.id, todos => todos.map(t => t.id === todoId ? data : t))
      return true
    } catch (e) {
      alert(e?.response?.data?.error || 'No se pudo enviar al dashboard')
      return false
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">Cargando reuniones…</p>
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Registro de reuniones del proyecto: fecha, tipo, notas libres y tareas con responsable que se conectan con el dashboard.
        </p>
        {canEdit && (
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors whitespace-nowrap"
          >
            {creating ? 'Creando…' : '+ Nueva reunión'}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {meetings.length > 3 && (
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por título o fecha…"
            className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-xl pl-9 pr-9 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
              title="Limpiar"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {meetings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">🗓️</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay reuniones registradas.</p>
          {canEdit && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Creá la primera con "+ Nueva reunión".</p>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-gray-500 dark:text-gray-400">Ninguna reunión coincide con "{query}".</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(meeting => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              members={members}
              canEdit={canEdit}
              expanded={openId === meeting.id}
              onToggle={() => setOpenId(prev => prev === meeting.id ? null : meeting.id)}
              onSave={handleSaveMeeting}
              onDelete={handleDeleteMeeting}
              onStart={handleStart}
              onFinish={handleFinish}
              onAddParticipant={handleAddParticipant}
              onRemoveParticipant={handleRemoveParticipant}
              onAddTodo={handleAddTodo}
              onUpdateTodo={handleUpdateTodo}
              onDeleteTodo={handleDeleteTodo}
              onSendToDashboard={handleSendToDashboard}
            />
          ))}
        </div>
      )}
    </div>
  )
}
