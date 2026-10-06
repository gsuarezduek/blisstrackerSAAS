import { useState } from 'react'
import { getDescendantIds, buildParentOptions } from './accountabilityHelpers'

// ─── NodeModal ────────────────────────────────────────────────────────────────

export default function NodeModal({ node, allNodes, members, initialParentId, onSave, onClose, saving }) {
  const [seat,     setSeat]     = useState(node?.seat ?? '')
  const [userId,   setUserId]   = useState(node?.userId != null ? String(node.userId) : '')
  const [parentId, setParentId] = useState(
    node
      ? (node.parentId != null ? String(node.parentId) : '')
      : (initialParentId != null ? String(initialParentId) : '')
  )
  const [accs,     setAccs]     = useState(node?.accountabilities ?? [])
  const [accDraft, setAccDraft] = useState('')

  const isNew = !node?.id
  const excludedIds = isNew ? new Set() : getDescendantIds(allNodes, node.id)
  const parentOptions = buildParentOptions(allNodes, excludedIds)

  function addAcc() {
    if (!accDraft.trim() || accs.length >= 10) return
    setAccs([...accs, accDraft.trim()])
    setAccDraft('')
  }

  function handleSave() {
    if (!seat.trim()) return
    onSave({
      seat:             seat.trim(),
      userId:           userId ? Number(userId) : null,
      accountabilities: accs,
      parentId:         parentId ? Number(parentId) : null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{isNew ? 'Agregar puesto' : 'Editar puesto'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          {/* Nombre del puesto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del puesto</label>
            <input type="text" value={seat} onChange={e => setSeat(e.target.value)} maxLength={100}
              placeholder="Ej: Visionario, Integrador, Director de Ventas…"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Reporta a */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reporta a</label>
            <select value={parentId} onChange={e => setParentId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">— Puesto raíz (sin superior) —</option>
              {parentOptions.map(({ node: n, depth }) => (
                <option key={n.id} value={n.id}>
                  {'  '.repeat(depth)}{depth > 0 ? '↳ ' : ''}{n.seat}
                </option>
              ))}
            </select>
          </div>

          {/* Persona asignada */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Persona asignada</label>
            <select value={userId} onChange={e => setUserId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Sin asignar</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {/* Responsabilidades clave */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsabilidades clave</label>
            {accs.length > 0 && (
              <ul className="space-y-1 mb-2">
                {accs.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span className="text-gray-400">·</span>
                    <span className="flex-1">{a}</span>
                    <button onClick={() => setAccs(accs.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                  </li>
                ))}
              </ul>
            )}
            {accs.length < 10 && (
              <div className="flex gap-2">
                <input type="text" value={accDraft} onChange={e => setAccDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAcc() } }}
                  placeholder="Agregar responsabilidad…" maxLength={200}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button onClick={addAcc} disabled={!accDraft.trim()}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl transition-colors disabled:opacity-40">+</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={!seat.trim() || saving}
            className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
