import { useState, useEffect } from 'react'
import api from '../../api/client'
import { CONTENT_STATUSES, CONTENT_NETWORKS } from './contentCatalog'
import { monthLabel } from './dateHelpers'

const SELECT = 'px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200'

/**
 * Barra de filtros compartida por las tres vistas.
 * `value` es el objeto de filtros y `onChange` recibe el objeto completo ya
 * mergeado — el componente no guarda estado propio salvo el debounce del texto
 * y la lista de meses disponibles.
 */
export default function ContentFilters({ projectId, value, onChange, members = [], total = 0 }) {
  const [q, setQ] = useState(value.q ?? '')
  const [months, setMonths] = useState([])
  const [hasUnscheduled, setHasUnscheduled] = useState(false)

  // Debounce de la búsqueda: cada tecla dispararía un request al backend.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((value.q ?? '') !== q) onChange({ ...value, q })
    }, 350)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  // Si los filtros se resetean desde afuera, el input acompaña.
  useEffect(() => { setQ(value.q ?? '') }, [value.q])

  // Meses con contenido, para el selector — deliberadamente independiente de
  // `pieces` (que ya viene filtrado por mes): si se derivara de ahí, elegir un
  // mes dejaría al selector con una sola opción.
  useEffect(() => {
    if (!projectId) { setMonths([]); setHasUnscheduled(false); return }
    let cancelled = false
    api.get(`/contenido/projects/${projectId}/pieces/months`)
      .then(r => {
        if (cancelled) return
        setMonths(r.data.months ?? [])
        setHasUnscheduled(Boolean(r.data.hasUnscheduled))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [projectId])

  const set = (patch) => onChange({ ...value, ...patch })
  const hasFilters = Boolean(value.status || value.network || value.ownerId || value.q || value.scheduledMonth)

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
        <optgroup label="Equipo del proyecto">
          {members.filter(m => m.inTeam).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </optgroup>
        <optgroup label="Otros del workspace">
          {members.filter(m => !m.inTeam).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </optgroup>
      </select>

      <select
        value={value.scheduledMonth ?? ''}
        onChange={e => set({ scheduledMonth: e.target.value })}
        title="Filtrar por mes de publicación"
        className={SELECT}
      >
        <option value="">Todos los meses</option>
        {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        {hasUnscheduled && <option value="none">Sin fecha</option>}
      </select>

      {hasFilters && (
        <button
          onClick={() => onChange({ ...value, status: '', network: '', ownerId: '', q: '', scheduledMonth: '' })}
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
