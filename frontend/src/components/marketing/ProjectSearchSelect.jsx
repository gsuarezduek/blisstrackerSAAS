import { useState, useRef, useEffect, useMemo } from 'react'

const norm = s => (s || '').toLowerCase()
const byName = (a, b) => norm(a.name).localeCompare(norm(b.name), 'es', { sensitivity: 'base' })

/**
 * Selector de proyecto con búsqueda por nombre.
 * Props:
 *   projects   — array de proyectos [{ id, name, websiteUrl?, starred? }]
 *   value      — projectId seleccionado (string) o ''
 *   onChange   — fn(id: string)
 *   showUrl    — mostrar websiteUrl como subtexto (default: false)
 *   placeholder
 *
 * Destacados primero (mismo `ProjectStar`/"starred" que "Mis Proyectos" y el
 * selector de canales del Chat, ChannelSwitcher.jsx): si hay al menos un
 * proyecto destacado se separan en dos grupos con encabezado ("Destacados" /
 * "Proyectos"); si no hay ninguno, la lista queda plana como antes.
 */
export default function ProjectSearchSelect({
  projects,
  value,
  onChange,
  showUrl = false,
  placeholder = 'Seleccioná un proyecto',
}) {
  const [search, setSearch] = useState('')
  const [open,   setOpen]   = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selected = projects.find(p => String(p.id) === value)

  const filtered = search.trim()
    ? projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects

  const groups = useMemo(() => {
    const favorites = filtered.filter(p => p.starred).sort(byName)
    if (favorites.length === 0) return [{ label: null, items: [...filtered].sort(byName) }]
    const favIds = new Set(favorites.map(p => p.id))
    const rest = filtered.filter(p => !favIds.has(p.id)).sort(byName)
    return [
      { label: 'Destacados', items: favorites },
      { label: 'Proyectos',  items: rest },
    ]
  }, [filtered])

  function handleSelect(p) {
    onChange(String(p.id))
    setSearch('')
    setOpen(false)
  }

  function handleInputFocus() {
    setSearch('')
    setOpen(true)
  }

  function handleInputChange(e) {
    setSearch(e.target.value)
    setOpen(true)
  }

  // Cuando está cerrado muestra el nombre del proyecto seleccionado;
  // cuando está abierto muestra el texto de búsqueda.
  const displayValue = open ? search : (selected?.name ?? '')

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {/* Chevron */}
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </span>
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Sin resultados</p>
          ) : (
            groups.map(group => (
              <div key={group.label ?? 'flat'} className="mb-1 last:mb-0">
                {group.label && (
                  <p className="px-4 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {group.label}
                  </p>
                )}
                {group.items.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelect(p)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      String(p.id) === value
                        ? 'text-primary-600 dark:text-primary-400 font-medium bg-primary-50 dark:bg-primary-900/20'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {group.label === 'Destacados' && '⭐ '}
                    {p.name}
                    {showUrl && (
                      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                        {p.websiteUrl || 'sin URL'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
