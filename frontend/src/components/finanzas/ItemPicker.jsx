import { useState, useRef, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

// Buscador de item: SOLO permite elegir items existentes (sección 4.7 del spec),
// con la categoría habitual al lado de cada resultado, y "+ Crear item nuevo"
// (nombre + categoría obligatoria) cuando no hay match. `items`/`categories` se
// pasan ya cargados desde el padre (evita refetchear en cada carga del modal).
export default function ItemPicker({ items, categories, value, onChange }) {
  const selected = items.find(i => i.id === value) || null
  const [query, setQuery] = useState(selected?.name || '')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newCategoryId, setNewCategoryId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const boxRef = useRef(null)

  useEffect(() => { setQuery(selected?.name || '') }, [selected?.id])

  useEffect(() => {
    function onClickOutside(e) { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setCreating(false) } }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const matches = items.filter(i => i.active !== false && i.name.toLowerCase().includes(query.toLowerCase()))

  function pick(item) {
    onChange(item)
    setQuery(item.name)
    setOpen(false)
    setCreating(false)
  }

  async function submitNew() {
    if (!query.trim() || !newCategoryId) { setError('Nombre y categoría son obligatorios'); return }
    setSaving(true); setError('')
    try {
      const res = await api.post('/finanzas/items', { name: query.trim(), categoryId: Number(newCategoryId), tracksAccount: false })
      pick(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear')
    } finally { setSaving(false) }
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        className={input}
        placeholder="Buscar item…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setCreating(false); if (value) onChange(null) }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-64 overflow-y-auto">
          {!creating ? (
            <>
              {matches.map(i => (
                <button key={i.id} type="button" onClick={() => pick(i)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                  <span className="text-gray-900 dark:text-white truncate">{i.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{i.category?.name}</span>
                </button>
              ))}
              {matches.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Sin resultados.</p>}
              <button type="button" onClick={() => setCreating(true)}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-left text-sm text-primary-600 dark:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-100 dark:border-gray-700">
                <Icon as={Plus} size={14} /> Crear item nuevo{query.trim() ? `: "${query.trim()}"` : ''}
              </button>
            </>
          ) : (
            <div className="p-3 space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">Nuevo item: <strong>{query.trim() || '(sin nombre)'}</strong></p>
              <select className={input} value={newCategoryId} onChange={e => setNewCategoryId(e.target.value)}>
                <option value="">Categoría habitual (obligatoria)</option>
                {categories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name} ({c.type === 'income' ? 'Ingreso' : 'Egreso'})</option>)}
              </select>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setCreating(false)} className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">Cancelar</button>
                <button type="button" disabled={saving} onClick={submitNew} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-1.5 text-xs font-medium disabled:opacity-50">Crear</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
