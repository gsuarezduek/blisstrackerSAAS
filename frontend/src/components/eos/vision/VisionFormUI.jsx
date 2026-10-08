import { useState, useRef } from 'react'
import { Pencil, X } from 'lucide-react'
import { Icon } from '../../ui/Icon'

// ═══════════════════════════════════════════════════════════════════════════════
// UI primitivos
// ═══════════════════════════════════════════════════════════════════════════════

export function HelpModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
          <button onClick={onClose} className="w-full py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors">Entendido</button>
        </div>
      </div>
    </div>
  )
}

export function SectionCard({ title, desc, saving, saved, onHelp, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          {desc && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {saving  && <span className="text-xs text-gray-400">Guardando…</span>}
          {!saving && saved && <span className="text-xs text-green-500">Guardado</span>}
          {onHelp && (
            <button onClick={onHelp} className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">? Ayuda</button>
          )}
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 mt-4 pt-4">{children}</div>
    </div>
  )
}

// Campo de texto simple dentro de una subsección
export function SubField({ label, hint, value, onChange, onBlur, rows = 3, maxLength = 500, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">{label}</label>
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{hint}</p>}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
      />
    </div>
  )
}

// Campo de texto de una línea
export function InlineField({ label, value, onChange, onBlur, onKeyDown, placeholder, maxLength = 200 }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </div>
  )
}

// Lista editable genérica (add/edit/remove)
export function ItemsList({ items, onChange, maxItems, minItems = 0, placeholder, emptyMsg }) {
  const [draft,   setDraft]   = useState('')
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef(null)

  const canAdd = items.length < maxItems && draft.trim().length > 0

  function handleAdd() {
    if (!canAdd) return
    onChange([...items, draft.trim()])
    setDraft('')
    inputRef.current?.focus()
  }

  function handleRemove(i) { onChange(items.filter((_, idx) => idx !== i)) }

  function startEdit(i)  { setEditing(i); setEditVal(items[i]) }
  function commitEdit(i) {
    if (!editVal.trim()) { setEditing(null); return }
    const next = [...items]; next[i] = editVal.trim()
    onChange(next); setEditing(null)
  }

  return (
    <div className="space-y-3">
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((v, i) => (
            <li key={i} className="flex items-center gap-2 group">
              <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs flex items-center justify-center font-semibold shrink-0">
                {i + 1}
              </span>
              {editing === i ? (
                <input
                  autoFocus value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(i); if (e.key === 'Escape') setEditing(null) }}
                  onBlur={() => commitEdit(i)}
                  className="flex-1 px-2 py-1 text-sm border border-primary-400 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 cursor-pointer hover:text-primary-600 dark:hover:text-primary-400" onDoubleClick={() => startEdit(i)} title="Doble clic para editar">{v}</span>
              )}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {editing !== i && <button onClick={() => startEdit(i)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs"><Icon as={Pencil} size={15} /></button>}
                <button onClick={() => handleRemove(i)} className="p-1 text-gray-400 hover:text-red-500 text-xs"><Icon as={X} size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">{emptyMsg}</p>
      )}

      {(() => {
        const tooFew  = minItems > 0 && items.length > 0 && items.length < minItems
        const perfect = minItems > 0 && items.length >= minItems
        const atMax   = items.length >= maxItems && minItems === 0
        const color   = tooFew ? 'text-amber-500' : perfect ? 'text-green-500' : atMax ? 'text-amber-500' : 'text-gray-400'
        const label   = tooFew  ? ` · necesitás exactamente ${minItems}`
          : perfect && minItems === maxItems ? ' · completo'
          : atMax   ? ' · máximo alcanzado'
          : ''
        return <p className={`text-xs font-medium ${color}`}>{items.length} / {maxItems}{label}</p>
      })()}

      {items.length < maxItems && (
        <div className="flex gap-2">
          <input ref={inputRef} type="text" value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
            placeholder={placeholder} maxLength={200}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button onClick={handleAdd} disabled={!canAdd}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Agregar
          </button>
        </div>
      )}
    </div>
  )
}
