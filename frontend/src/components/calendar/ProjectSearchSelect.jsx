import { useEffect, useMemo, useRef, useState } from 'react'

const byName = (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })

/**
 * Buscador/selector de UN proyecto — mismo patrón que PersonSearchSelect: botón
 * que despliega un input de búsqueda + lista filtrada en vivo, en vez del
 * <select> nativo con scroll largo. Usado solo por ScheduleEventModal, donde el
 * proyecto es obligatorio (sin él no hay dónde crear la Task "reserva" del
 * participante que acepte — ver lib/calendarEventTasks.js) — no ofrece "Sin
 * proyecto" como opción. `value`: projectId elegido (string), o '' = todavía sin elegir.
 *
 * Destacados primero (mismo `starred` que el selector de Marketing/Contenido):
 * con al menos un destacado se separan en "Destacados" / "Proyectos"; sin
 * ninguno la lista queda plana.
 */
export default function ProjectSearchSelect({ projects, value, onChange, placeholder = 'Buscar proyecto…' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = value ? projects.find(p => String(p.id) === String(value)) : null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(p => p.name.toLowerCase().includes(q))
  }, [projects, query])

  const groups = useMemo(() => {
    const favorites = filtered.filter(p => p.starred).sort(byName)
    if (favorites.length === 0) return [{ label: null, items: [...filtered].sort(byName) }]
    const rest = filtered.filter(p => !p.starred).sort(byName)
    return [
      { label: 'Destacados', items: favorites },
      { label: 'Proyectos', items: rest },
    ]
  }, [filtered])

  function pick(id) {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  const label = selected ? selected.name : 'Elegí un proyecto'

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-left"
      >
        <span className={`flex-1 truncate ${selected ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>{label}</span>
        <span className="text-gray-400 text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-700 focus:outline-none dark:bg-gray-800 dark:text-gray-100"
          />
          <div className="max-h-56 overflow-y-auto">
            {groups.map(group => group.items.length > 0 && (
              <div key={group.label ?? 'flat'}>
                {group.label && (
                  <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {group.label}
                  </p>
                )}
                {group.items.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pick(p.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      String(value) === String(p.id) ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                  >
                    <span className="text-gray-700 dark:text-gray-300 truncate">
                      {group.label === 'Destacados' && '⭐ '}{p.name}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">Sin resultados</p>}
          </div>
        </div>
      )}
    </div>
  )
}
