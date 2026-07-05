import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'
import { adminMemberOptions } from '../../utils/adminMembers'
import { avatarUrl } from '../../utils/avatarUrl'
import RichTextEditor from '../RichTextEditor'
import DOMPurify from 'dompurify'
import '../situation-editor.css'

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
  // ISO week: move to Thursday of this week, then count from Jan 1
  const thursday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = thursday.getUTCDay() || 7   // 1=Mon … 7=Sun
  thursday.setUTCDate(thursday.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7)
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
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
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
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

// ─── Helpers de cronómetro (reunión L10) ──────────────────────────────────────

// Duración en minutos → "1h 05m" / "12m".
function fmtDuration(mins) {
  if (mins == null) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

// Segundos transcurridos → "12:34" / "1:02:05".
function fmtElapsed(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// ─── AddParticipant ────────────────────────────────────────────────────────────
// Dropdown para sumar un participante a la reunión (miembros activos del workspace).

function AddParticipant({ members, existingIds, onAdd }) {
  const [open, setOpen] = useState(false)
  const avail = members.filter(m => !existingIds.has(m.id))
  if (avail.length === 0) return null

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
            {avail.map(m => (
              <button key={m.id} onClick={() => pick(m.id)} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 flex items-center gap-2">
                <img src={avatarUrl(m.avatar)} alt="" className="w-5 h-5 rounded-full object-cover" />{m.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── MeetingTimer ──────────────────────────────────────────────────────────────

function MeetingTimer({ meeting, onStart, onFinish }) {
  const [, force] = useState(0)

  useEffect(() => {
    if (!meeting?.running) return
    const id = setInterval(() => force(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [meeting?.running])

  if (meeting?.running) {
    const secs = Math.max(0, Math.floor((Date.now() - new Date(meeting.startedAt).getTime()) / 1000))
    return (
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-mono font-semibold text-red-600 dark:text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {fmtElapsed(secs)}
        </span>
        <button
          onClick={onFinish}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
        >
          ■ Finalizar
        </button>
      </div>
    )
  }

  if (meeting?.durationMins != null) {
    return <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">⏱ {fmtDuration(meeting.durationMins)}</span>
  }

  return (
    <button
      onClick={onStart}
      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
    >
      ▶ Iniciar reunión
    </button>
  )
}

// ─── RockCard ─────────────────────────────────────────────────────────────────

function RockCard({ rock, members, onUpdate, onDelete }) {
  const [expanded, setExpanded]     = useState(false)
  const [descDraft, setDescDraft]   = useState(rock.description || '')
  const [notesDraft, setNotesDraft] = useState(rock.notes || '')
  const descDirty  = useRef(false)
  const notesDirty = useRef(false)

  useEffect(() => { setDescDraft(rock.description || '');  descDirty.current  = false }, [rock.description])
  useEffect(() => { setNotesDraft(rock.notes || '');       notesDirty.current = false }, [rock.notes])

  const st    = STATUS_ROCK[rock.status] || STATUS_ROCK.not_started
  const owner = members.find(m => m.id === rock.ownerId)

  function commitDesc()  { if (descDirty.current)  { descDirty.current  = false; onUpdate(rock.id, { description: descDraft }) } }
  function commitNotes() { if (notesDirty.current) { notesDirty.current = false; onUpdate(rock.id, { notes: notesDraft })       } }

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
              onChange={e => { setDescDraft(e.target.value); descDirty.current = true }}
              onBlur={commitDesc}
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
              onChange={e => { setNotesDraft(e.target.value); notesDirty.current = true }}
              onBlur={commitNotes}
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
                {adminMemberOptions(members, rock.ownerId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
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

// ─── TodoDashboardLink ────────────────────────────────────────────────────────
// Botón/badge para vincular un To-Do con una tarea del dashboard del responsable.
// Si ya está vinculado, muestra el estado; si no, ofrece elegir proyecto y enviarlo.

function TodoDashboardLink({ todo, projects, onSend }) {
  const [open, setOpen]         = useState(false)
  const [projectId, setProjectId] = useState('')
  const [sending, setSending]   = useState(false)

  // Ya vinculado → badge de estado (verde si la tarea ya se completó).
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

  async function submit() {
    if (!projectId) return
    setSending(true)
    const ok = await onSend(todo.id, Number(projectId))
    setSending(false)
    if (ok) { setOpen(false); setProjectId('') }
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        title="Enviar al dashboard del responsable"
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary-500 text-sm transition-all px-1"
      >
        📋
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg w-60 p-3">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Enviar al dashboard</p>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400 mb-2"
            >
              <option value="">Elegí un proyecto…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button
              onClick={submit}
              disabled={!projectId || sending}
              className="w-full text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-1.5 transition-colors disabled:opacity-50"
            >
              {sending ? 'Enviando…' : 'Crear tarea'}
            </button>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 leading-snug">
              Se crea una tarea en el dashboard del responsable. Al completarla, este To-Do se tilda solo.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── TodoItem ─────────────────────────────────────────────────────────────────

function TodoItem({ todo, members, projects, onUpdate, onDelete, onSendToDashboard }) {
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
      <TodoDashboardLink todo={todo} projects={projects} onSend={onSendToDashboard} />

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

const MEETING_TYPES = [
  { value: 'weekly',    label: 'Semanal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'annual',    label: 'Anual' },
]

function MeetingCard({ week, meeting, members, meetingProjectReady, onSave, onStart, onFinish, onAddParticipant, onRemoveParticipant }) {
  const [date, setDate]     = useState(meeting?.date || '')
  const [type, setType]     = useState(meeting?.type || 'weekly')
  const notes               = meeting?.notes || ''

  const started      = !!meeting?.started
  const participants = meeting?.participants || []

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
              Configurá el proyecto de reuniones para iniciar ↑
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
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 leading-snug">
          {started
            ? 'Se está contando el tiempo de cada participante en el proyecto de reuniones; al finalizar queda registrado como tiempo trabajado.'
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

function MeetingSection() {
  const [week, setWeek]                  = useState(currentWeekStr)
  const [todos, setTodos]                = useState([])
  const [meeting, setMeeting]            = useState(null)
  const [members, setMembers]            = useState([])
  const [projects, setProjects]          = useState([])
  const [specialMeetings, setSpecialMeetings] = useState([])
  const [showSpecials, setShowSpecials]  = useState(false)
  const [meetingProjectId, setMeetingProjectId] = useState(null)
  const [loading, setLoading]            = useState(true)
  const [error, setError]                = useState(null)

  useEffect(() => { loadWeek() }, [week])
  useEffect(() => { loadSpecials() }, [])
  useEffect(() => {
    api.get('/projects').then(r => setProjects(r.data || [])).catch(() => {})
    api.get('/eos').then(r => setMeetingProjectId(r.data?.meetingProjectId ?? null)).catch(() => {})
  }, [])

  async function handleSaveMeetingProject(projectId) {
    const pid = projectId ? Number(projectId) : null
    setMeetingProjectId(pid)
    try {
      await api.patch('/eos', { meetingProjectId: pid })
    } catch {
      // revertir silenciosamente si falla
      api.get('/eos').then(r => setMeetingProjectId(r.data?.meetingProjectId ?? null)).catch(() => {})
    }
  }

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

  // Envía el To-Do al dashboard del responsable (crea + vincula la tarea).
  // Devuelve true si salió bien (para que el popover se cierre).
  async function handleSendToDashboard(id, projectId) {
    try {
      const { data } = await api.post(`/eos/traction/todos/${id}/send-to-dashboard`, { projectId })
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
          {/* Config: proyecto donde se registran las tareas de los participantes */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Proyecto de las reuniones
            </span>
            <select
              value={meetingProjectId ?? ''}
              onChange={e => handleSaveMeetingProject(e.target.value)}
              className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-400"
            >
              <option value="">— Elegir proyecto —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 basis-full sm:basis-auto">
              El tiempo de cada participante se registra como tarea en este proyecto.
            </span>
          </div>

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
                  projects={projects}
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
