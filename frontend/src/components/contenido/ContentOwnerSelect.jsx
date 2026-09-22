import { useEffect, useMemo, useRef, useState } from 'react'
import { avatarUrl } from '../../utils/avatarUrl'

// Mismo patrón visual/interacción que PersonSearchSelect.jsx (Calendario):
// botón con avatar + nombre que despliega buscador + lista — a diferencia de
// ese componente, acá el valor puede ser "sin asignar", un miembro del equipo
// (userId) o un contacto del cliente (contactId), mutuamente excluyentes
// (mismo criterio que buildPieceData en content.controller.js), y la lista se
// agrupa en Cliente / Equipo del proyecto / Otros del workspace en vez de
// ordenarse por "yo primero".
export default function ContentOwnerSelect({ members = [], clientContacts = [], owner, ownerContact, onChange, disabled }) {
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

  const active = useMemo(() => members.filter(m => m.active !== false), [members])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matchesQuery = name => !q || name.toLowerCase().includes(q)
    return {
      contacts: clientContacts.filter(c => matchesQuery(c.name)),
      team:     active.filter(m => m.inTeam && matchesQuery(m.name)),
      others:   active.filter(m => !m.inTeam && matchesQuery(m.name)),
    }
  }, [clientContacts, active, query])

  function pickMember(id) {
    onChange({ ownerId: id, ownerContactId: null })
    setQuery('')
    setOpen(false)
  }

  function pickContact(id) {
    onChange({ ownerId: null, ownerContactId: id })
    setQuery('')
    setOpen(false)
  }

  function pickNone() {
    onChange({ ownerId: null, ownerContactId: null })
    setQuery('')
    setOpen(false)
  }

  const label = ownerContact ? ownerContact.name : owner ? owner.name : 'Sin asignar'
  const hasResults = groups.contacts.length + groups.team.length + groups.others.length > 0

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {ownerContact ? (
          <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xs shrink-0">🤝</span>
        ) : owner ? (
          <img src={avatarUrl(owner.avatar)} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
        ) : (
          <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 shrink-0" />
        )}
        <span className={`flex-1 min-w-0 truncate text-left ${owner || ownerContact ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>
          {label}
        </span>
        <span className="text-gray-400 text-xs shrink-0">▾</span>
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-64 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar persona…"
            className="w-full px-3 py-2 text-sm border-b border-gray-100 dark:border-gray-700 focus:outline-none dark:bg-gray-800 dark:text-gray-100"
          />
          <div className="max-h-64 overflow-y-auto">
            {!query && (
              <button
                type="button"
                onClick={pickNone}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  !owner && !ownerContact ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
              >
                <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 shrink-0" />
                <span className="text-gray-500 dark:text-gray-400 italic">Sin asignar</span>
              </button>
            )}

            {groups.contacts.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Cliente</p>
                {groups.contacts.map(c => (
                  <button
                    key={`c-${c.id}`}
                    type="button"
                    onClick={() => pickContact(c.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      ownerContact?.id === c.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                  >
                    <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xs shrink-0">🤝</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate">{c.name}</span>
                  </button>
                ))}
              </>
            )}

            {groups.team.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Equipo del proyecto</p>
                {groups.team.map(m => (
                  <button
                    key={`u-${m.id}`}
                    type="button"
                    onClick={() => pickMember(m.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      owner?.id === m.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                  >
                    <img src={avatarUrl(m.avatar)} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300 truncate">{m.name}</span>
                  </button>
                ))}
              </>
            )}

            {groups.others.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Otros del workspace</p>
                {groups.others.map(m => (
                  <button
                    key={`u-${m.id}`}
                    type="button"
                    onClick={() => pickMember(m.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      owner?.id === m.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                  >
                    <img src={avatarUrl(m.avatar)} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300 truncate">{m.name}</span>
                  </button>
                ))}
              </>
            )}

            {!hasResults && <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">Sin resultados</p>}
          </div>
        </div>
      )}
    </div>
  )
}
