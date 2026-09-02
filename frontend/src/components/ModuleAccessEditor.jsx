import { useState } from 'react'
import useRoles from '../hooks/useRoles'

// Editor de "quién puede ver este módulo": todos los miembros del workspace, o
// solo un set de roles de equipo (los admins siempre acceden, sin importar esto).
// Reutilizado desde Preferences.jsx para cada uno de los 6 módulos configurables
// (rrhh/gamification/ventas/marketing/contenido/eos) — mismo picker de roles que
// antes vivía solo en SalesTeamModal para Ventas.
export default function ModuleAccessEditor({ config, onChange, disabled }) {
  const { roles, labelFor } = useRoles()
  const [adding, setAdding] = useState(false)

  const allMembers = config?.allMembers ?? true
  const selected = config?.roles ?? []
  const remaining = roles.filter(r => !selected.includes(r.name))

  function setAllMembers(next) {
    onChange({ allMembers: next, roles: selected })
  }
  function addRole(name) {
    if (name) onChange({ allMembers, roles: [...selected, name] })
    setAdding(false)
  }
  function removeRole(name) {
    onChange({ allMembers, roles: selected.filter(x => x !== name) })
  }

  return (
    <div className="mt-3 ml-12 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-3">
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        ¿Quién puede verlo?
      </label>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 leading-snug">
        Los administradores siempre tienen acceso.
      </p>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setAllMembers(true)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors disabled:opacity-60 ${
            allMembers
              ? 'bg-primary-600 border-primary-600 text-white'
              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
          }`}
        >
          Todos los miembros
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setAllMembers(false)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors disabled:opacity-60 ${
            !allMembers
              ? 'bg-primary-600 border-primary-600 text-white'
              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
          }`}
        >
          Solo roles específicos
        </button>
      </div>

      {!allMembers && (
        <div className="flex flex-wrap gap-2 items-center">
          {selected.map(name => (
            <span key={name} className="inline-flex items-center gap-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full pl-3 pr-2 py-1 text-xs font-medium">
              {labelFor(name)}
              <button type="button" onClick={() => removeRole(name)} disabled={disabled} className="hover:text-primary-900 dark:hover:text-white text-sm leading-none disabled:opacity-60">×</button>
            </span>
          ))}
          {selected.length === 0 && !adding && <span className="text-xs text-gray-400">Sin roles asignados (solo admins).</span>}
          {adding ? (
            <select
              autoFocus
              disabled={disabled}
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1 text-xs"
              defaultValue=""
              onChange={e => addRole(e.target.value)}
              onBlur={() => setAdding(false)}
            >
              <option value="" disabled>Elegir rol…</option>
              {remaining.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
            </select>
          ) : (
            remaining.length > 0 && (
              <button type="button" disabled={disabled} onClick={() => setAdding(true)} className="text-xs font-medium text-primary-600 hover:text-primary-700 border border-dashed border-primary-300 dark:border-primary-700 rounded-full px-3 py-1 disabled:opacity-60">
                + Agregar rol
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
