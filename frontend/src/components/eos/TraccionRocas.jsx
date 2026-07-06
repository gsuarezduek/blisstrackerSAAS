import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'
import { adminMemberOptions } from '../../utils/adminMembers'
import { avatarUrl } from '../../utils/avatarUrl'

export const STATUS_ROCK = {
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

export function currentQuarter() {
  const now = new Date()
  return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`
}

export function quarterLabel(q) {
  if (!q) return ''
  const [year, qPart] = q.split('-')
  return `${qPart} ${year}`
}

// Meses que abarca el trimestre (ej: Q3 → "Jul – Sep").
export function quarterMonths(q) {
  if (!q) return ''
  const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const n = parseInt(q.split('-')[1]?.replace('Q', ''), 10)
  if (!(n >= 1 && n <= 4)) return ''
  const start = (n - 1) * 3
  return `${MONTHS[start]} – ${MONTHS[start + 2]}`
}

export function adjQuarter(q, delta) {
  const [year, qPart] = q.split('-')
  let y = parseInt(year)
  let n = parseInt(qPart.replace('Q', ''))
  n += delta
  if (n > 4) { n = 1; y++ }
  if (n < 1) { n = 4; y-- }
  return `${y}-Q${n}`
}

export function RockCard({ rock, members, onUpdate, onDelete }) {
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

export function RockStats({ rocks }) {
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

export function QuickAddRock({ onAdd }) {
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

export function RocasSection() {
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
        <span className="flex flex-col items-center min-w-[80px] leading-tight">
          <span className="text-base font-semibold text-gray-800 dark:text-gray-200">
            {quarterLabel(quarter)}
          </span>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            {quarterMonths(quarter)}
          </span>
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
// La tarea se crea en el proyecto de EOS configurado (Preferencias → Módulos), así
// que no se pregunta el proyecto: un clic la envía.

