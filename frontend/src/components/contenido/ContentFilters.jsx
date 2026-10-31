import { useState, useEffect } from 'react'
import { CONTENT_STATUSES, CONTENT_NETWORKS } from './contentCatalog'

const SELECT = 'px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200'

/**
 * Barra de filtros de la Tabla y el Kanban.
 *
 * El criterio es que **ningún filtro esté activo por default**: antes el backend
 * escondía las piezas 'publicado' aunque el select dijera "Todos los estados",
 * así que había un filtro que nadie puso y nadie veía. Ahora el único recorte de
 * la vista es el mes (pestañas), que sí está a la vista.
 *
 * Estado/red/responsable quedan detrás de "Filtros": no son el uso diario (para
 * eso están las pestañas de mes), pero sí la cola de trabajo de un diseñador
 * (responsable) o el batch de "Pedir aprobación" (estado). La búsqueda queda
 * siempre afuera — es lo que más se usa.
 */
export default function ContentFilters({ value, onChange, members = [], total = 0 }) {
  const [q, setQ] = useState(value.q ?? '')

  const activeCount = [value.status, value.network, value.ownerId].filter(Boolean).length
  const [open, setOpen] = useState(activeCount > 0)

  // Debounce de la búsqueda: cada tecla dispararía un request al backend.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((value.q ?? '') !== q) onChange({ ...value, q })
    }, 350)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  // Si los filtros se resetean desde afuera, el input acompaña.
  useEffect(() => { setQ(value.q ?? '') }, [value.q])

  // Un filtro que llega desde afuera (deep-link) despliega el panel: si no, se
  // vería la lista recortada sin ninguna pista de por qué.
  useEffect(() => { if (activeCount > 0) setOpen(true) }, [activeCount])

  const set = (patch) => onChange({ ...value, ...patch })

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar por título o copy…"
          className={`${SELECT} w-56`}
        />

        <button
          onClick={() => setOpen(o => !o)}
          className={`px-2.5 py-1.5 rounded-lg text-sm font-medium border transition-colors inline-flex items-center gap-1.5 ${
            activeCount > 0
              ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
        >
          Filtros
          {activeCount > 0 && <span className="text-xs">({activeCount})</span>}
        </button>

        {(activeCount > 0 || value.q) && (
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

      {open && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
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
        </div>
      )}
    </div>
  )
}
