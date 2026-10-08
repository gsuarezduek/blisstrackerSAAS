import { useState, useRef } from 'react'
import { Pencil, X } from 'lucide-react'
import { Icon } from '../../ui/Icon'

// ═══════════════════════════════════════════════════════════════════════════════
// Sección: Valores Medulares (lista con add/edit/remove)
// ═══════════════════════════════════════════════════════════════════════════════

export default function CoreValuesSection({ items, onChange }) {
  const MAX = 7
  const [draftName, setDraftName] = useState('')
  const [editingIdx, setEditingIdx] = useState(null)
  const [editName, setEditName]   = useState('')
  const [editDesc, setEditDesc]   = useState('')
  const inputRef = useRef(null)

  const canAdd = items.length < MAX && draftName.trim().length > 0

  function handleAdd() {
    if (!canAdd) return
    onChange([...items, { name: draftName.trim(), description: '' }])
    setDraftName('')
    inputRef.current?.focus()
  }

  function handleRemove(i) { onChange(items.filter((_, idx) => idx !== i)) }

  function startEdit(i) {
    setEditingIdx(i)
    setEditName(items[i].name)
    setEditDesc(items[i].description || '')
  }

  function cancelEdit() {
    setEditingIdx(null)
    setEditName('')
    setEditDesc('')
  }

  function commitEdit(i) {
    const name = editName.trim()
    if (!name) { cancelEdit(); return }
    const next = [...items]
    next[i] = { name, description: editDesc.trim() }
    onChange(next)
    cancelEdit()
  }

  const countColor = items.length < 3 ? 'text-amber-500' : items.length <= MAX ? 'text-green-500' : 'text-red-500'

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          Todavía no hay valores definidos. Agregá entre 3 y 7.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((v, i) => {
            const isEditing = editingIdx === i
            return (
              <li key={i} className="group bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs flex items-center justify-center font-semibold shrink-0 mt-0.5">
                    {i + 1}
                  </span>

                  {isEditing ? (
                    <div className="flex-1 space-y-2">
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  { e.preventDefault(); commitEdit(i) }
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        maxLength={200}
                        placeholder="Nombre del valor"
                        className="w-full px-2 py-1.5 text-sm font-medium border border-primary-400 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <textarea
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        maxLength={1000}
                        rows={3}
                        placeholder="Descripción opcional: ¿qué significa este valor en la práctica? ¿cómo se ve cuando alguien lo encarna?"
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => commitEdit(i)}
                          className="text-xs px-2.5 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-xs px-2.5 py-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer hover:text-primary-600 dark:hover:text-primary-400"
                          onDoubleClick={() => startEdit(i)}
                          title="Doble clic para editar"
                        >
                          {v.name}
                        </p>
                        {v.description ? (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed whitespace-pre-wrap">{v.description}</p>
                        ) : (
                          <button
                            onClick={() => startEdit(i)}
                            className="text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 mt-1 italic"
                          >
                            + Agregar descripción
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => startEdit(i)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs" title="Editar"><Icon as={Pencil} size={15} /></button>
                        <button onClick={() => handleRemove(i)} className="p-1 text-gray-400 hover:text-red-500 text-xs" title="Eliminar"><Icon as={X} size={16} /></button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className={`text-xs font-medium ${countColor}`}>
        {items.length} / {MAX}{items.length > 0 && items.length < 3 && ' · necesitás al menos 3'}
      </p>

      {items.length < MAX && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
            placeholder="Escribí un valor y presioná Enter…"
            maxLength={200}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Agregar
          </button>
        </div>
      )}
    </div>
  )
}
