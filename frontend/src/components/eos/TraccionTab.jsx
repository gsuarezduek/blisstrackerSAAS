import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'

// ─── Constantes de status ─────────────────────────────────────────────────────

const STATUS_ROCK = {
  not_started: {
    label:  'No iniciada',
    dot:    'bg-gray-400',
    border: 'border-l-gray-300 dark:border-l-gray-600',
    badge:  'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
    sortW:  3,
  },
  on_track: {
    label:  'On Track',
    dot:    'bg-green-500',
    border: 'border-l-green-400 dark:border-l-green-600',
    badge:  'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    sortW:  1,
  },
  off_track: {
    label:  'Off Track',
    dot:    'bg-red-500',
    border: 'border-l-red-400 dark:border-l-red-600',
    badge:  'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
    sortW:  0,
  },
  complete: {
    label:  'Completa',
    dot:    'bg-blue-500',
    border: 'border-l-blue-400 dark:border-l-blue-600',
    badge:  'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    sortW:  2,
  },
}

// ─── Helpers de tiempo ────────────────────────────────────────────────────────

function currentQuarter() {
  const now = new Date()
  return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`
}

function quarterLabel(q) {
  if (!q) return ''
  const [year, qPart] = q.split('-')
  return `${qPart} ${year}`
}

function adjQuarter(q, delta) {
  const [year, qPart] = q.split('-')
  let y = parseInt(year)
  let n = parseInt(qPart.replace('Q', ''))
  n += delta
  if (n > 4) { n = 1; y++ }
  if (n < 1) { n = 4; y-- }
  return `${y}-Q${n}`
}

function currentWeekStr() {
  const now = new Date()
  // ISO week: Thursday rule
  const thursday = new Date(now)
  thursday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7) + 3)
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4))
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7)
  const year = thursday.getUTCFullYear()
  return `${year}-W${String(week).padStart(2, '0')}`
}

function adjWeek(weekStr, delta) {
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
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4))
  const newWeek = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7)
  return `${thursday.getUTCFullYear()}-W${String(newWeek).padStart(2, '0')}`
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function weekLabel(weekStr) {
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

function avatarUrl(avatar) {
  return avatar ? `/perfiles/${avatar}` : '/perfiles/2bee.png'
}

// ─── RatingPicker ─────────────────────────────────────────────────────────────

function RatingPicker({ value, onChange }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
        const selected = value === n
        let color = selected
          ? n <= 4 ? 'bg-red-500 text-white'
          : n <= 7 ? 'bg-yellow-400 text-gray-900'
          : 'bg-green-500 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
        return (
          <button
            key={n}
            onClick={() => onChange(n === value ? null : n)}
            className={`w-8 h-8 rounded-full text-xs font-bold transition-colors ${color}`}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

// ─── RockCard ─────────────────────────────────────────────────────────────────

function RockCard({ rock, members, onUpdate, onDelete }) {
  const [expanded, setExpanded]     = useState(false)
  const [descDraft, setDescDraft]   = useState(rock.description || '')
  const [notesDraft, setNotesDraft] = useState(rock.notes || '')
  const descTimer  = useRef(null)
  const notesTimer = useRef(null)

  useEffect(() => { setDescDraft(rock.description || '') }, [rock.description])
  useEffect(() => { setNotesDraft(rock.notes || '')     }, [rock.notes])

  const st    = STATUS_ROCK[rock.status] || STATUS_ROCK.not_started
  const owner = members.find(m => m.id === rock.ownerId)

  function saveDesc(val) {
    clearTimeout(descTimer.current)
    descTimer.current = setTimeout(() => onUpdate(rock.id, { description: val }), 700)
  }
  function saveNotes(val) {
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => onUpdate(rock.id, { notes: val }), 700)
  }

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${st.border} bg-white dark:bg-gray-800 transition-all`}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} />

        <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug">
          {rock.title}
        </span>

        {owner && (
          <img
            src={avatarUrl(owner.avatar)}
            alt={owner.name}
            title={owner.name}
            className="w-6 h-6 rounded-full object-cover shrink-0"
          />
        )}

        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${st.badge}`}>
          {st.label}
        </span>

        <span className={`text-gray-400 text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>

          {/* Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Estado:</label>
            {Object.entries(STATUS_ROCK).map(([k, v]) => (
              <button
                key={k}
                onClick={() => onUpdate(rock.id, { status: k })}
                className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                  rock.status === k
                    ? v.badge
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">¿Qué incluye esta roca?</label>
            <textarea
              className="w-full text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-primary-400"
              rows={2}
              placeholder="Descripción, alcance, criterio de éxito..."
              value={descDraft}
              onChange={e => { setDescDraft(e.target.value); saveDesc(e.target.value) }}
            />
          </div>

          {/* Notas del trimestre */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notas / Avances</label>
            <textarea
              className="w-full text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-primary-400"
              rows={2}
              placeholder="Registro de progreso durante el trimestre..."
              value={notesDraft}
              onChange={e => { setNotesDraft(e.target.value); saveNotes(e.target.value) }}
            />
          </div>

          {/* Owner + Delete */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Responsable:</label>
              <select
                value={rock.ownerId ?? ''}
                onChange={e => onUpdate(rock.id, { ownerId: e.target.value || null })}
                className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
              >
                <option value="">Sin responsable</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            <div className="flex-1" />

            <button
              onClick={() => { if (confirm('¿Eliminar esta roca?')) onDelete(rock.id) }}
              className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded-lg transition-colors"
            >
              Eliminar roca
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── RockStats ────────────────────────────────────────────────────────────────

function RockStats({ rocks }) {
  const open    = rocks.filter(r => r.status !== 'complete')
  const counts  = {
    on_track:    rocks.filter(r => r.status === 'on_track').length,
    off_track:   rocks.filter(r => r.status === 'off_track').length,
    not_started: rocks.filter(r => r.status === 'not_started').length,
    complete:    rocks.filter(r => r.status === 'complete').length,
  }

  if (rocks.length === 0) return null

  return (
    <div className="flex flex-wrap gap-3 text-xs font-medium">
      {counts.on_track > 0 && (
        <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          {counts.on_track} On Track
        </span>
      )}
      {counts.off_track > 0 && (
        <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          {counts.off_track} Off Track
        </span>
      )}
      {counts.not_started > 0 && (
        <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          {counts.not_started} No iniciadas
        </span>
      )}
      {counts.complete > 0 && (
        <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          {counts.complete} Completas
        </span>
      )}
    </div>
  )
}

// ─── QuickAddRock ─────────────────────────────────────────────────────────────

function QuickAddRock({ onAdd }) {
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  async function submit() {
    if (!text.trim()) return
    await onAdd(text.trim())
    setText('')
    inputRef.current?.focus()
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl">
      <span className="text-gray-400 text-sm">🪨</span>
      <input
        ref={inputRef}
        type="text"
        className="flex-1 text-sm bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none"
        placeholder="Nueva roca... (Enter para guardar)"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') setText('')
        }}
      />
    </div>
  )
}

