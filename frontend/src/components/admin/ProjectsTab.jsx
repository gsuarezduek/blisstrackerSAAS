import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'
import useRoles from '../../hooks/useRoles'

// ── Team Modal ─────────────────────────────────────────────────────────────────

function TeamModal({ project, allUsers, onClose, onUpdate }) {
  const { labelFor } = useRoles()
  const [members, setMembers]   = useState(project.members.map(pm => pm.user))
  const [query,   setQuery]     = useState('')
  const [saving,  setSaving]    = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const memberIds    = new Set(members.map(u => u.id))
  const suggestions  = allUsers.filter(u =>
    !memberIds.has(u.id) &&
    u.name.toLowerCase().includes(query.toLowerCase())
  )

  async function syncMembers(nextMembers) {
    setSaving(true)
    try {
      const { data } = await api.put(`/projects/${project.id}`, {
        memberIds: nextMembers.map(u => u.id),
      })
      onUpdate(data)
    } finally {
      setSaving(false)
    }
  }

  function addUser(user) {
    const next = [...members, user]
    setMembers(next)
    setQuery('')
    syncMembers(next)
    inputRef.current?.focus()
  }

  function removeUser(userId) {
    const next = members.filter(u => u.id !== userId)
    setMembers(next)
    syncMembers(next)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Equipo del proyecto</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">{project.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors ml-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5 overflow-y-auto">

          {/* Search input */}
          <div className="relative">
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar persona por nombre..."
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 pr-9"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            )}
          </div>

          {/* Search results */}
          {query && (
            <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
              {suggestions.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                  {allUsers.filter(u => !memberIds.has(u.id)).length === 0
                    ? 'Todos los usuarios ya están en este proyecto'
                    : 'No se encontraron resultados'}
                </p>
              ) : (
                suggestions.map(u => (
                  <div key={u.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 border-b dark:border-gray-600 last:border-b-0 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{u.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{labelFor(u.role)}</p>
                    </div>
                    <button
                      onClick={() => addUser(u)}
                      disabled={saving}
                      className="text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0 ml-3"
                    >
                      + Agregar
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Current members */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              En el proyecto · {members.length} persona{members.length !== 1 ? 's' : ''}
            </p>
            {members.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">
                Sin equipo asignado todavía
              </p>
            ) : (
              <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                {members.map(u => (
                  <div key={u.id} className="flex items-center justify-between px-4 py-2.5 border-b dark:border-gray-600 last:border-b-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{u.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{labelFor(u.role)}</p>
                    </div>
                    <button
                      onClick={() => removeUser(u.id)}
                      disabled={saving}
                      title="Quitar del proyecto"
                      className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors disabled:opacity-50 ml-3 flex-shrink-0"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl py-2.5 text-sm transition-colors"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Services checkbox (still used in create/edit) ──────────────────────────────

function ServiceCheckboxList({ allServices, selectedIds, onChange }) {
  if (allServices.length === 0) return <p className="text-xs text-gray-400 mt-1">No hay servicios creados todavía.</p>
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {allServices.filter(s => s.active).map(s => (
        <label key={s.id} className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={selectedIds.includes(s.id)}
            onChange={() => onChange(
              selectedIds.includes(s.id)
                ? selectedIds.filter(id => id !== s.id)
                : [...selectedIds, s.id]
            )}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-xs text-gray-700 dark:text-gray-300">{s.name}</span>
        </label>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ProjectsTab() {
  const [projects,    setProjects]    = useState([])
  const [allServices, setAllServices] = useState([])
  const [allUsers,    setAllUsers]    = useState([])
  const [name,        setName]        = useState('')
  const [selServices, setSelServices] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [editingId,   setEditingId]   = useState(null)
  const [edit,        setEdit]        = useState({})
  const [teamProject, setTeamProject] = useState(null) // project for the team modal

  useEffect(() => {
    Promise.all([
      api.get('/projects/all'),
      api.get('/services/all'),
      api.get('/users'),
    ]).then(([proj, svc, usr]) => {
      setProjects(proj.data)
      setAllServices(svc.data)
      setAllUsers(usr.data.filter(u => u.active))
    })
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/projects', { name: name.trim(), serviceIds: selServices })
      setProjects(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setSelServices([])
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear proyecto')
    } finally {
      setLoading(false)
    }
  }

  async function toggleActive(project) {
    const { data } = await api.put(`/projects/${project.id}`, { active: !project.active })
    setProjects(prev => prev.map(p => p.id === data.id ? data : p))
  }

  function startEdit(project) {
    setEditingId(project.id)
    setEdit({
      name:       project.name,
      serviceIds: project.services.map(ps => ps.service.id),
    })
  }

  async function handleSaveEdit(project) {
    try {
      const body = { serviceIds: edit.serviceIds }
      if (edit.name.trim() !== project.name) body.name = edit.name.trim()
      const { data } = await api.put(`/projects/${project.id}`, body)
      setProjects(prev => prev.map(p => p.id === data.id ? data : p).sort((a, b) => a.name.localeCompare(b.name)))
      setEditingId(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al actualizar proyecto')
    }
  }

  function handleTeamUpdate(updatedProject) {
    setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p))
    // keep modal open — update the project reference so it shows latest state
    setTeamProject(updatedProject)
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Proyectos / Clientes</h2>

      {/* Create form */}
      <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 mb-6 space-y-3">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nombre del proyecto o cliente"
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Servicios asociados</p>
          <ServiceCheckboxList allServices={allServices} selectedIds={selServices} onChange={setSelServices} />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
        >
          {loading ? 'Guardando...' : 'Agregar proyecto'}
        </button>
      </form>
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {/* Active projects */}
      {(() => {
        const active = projects.filter(p => p.active)
        const archived = projects.filter(p => !p.active)
        return (
          <>
            <div className="space-y-2">
              {active.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No hay proyectos activos</p>
              )}
              {active.map(p => (
                <div key={p.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
                  {editingId === p.id ? (
                    <div className="p-4 space-y-3">
                      <input
                        value={edit.name}
                        onChange={e => setEdit(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full border border-primary-400 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <div>
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Servicios asociados</p>
                        <ServiceCheckboxList
                          allServices={allServices}
                          selectedIds={edit.serviceIds}
                          onChange={ids => setEdit(prev => ({ ...prev, serviceIds: ids }))}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleSaveEdit(p)} className="text-xs px-3 py-1.5 rounded-lg font-medium bg-primary-600 text-white hover:bg-primary-700 transition-colors">Guardar</button>
                        <button onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500" />
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                          <button
                            onClick={() => setTeamProject(p)}
                            className="text-xs px-3 py-1 rounded-full font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                          >
                            👥 Equipo {p.members.length > 0 && `(${p.members.length})`}
                          </button>
                          <button
                            onClick={() => startEdit(p)}
                            className="text-xs px-3 py-1 rounded-full font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => toggleActive(p)}
                            className="text-xs px-3 py-1 rounded-full font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                          >
                            Desactivar
                          </button>
                        </div>
                      </div>
                      {p.services.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 ml-5">
                          {p.services.map(ps => (
                            <span key={ps.service.id} className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded px-2 py-0.5">{ps.service.name}</span>
                          ))}
                        </div>
                      )}
                      {p.members.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 ml-5">
                          {p.members.map(pm => (
                            <span key={pm.user.id} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-2.5 py-0.5">
                              {pm.user.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Archive */}
            {archived.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Archivo</span>
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 rounded-full px-2 py-0.5">{archived.length}</span>
                </div>
                <div className="space-y-2">
                  {archived.map(p => (
                    <div key={p.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 opacity-60 hover:opacity-100 transition-opacity">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-300" />
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{p.name}</span>
                        </div>
                        <button
                          onClick={() => toggleActive(p)}
                          className="text-xs px-3 py-1 rounded-full font-medium bg-green-50 text-green-600 hover:bg-green-100 transition-colors flex-shrink-0 ml-3"
                        >
                          Reactivar
                        </button>
                      </div>
                      {p.services.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2 ml-5">
                          {p.services.map(ps => (
                            <span key={ps.service.id} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-2 py-0.5">{ps.service.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* Team modal */}
      {teamProject && (
        <TeamModal
          project={teamProject}
          allUsers={allUsers}
          onClose={() => setTeamProject(null)}
          onUpdate={handleTeamUpdate}
        />
      )}
    </div>
  )
}
