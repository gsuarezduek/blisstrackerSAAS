import { useEffect, useMemo, useRef, useState } from 'react'
import useMembers from '../../hooks/useMembers'
import { useAuth } from '../../context/AuthContext'
import { avatarUrl } from '../../utils/avatarUrl'

/**
 * Buscador/selector de UNA persona — a diferencia de PeoplePicker (multi-select
 * con checkboxes, para el filtro "Equipo"), este es single-select con un botón
 * que despliega búsqueda + lista, para elegir de quién ver el calendario en la
 * vista "Semana". `value`: userId elegido, o `null` = uno mismo.
 */
export default function PersonSearchSelect({ value, onChange }) {
  const { user } = useAuth()
  const { members } = useMembers()
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

  const active = useMemo(() => members.filter(m => m.active), [members])
  const selected = value ? active.find(m => m.id === value) : null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return active
    return active.filter(m => m.name.toLowerCase().includes(q))
  }, [active, query])

  function pick(id) {
    onChange(id === user.id ? null : id)
    setQuery('')
    setOpen(false)
  }

  const label = selected ? selected.name : 'Vos'
  const avatarSrc = avatarUrl(selected?.avatar || user?.avatar)

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <img src={avatarSrc} alt="" className="w-5 h-5 rounded-full" />
        <span className="font-medium text-gray-700 dark:text-gray-200">{label}</span>
        <span className="text-gray-400 text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-64 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar persona…"
            className="w-full px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-700 focus:outline-none dark:bg-gray-800 dark:text-gray-100"
          />
          <div className="max-h-64 overflow-y-auto">
            {filtered.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => pick(m.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  (value ?? user.id) === m.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
              >
                <img src={avatarUrl(m.avatar)} alt="" className="w-5 h-5 rounded-full" />
                <span className="text-gray-700 dark:text-gray-300">{m.id === user.id ? `${m.name} (vos)` : m.name}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">Sin resultados</p>}
          </div>
        </div>
      )}
    </div>
  )
}
