import { useState, useEffect } from 'react'
import { CONTENT_STATUSES, CONTENT_NETWORKS } from './contentCatalog'

const SELECT = 'px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200'

/**
 * Barra de filtros compartida por las tres vistas.
 * `value` es el objeto de filtros y `onChange` recibe el objeto completo ya
 * mergeado — el componente no guarda estado propio salvo el debounce del texto.
 */
export default function ContentFilters({ value, onChange, members = [], total = 0 }) {
  const [q, setQ] = useState(value.q ?? '')

  // Debounce de la búsqueda: cada tecla dispararía un request al backend.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((value.q ?? '') !== q) onChange({ ...value, q })
    }, 350)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  // Si los filtros se resetean desde afuera, el input acompaña.
  useEffect(() => { setQ(value.q ?? '') }, [value.q])

  const set = (patch) => onChange({ ...value, ...patch })
  const hasFilters = Boolean(value.status || value.network || value.ownerId || value.q)

  return (
    <div className="flex items-center gap-2 flex-wrap mb-3">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Buscar por título o copy…"
        className={`${SELECT} w-56`}
      />

      <select value={value.status ?? ''} onChange={e => set({ status: e.target.value })} className={SELECT}>
        <option value="">Todos los estados</option>
        {CONTENT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>

      <select value={value.network ?? ''} onChange={e => set({ network: e.target.value })} className={SELECT}>
        <option value="">Todas las redes</option>
        {CONTENT_NETWORKS.map(n => <option key={n.key} value={n.key}>{n.label}</option>)}
      </select>

      <select value={value.ownerId ?? ''} onChange={e => set({ ownerId: e.target.value })} className={SELECT}>
        <option value="">Todos los responsables</option>
        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>

      {hasFilters && (
        <button
          onClick={() => onChange({ ...value, status: '', network: '', ownerId: '', q: '' })}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1.5"
        >
          Limpiar filtros
        </button>
      )}

      <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
        {total} {total === 1 ? 'pieza' : 'piezas'}
      </span>
    </div>
  )
}
