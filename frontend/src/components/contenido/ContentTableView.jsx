import { useState, useMemo, useRef, useEffect } from 'react'
import ConfirmModal from '../ConfirmModal'
import ContentStatusBadge from './ContentStatusBadge'
import ContentNetworkChips from './ContentNetworkChips'
import { CONTENT_STATUSES, CONTENT_TYPES, statusMeta } from './contentCatalog'

const CELL   = 'px-3 py-2 text-sm align-middle'
const HEAD   = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 select-none'
const INPUT  = 'w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100'
const INLINE = 'text-sm bg-transparent border border-transparent hover:border-gray-200 dark:hover:border-gray-600 rounded px-1.5 py-0.5 cursor-pointer text-gray-700 dark:text-gray-300'

// ── Fechas ──────────────────────────────────────────────────────────────────
// El <input type="datetime-local"> trabaja en la hora local del navegador. Para
// un equipo que opera en la misma zona que sus proyectos (el caso normal) eso
// coincide con lo que se espera; el backend recibe el instante en ISO y deriva
// `scheduledDate` en la timezone del proyecto, que es lo que agrupa el calendario.
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ── Celda de título editable ────────────────────────────────────────────────
function TitleCell({ piece, canEdit, onSave, onOpen }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(piece.title)
  const inputRef = useRef(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => { setDraft(piece.title) }, [piece.title])

  function commit() {
    setEditing(false)
    const clean = draft.trim()
    if (!clean || clean === piece.title) { setDraft(piece.title); return }
    onSave({ title: clean })
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onOpen}
          className="text-sm text-gray-800 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 truncate text-left font-medium"
          title={piece.title}
        >
          {piece.title}
        </button>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            title="Renombrar"
            className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 transition-opacity"
          >
            ✏️
          </button>
        )}
      </div>
    )
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(piece.title); setEditing(false) }
      }}
      className={INPUT}
    />
  )
}

// ── Fila de alta rápida ─────────────────────────────────────────────────────
function NewPieceRow({ onCreate, busy }) {
  const [title, setTitle] = useState('')

  async function submit() {
    const clean = title.trim()
    if (!clean || busy) return
    try {
      await onCreate({ title: clean })
      setTitle('')
    } catch { /* el error lo muestra el contenedor */ }
  }

  return (
    <tr className="bg-gray-50/60 dark:bg-gray-900/40">
      <td className={CELL} />
      <td className={CELL} colSpan={5}>
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Escribí el título de una pieza nueva y presioná Enter…"
            className={`${INPUT} max-w-md`}
          />
          <button
            onClick={submit}
            disabled={!title.trim() || busy}
            className="px-3 py-1 text-sm rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white font-medium transition-colors"
          >
            + Agregar
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Tabla ───────────────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'scheduledAt', label: 'Fecha',       sortable: true },
  { key: 'title',       label: 'Título',      sortable: true },
  { key: 'status',      label: 'Estado',      sortable: true },
  { key: 'type',        label: 'Tipo',        sortable: true },
  { key: 'networks',    label: 'Redes',       sortable: false },
  { key: 'owner',       label: 'Responsable', sortable: true },
]