// ─── RocasSection ─────────────────────────────────────────────────────────────

function RocasSection() {
  const [quarter, setQuarter]   = useState(currentQuarter)
  const [rocks, setRocks]       = useState([])
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => { loadRocks() }, [quarter])

  async function loadRocks() {
    try {
      setLoading(true)
      setError(null)
      const { data } = await api.get(`/eos/traction/rocks?quarter=${quarter}`)
      setMembers(data.members)
      setRocks(data.rocks)
    } catch {
      setError('No se pudieron cargar las rocas')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(title) {
    try {
      const { data } = await api.post('/eos/traction/rocks', { title, quarter })
      setRocks(prev => [...prev, data])
    } catch {}
  }

  async function handleUpdate(id, patch) {
    setRocks(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
    try {
      const { data } = await api.patch(`/eos/traction/rocks/${id}`, patch)
      setRocks(prev => prev.map(r => r.id === id ? data : r))
    } catch { loadRocks() }
  }

  async function handleDelete(id) {
    setRocks(prev => prev.filter(r => r.id !== id))
    try {
      await api.delete(`/eos/traction/rocks/${id}`)
    } catch { loadRocks() }
  }

  // Ordenar: off_track → on_track → not_started → complete
  const sorted = [...rocks].sort((a, b) => {
    const wa = STATUS_ROCK[a.status]?.sortW ?? 99
    const wb = STATUS_ROCK[b.status]?.sortW ?? 99
    return wa - wb || a.order - b.order
  })

  return (
    <div className="space-y-5">
      {/* Quarter nav */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setQuarter(q => adjQuarter(q, -1))}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Trimestre anterior"
        >
          ◀
        </button>
        <span className="text-base font-semibold text-gray-800 dark:text-gray-200 min-w-[80px] text-center">
          {quarterLabel(quarter)}
        </span>
        <button
          onClick={() => setQuarter(q => adjQuarter(q, 1))}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Trimestre siguiente"
        >
          ▶
        </button>

        <button
          onClick={() => setQuarter(currentQuarter())}
          className="ml-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
        >
          Hoy
        </button>
      </div>

      {loading && (
        <p className="text-sm text-gray-400 py-4 text-center">Cargando rocas...</p>
      )}

      {!loading && error && (
        <p className="text-sm text-red-500 py-4 text-center">{error}</p>
      )}

      {!loading && !error && (
        <>
          {/* Stats */}
          <RockStats rocks={rocks} />

          {/* Rock list */}
          {sorted.length === 0 && (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">🪨</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No hay rocas para {quarterLabel(quarter)}.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Definí las 3–7 prioridades del trimestre.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {sorted.map(rock => (
              <RockCard
                key={rock.id}
                rock={rock}
                members={members}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* Add */}
          <QuickAddRock onAdd={handleAdd} />
        </>
      )}
    </div>
  )
}

// ─── TodoItem ─────────────────────────────────────────────────────────────────

function TodoItem({ todo, members, onUpdate, onDelete }) {
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
        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
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

      {/* Delete */}
      <button
        onClick={() => onDelete(todo.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-sm transition-all px-1"
      >
        ✕
      </button>
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

function MeetingCard({ week, meeting, onSave }) {
  const [date, setDate]   = useState(meeting?.date || '')
  const [rating, setRating] = useState(meeting?.rating ?? null)
  const [notes, setNotes] = useState(meeting?.notes || '')
  const notesTimer = useRef(null)

  useEffect(() => {
    setDate(meeting?.date || '')
    setRating(meeting?.rating ?? null)
    setNotes(meeting?.notes || '')
  }, [week, meeting?.id])

  function save(patch) {
    const payload = {
      date:   date,
      rating: rating,
      notes:  notes,
      ...patch,
    }
    onSave(payload)
  }

  function handleNotesChange(val) {
    setNotes(val)
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => save({ notes: val }), 700)
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Registro de reunión
      </h4>

      <div className="flex flex-wrap gap-6 items-start">
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

        {/* Rating */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Puntaje de la reunión
            {rating && (
              <span className={`ml-2 font-bold ${
                rating >= 8 ? 'text-green-600 dark:text-green-400'
                : rating >= 5 ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-red-600 dark:text-red-400'
              }`}>{rating}/10</span>
            )}
          </label>
          <RatingPicker
            value={rating}
            onChange={val => { setRating(val); save({ rating: val }) }}
          />
        </div>
      </div>

      {/* Notas */}
      <div>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Notas / Decisiones / Compromisos</label>
        <textarea
          className="w-full text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-primary-400"
          rows={2}
          placeholder="Registrá decisiones clave, acuerdos o temas que necesitan seguimiento..."
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
        />
      </div>
    </div>
  )
}

// ─── MeetingSection ───────────────────────────────────────────────────────────

function MeetingSection() {
  const [week, setWeek]       = useState(currentWeekStr)
  const [todos, setTodos]     = useState([])
  const [meeting, setMeeting] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => { loadWeek() }, [week])

  async function loadWeek() {
    try {
      setLoading(true)
      setError(null)
      const { data } = await api.get(`/eos/traction/week?week=${week}`)
      setMembers(data.members)
      setTodos(data.todos)
      setMeeting(data.meeting)
    } catch {
      setError('No se pudo cargar la semana')
    } finally {
      setLoading(false)
    }
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

  async function handleSaveMeeting(patch) {
    try {
      const { data } = await api.put(`/eos/traction/meetings/${week}`, patch)
      setMeeting(data)
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

  return (
    <div className="space-y-5">
      {/* Week nav */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setWeek(w => adjWeek(w, -1))}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          ◀
        </button>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 min-w-[180px] text-center">
          {weekLabel(week)}
        </span>
        <button
          onClick={() => setWeek(w => adjWeek(w, 1))}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          ▶
        </button>
        <button
          onClick={() => setWeek(currentWeekStr())}
          className="ml-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
        >
          Hoy
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400 py-4 text-center">Cargando semana...</p>}
      {!loading && error && <p className="text-sm text-red-500 py-4 text-center">{error}</p>}

      {!loading && !error && (
        <>
          {/* Meeting card */}
          <MeetingCard
            week={week}
            meeting={meeting}
            onSave={handleSaveMeeting}
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
                  onUpdate={handleUpdateTodo}
                  onDelete={handleDeleteTodo}
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

export default function TraccionTab() {
  const [subTab, setSubTab] = useState('rocks')

  const SUB_TABS = [
    { id: 'rocks',   label: '🪨 Rocas',       title: 'Rocas Trimestrales' },
    { id: 'meeting', label: '📋 Reunión L10',  title: 'Reunión Level 10' },
  ]

  const current = SUB_TABS.find(t => t.id === subTab)

  return (
    <div className="space-y-5">
      {/* Sub-tab selector */}
      <div className="flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 w-fit">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              subTab === t.id
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {subTab === 'rocks'   && <RocasSection />}
      {subTab === 'meeting' && <MeetingSection />}
    </div>
  )
}
