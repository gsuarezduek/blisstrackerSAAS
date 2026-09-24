import { useState } from 'react'
import useRoles from '../hooks/useRoles'
import useMembers from '../hooks/useMembers'
import { avatarUrl } from '../utils/avatarUrl'

// Editor de "quién puede ver este módulo": todos los miembros del workspace, o
// solo un set de roles de equipo y/o personas puntuales (los admins siempre acceden,
// sin importar esto). Una persona agregada individualmente accede aunque su rol no esté.
// Reutilizado desde Preferences.jsx para cada uno de los 6 módulos configurables
// (rrhh/gamification/ventas/marketing/contenido/eos) — mismo picker de roles que
// antes vivía solo en SalesTeamModal para Ventas.
export default function ModuleAccessEditor({ config, onChange, disabled }) {
  const { roles, labelFor } = useRoles()
  const { members, byId } = useMembers()
  const [adding, setAdding] = useState(false)
  const [addingPerson, setAddingPerson] = useState(false)

  const allMembers = config?.allMembers ?? true
  const selected = config?.roles ?? []
  const selectedUserIds = config?.userIds ?? []
  const remaining = roles.filter(r => !selected.includes(r.name))
  // Admins/owners ya tienen acceso siempre y los inactivos no entran: no tiene sentido agregarlos.
  const remainingPeople = members.filter(m => m.active && !m.isAdmin && !selectedUserIds.includes(m.id))

  function emit(patch) {
    onChange({ allMembers, roles: selected, userIds: selectedUserIds, ...patch })
  }
  function setAllMembers(next) { emit({ allMembers: next }) }
  function addRole(name) {
    if (name) emit({ roles: [...selected, name] })
    setAdding(false)
  }
  function removeRole(name) { emit({ roles: selected.filter(x => x !== name) }) }
  function addPerson(id) {
    if (id) emit({ userIds: [...selectedUserIds, Number(id)] })
    setAddingPerson(false)
  }
  function removePerson(id) { emit({ userIds: selectedUserIds.filter(x => x !== id) }) }

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
          Roles y personas específicas
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
          {selectedUserIds.map(id => {
            const person = byId.get(id)
            return (
              <span key={`u${id}`} className="inline-flex items-center gap-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full pl-1.5 pr-2 py-1 text-xs font-medium">
                <img src={avatarUrl(person?.avatar)} alt="" className="w-4 h-4 rounded-full object-cover" />
                {person?.name ?? `Usuario #${id}`}
                <button type="button" onClick={() => removePerson(id)} disabled={disabled} className="hover:text-blue-900 dark:hover:text-white text-sm leading-none disabled:opacity-60">×</button>
              </span>
            )
          })}
          {selected.length === 0 && selectedUserIds.length === 0 && !adding && !addingPerson && (
            <span className="text-xs text-gray-400">Sin roles ni personas asignadas (solo admins).</span>
          )}
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
          {addingPerson ? (
            <select
              autoFocus
              disabled={disabled}
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1 text-xs"
              defaultValue=""
              onChange={e => addPerson(e.target.value)}
              onBlur={() => setAddingPerson(false)}
            >
              <option value="" disabled>Elegir persona…</option>
              {remainingPeople.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ) : (
            remainingPeople.length > 0 && (
              <button type="button" disabled={disabled} onClick={() => setAddingPerson(true)} className="text-xs font-medium text-blue-600 hover:text-blue-700 border border-dashed border-blue-300 dark:border-blue-700 rounded-full px-3 py-1 disabled:opacity-60">
                + Agregar persona
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