export default function ContentTableView({ pieces, members, loading, canEdit, onCreate, onUpdate, onDelete, onOpen }) {
  const [sort, setSort] = useState({ key: 'scheduledAt', dir: 'desc' })
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [busy, setBusy] = useState(false)

  const sorted = useMemo(() => {
    const val = (p) => {
      switch (sort.key) {
        case 'scheduledAt': return p.scheduledAt ? new Date(p.scheduledAt).getTime() : 0
        case 'title':       return p.title?.toLowerCase() ?? ''
        case 'status':      return statusMeta(p.status).order ?? 0
        case 'type':        return p.type ?? ''
        case 'owner':       return p.owner?.name?.toLowerCase() ?? ''
        default:            return 0
      }
    }
    return [...pieces].sort((a, b) => {
      const av = val(a), bv = val(b)
      if (av === bv) return 0
      return (av > bv ? 1 : -1) * (sort.dir === 'asc' ? 1 : -1)
    })
  }, [pieces, sort])

  function toggleSort(key) {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' })
  }

  async function handleCreate(payload) {
    setBusy(true)
    try { await onCreate(payload) } finally { setBusy(false) }
  }

  async function handleConfirmDelete() {
    setBusy(true)
    try {
      await onDelete(confirmDelete.id)
      setConfirmDelete(null)
    } catch { /* el contenedor muestra el error */ } finally { setBusy(false) }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* La tabla scrollea dentro de su contenedor: la página nunca scrollea en horizontal */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead className="bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
            <tr>
              {COLUMNS.map(c => (
                <th
                  key={c.key}
                  className={`${HEAD} ${c.sortable ? 'cursor-pointer hover:text-gray-600 dark:hover:text-gray-300' : ''}`}
                  onClick={c.sortable ? () => toggleSort(c.key) : undefined}
                >
                  {c.label}
                  {sort.key === c.key && <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
              <th className={HEAD} />
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {canEdit && <NewPieceRow onCreate={handleCreate} busy={busy} />}

            {sorted.map(p => (
              <tr key={p.id} className="group hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                {/* Fecha */}
                <td className={`${CELL} w-44`}>
                  {canEdit ? (
                    <input
                      type="datetime-local"
                      value={toLocalInput(p.scheduledAt)}
                      onChange={e => onUpdate(p.id, {
                        scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })}
                      className={`${INLINE} w-full`}
                    />
                  ) : (
                    <span className="text-sm text-gray-600 dark:text-gray-400">{formatDate(p.scheduledAt)}</span>
                  )}
                </td>

                {/* Título */}
                <td className={`${CELL} max-w-xs`}>
                  <TitleCell
                    piece={p}
                    canEdit={canEdit}
                    onSave={patch => onUpdate(p.id, patch)}
                    onOpen={() => onOpen?.(p)}
                  />
                </td>

                {/* Estado */}
                <td className={`${CELL} w-44`}>
                  {canEdit ? (
                    <select
                      value={p.status}
                      onChange={e => onUpdate(p.id, { status: e.target.value })}
                      className={`${INLINE} w-full`}
                    >
                      {CONTENT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  ) : (
                    <ContentStatusBadge status={p.status} />
                  )}
                </td>

                {/* Tipo */}
                <td className={`${CELL} w-32`}>
                  {canEdit ? (
                    <select
                      value={p.type}
                      onChange={e => onUpdate(p.id, { type: e.target.value })}
                      className={`${INLINE} w-full`}
                    >
                      {CONTENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-sm text-gray-600 dark:text-gray-400">{p.type}</span>
                  )}
                </td>

                {/* Redes */}
                <td className={`${CELL} w-32`}>
                  <ContentNetworkChips networks={p.networks} />
                </td>

                {/* Responsable */}
                <td className={`${CELL} w-44`}>
                  {canEdit ? (
                    <select
                      value={p.owner?.id ?? ''}
                      onChange={e => onUpdate(p.id, { ownerId: e.target.value || null })}
                      className={`${INLINE} w-full`}
                    >
                      <option value="">Sin asignar</option>
                      <optgroup label="Equipo del proyecto">
                        {members.filter(m => m.inTeam).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </optgroup>
                      <optgroup label="Otros del workspace">
                        {members.filter(m => !m.inTeam).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </optgroup>
                    </select>
                  ) : (
                    <span className="text-sm text-gray-600 dark:text-gray-400">{p.owner?.name ?? '—'}</span>
                  )}
                </td>

                {/* Acciones */}
                <td className={`${CELL} w-10 text-right`}>
                  {canEdit && (
                    <button
                      onClick={() => setConfirmDelete(p)}
                      title="Eliminar pieza"
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-600 dark:text-gray-600 dark:hover:text-red-400 transition-all"
                    >
                      🗑
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                  {canEdit
                    ? 'Todavía no hay piezas. Escribí un título arriba para crear la primera.'
                    : 'Todavía no hay piezas en este proyecto.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        title="Eliminar pieza"
        message={confirmDelete ? `Se va a eliminar «${confirmDelete.title}» y todo su historial. Esta acción no se puede deshacer.` : ''}
        loading={busy}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
