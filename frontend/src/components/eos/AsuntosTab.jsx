import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'

// ─── Constantes ──────────────────────────────────────────────────────────────

const PRIORITY = {
  high:   { label: 'Alta',  badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'  },
  medium: { label: 'Media', badge: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' },
  low:    { label: 'Baja',  badge: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'  },
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function avatarUrl(avatar) {
  return avatar ? `/perfiles/${avatar}` : '/perfiles/2bee.png'
}

// ─── IssueCard ───────────────────────────────────────────────────────────────

function IssueCard({ issue, members, onUpdate, onDelete }) {
  const [expanded, setExpanded]         = useState(false)
  const [descDraft, setDescDraft]       = useState(issue.description || '')
  const [notesDraft, setNotesDraft]     = useState(issue.notes || '')
  const descTimer  = useRef(null)
  const notesTimer = useRef(null)

  // Sync drafts if issue changes from outside (e.g. reorder)
  useEffect(() => { setDescDraft(issue.description || '') }, [issue.description])
  useEffect(() => { setNotesDraft(issue.notes || '') }, [issue.notes])

  function handleDescChange(val) {
    setDescDraft(val)
    clearTimeout(descTimer.current)
    descTimer.current = setTimeout(() => onUpdate(issue.id, { description: val }), 700)
  }

  function handleNotesChange(val) {
    setNotesDraft(val)
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => onUpdate(issue.id, { notes: val }), 700)
  }

  const owner = members.find(m => m.id === issue.ownerId)
  const isSolved = issue.status === 'solved'

  return (
    <div className={`rounded-xl border transition-all ${
      isSolved
        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
    }`}>
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Chevron */}
        <span className={`text-gray-400 transition-transform text-xs ${expanded ? 'rotate-90' : ''}`}>▶</span>

        {/* Priority badge */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${PRIORITY[issue.priority].badge}`}>
          {PRIORITY[issue.priority].label}
        </span>

        {/* Title */}
        <span className={`flex-1 text-sm text-gray-800 dark:text-gray-200 leading-snug ${isSolved ? 'line-through text-gray-400 dark:text-gray-500' : ''}`}>
          {issue.title}
        </span>

        {/* Owner avatar */}
        {owner && (
          <img
            src={avatarUrl(owner.avatar)}
            alt={owner.name}
            title={owner.name}
            className="w-6 h-6 rounded-full object-cover shrink-0"
          />
        )}
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Descripción del issue</label>
            <textarea
              className="w-full text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-primary-400"
              rows={3}
              placeholder="¿Cuál es el problema?"
              value={descDraft}
              onChange={e => handleDescChange(e.target.value)}
            />
          </div>

          {/* Notes / Solution */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {isSolved ? 'Solución aplicada' : 'Notas / Próximos pasos'}
            </label>
            <textarea
              className="w-full text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-primary-400"
              rows={2}
              placeholder="Registrá decisiones, acciones o la resolución..."
              value={notesDraft}
              onChange={e => handleNotesChange(e.target.value)}
            />
          </div>

          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-2">

            {/* Priority */}
            <select
              value={issue.priority}
              onChange={e => onUpdate(issue.id, { priority: e.target.value })}
              className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
            >
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>

            {/* Owner */}
            <select
              value={issue.ownerId ?? ''}
              onChange={e => onUpdate(issue.id, { ownerId: e.target.value || null })}
              className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
            >
              <option value="">Sin responsable</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>

            <div className="flex-1" />

            {/* Solve / Reopen */}
            {!isSolved ? (
              <button
                onClick={() => onUpdate(issue.id, { status: 'solved' })}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
              >
                ✓ Resolver
              </button>
            ) : (
              <button
                onClick={() => onUpdate(issue.id, { status: 'open' })}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                ↩ Reabrir
              </button>
            )}

            {/* Move type */}
            <button
              onClick={() => onUpdate(issue.id, { type: issue.type === 'weekly' ? 'quarterly' : 'weekly' })}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              {issue.type === 'weekly' ? '→ Parking Lot' : '→ Semanales'}
            </button>

            {/* Delete */}
            <button
              onClick={() => onDelete(issue.id)}
              className="text-xs font-medium px-2 py-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── QuickAdd ─────────────────────────────────────────────────────────────────

function QuickAdd({ type, onAdd }) {
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  async function handleKeyDown(e) {
    if (e.key === 'Enter' && text.trim()) {
      e.preventDefault()
      await onAdd(text.trim(), type)
      setText('')
      inputRef.current?.focus()
    }
    if (e.key === 'Escape') {
      setText('')
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl">
      <span className="text-gray-400 text-sm">+</span>
      <input
        ref={inputRef}
        type="text"
        className="flex-1 text-sm bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none"
        placeholder="Nuevo issue... (Enter para guardar)"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

// ─── IssueColumn ─────────────────────────────────────────────────────────────

function IssueColumn({ title, subtitle, type, issues, members, onAdd, onUpdate, onDelete, showSolved, onToggleSolved }) {
  const open   = issues.filter(i => i.type === type && i.status === 'open')
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.order - b.order)
  const solved = issues.filter(i => i.type === type && i.status === 'solved')
    .sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt))

  return (
    <div className="flex flex-col gap-3">
      {/* Column header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
          {open.length}
        </span>
      </div>

      {/* Open issues */}
      <div className="space-y-2">
        {open.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">Sin issues abiertos</p>
        )}
        {open.map(issue => (
          <IssueCard
            key={issue.id}
            issue={issue}
            members={members}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Quick add */}
      <QuickAdd type={type} onAdd={onAdd} />

      {/* Solved toggle */}
      {solved.length > 0 && (
        <div>
          <button
            onClick={onToggleSolved}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
          >
            <span className={`transition-transform ${showSolved ? 'rotate-90' : ''}`}>▶</span>
            {showSolved ? 'Ocultar' : 'Mostrar'} resueltos ({solved.length})
          </button>
          {showSolved && (
            <div className="mt-2 space-y-2">
              {solved.map(issue => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  members={members}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── AsuntosTab ───────────────────────────────────────────────────────────────

export default function AsuntosTab() {
  const [issues, setIssues]               = useState([])
  const [members, setMembers]             = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [showSolvedWeekly, setShowSolvedWeekly]       = useState(false)
  const [showSolvedQuarterly, setShowSolvedQuarterly] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      setLoading(true)
      const { data } = await api.get('/eos/issues')
      setMembers(data.members)
      setIssues(data.issues)
    } catch (err) {
      setError('No se pudieron cargar los asuntos')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(title, type) {
    try {
      const { data } = await api.post('/eos/issues', { title, type })
      setIssues(prev => [...prev, data])
    } catch {}
  }

  async function handleUpdate(id, patch) {
    // Optimistic update
    setIssues(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
    try {
      const { data } = await api.patch(`/eos/issues/${id}`, patch)
      setIssues(prev => prev.map(i => i.id === id ? data : i))
    } catch {
      // revert
      load()
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este issue?')) return
    setIssues(prev => prev.filter(i => i.id !== id))
    try {
      await api.delete(`/eos/issues/${id}`)
    } catch {
      load()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
        Cargando asuntos...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-red-500 text-sm">{error}</div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3">
        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          <strong>IDS:</strong> Identificar → Discutir → Resolver. Los <strong>Asuntos Semanales</strong> se trabajan en el Level 10 Meeting.
          El <strong>Parking Lot</strong> acumula issues que requieren más tiempo o no son urgentes esta semana.
        </p>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IssueColumn
          title="Asuntos Semanales"
          subtitle="Level 10 Meeting — IDS"
          type="weekly"
          issues={issues}
          members={members}
          onAdd={handleAdd}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          showSolved={showSolvedWeekly}
          onToggleSolved={() => setShowSolvedWeekly(v => !v)}
        />

        <IssueColumn
          title="Parking Lot"
          subtitle="Largo plazo — pendiente de tiempo"
          type="quarterly"
          issues={issues}
          members={members}
          onAdd={handleAdd}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          showSolved={showSolvedQuarterly}
          onToggleSolved={() => setShowSolvedQuarterly(v => !v)}
        />
      </div>
    </div>
  )
}
