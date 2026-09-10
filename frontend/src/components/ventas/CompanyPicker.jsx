import { useState, useEffect, useRef, useMemo } from 'react'

const inputClass = 'w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400'

// Combobox de búsqueda para elegir una empresa de una lista larga — filtra en
// vivo por nombre en vez de un <select> nativo (con muchas empresas cargadas,
// bajar el dropdown del navegador hasta la letra deseada era lento). `companies`
// ya viene cargada completa desde el padre (GET /ventas/companies sin filtro);
// el filtrado es client-side, sin ida y vuelta al backend.
export default function CompanyPicker({ companies, value, onChange, placeholder = 'Buscar empresa…' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapRef = useRef(null)

  const selected = companies.find(c => String(c.id) === String(value))

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return companies
    return companies.filter(c => c.name.toLowerCase().includes(q))
  }, [companies, query])

  useEffect(() => { setActiveIndex(0) }, [query, open])

  function selectCompany(c) {
    onChange(String(c.id))
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(e) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIndex]) selectCompany(filtered[activeIndex]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        className={inputClass}
        placeholder={placeholder}
        value={open ? query : (selected ? selected.name : '')}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => { setQuery(e.target.value); if (value) onChange('') }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">Sin resultados</p>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); selectCompany(c) }}
                className={`w-full text-left px-3 py-2 text-sm ${
                  i === activeIndex ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                } ${String(c.id) === String(value) ? 'text-primary-700 dark:text-primary-400 font-medium' : 'text-gray-700 dark:text-gray-200'}`}
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
