import { useMemo, useState } from 'react'
import useMembers from '../../hooks/useMembers'
import { avatarUrl } from '../../utils/avatarUrl'

/**
 * Multi-select de miembros del workspace: input de búsqueda + lista de
 * checkboxes + chips removibles con los ya elegidos. No existe un equivalente
 * genérico en el repo (AddTaskModal.jsx usa un <select> single) — se usa tanto
 * en el filtro de disponibilidad de Calendario.jsx como en ScheduleEventModal.
 *
 * `value`: array de userIds seleccionados. `onChange(nextArray)`.
 * `excludeIds`: ids a no ofrecer (ej. el propio organizador, ya incluido aparte).
 * `projectMemberIds`: si viene (ScheduleEventModal, equipo del proyecto elegido),
 * suma un botón "+ Equipo del proyecto" además de "+ Todo el workspace" — invitar
 * a una reunión grande de una sola vez sin tildear uno por uno.
 */
export default function PeoplePicker({ value, onChange, excludeIds = [], placeholder = 'Buscar personas…', projectMemberIds }) {
  const { members } = useMembers()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds])
  const selectable = useMemo(() => members.filter(m => m.active && !excluded.has(m.id)), [members, excluded])
  const selected = useMemo(() => new Set(value), [value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return selectable
    return selectable.filter(m => m.name.toLowerCase().includes(q))
  }, [selectable, query])

  const selectedMembers = useMemo(() => selectable.filter(m => selected.has(m.id)), [selectable, selected])

  function toggle(id) {
    onChange(selected.has(id) ? value.filter(v => v !== id) : [...value, id])
  }

  function addAll(ids) {
    const selectableIds = new Set(selectable.map(m => m.id))
    const toAdd = ids.filter(id => selectableIds.has(id) && !selected.has(id))
    if (toAdd.length) onChange([...value, ...toAdd])
  }

  const validProjectIds = useMemo(
    () => (projectMemberIds || []).filter(id => !excluded.has(id)),
    [projectMemberIds, excluded]
  )

  return (
    <div>
      {(validProjectIds.length > 0 || selectable.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {validProjectIds.length > 0 && (
            <button
              type="button"
              onClick={() => addAll(validProjectIds)}
              className="text-[11px] font-medium px-2 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              + Equipo del proyecto ({validProjectIds.length})
            </button>
          )}
          <button
            type="button"
            onClick={() => addAll(selectable.map(m => m.id))}
            className="text-[11px] font-medium px-2 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            + Todo el workspace ({selectable.length})
          </button>
        </div>
      )}

      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedMembers.map(m => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-xs"
            >
              <img src={avatarUrl(m.avatar)} alt="" className="w-4 h-4 rounded-full object-cover" />
              {m.name}
              <button
                type="button"
                onClick={() => toggle(m.id)}
                className="ml-0.5 text-primary-400 hover:text-primary-700 dark:hover:text-primary-200"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {open && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">Sin resultados</p>}
            {filtered.map(m => (
              <label
                key={m.id}
                // evita que el blur del input cierre la lista antes de registrar el click
                onMouseDown={e => e.preventDefault()}
                className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              >
                <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="rounded" />
                <img src={avatarUrl(m.avatar)} alt="" className="w-5 h-5 rounded-full object-cover" />
                <span className="text-gray-700 dark:text-gray-300">{m.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
