import { useState, useEffect, useRef, useMemo } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

function ProjectCombobox({ projects, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const selected = projects.find(p => String(p.id) === value)

  const filtered = query.trim() === ''
    ? projects
    : projects.filter(p => p.name.toLowerCase().includes(query.toLowerCase()))

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClick(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(project) {
    onChange(String(project.id))
    setQuery('')
    setOpen(false)
  }

  function handleInputChange(e) {
    setQuery(e.target.value)
    setOpen(true)
    onChange('') // limpiar selección mientras busca
  }

  function handleFocus() {
    setQuery('')
    setOpen(true)
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex items-center w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent transition-shadow ${open ? 'ring-2 ring-primary-500 border-transparent' : 'border-gray-300 dark:border-gray-600'}`}
      >
        <input
          ref={inputRef}
          type="text"
          value={open ? query : (selected?.name ?? '')}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder="Buscar proyecto..."
          className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-w-0"
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>

      {open && (
        <ul className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">Sin resultados</li>
          )}
          {filtered.map(p => (
            <li
              key={p.id}
              onMouseDown={() => handleSelect(p)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                String(p.id) === value
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'
                  : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {p.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Detecta descripciones vagas usando patrones GTD comunes
const VAGUE_PATTERNS = [
  /^(trabajar en|trabajar sobre|trabajar con)\b/i,
  /^(hacer|hacer el|hacer la|hacer los|hacer las)\s+\w+$/i,
  /^(ver|ver qué|ver si|ver cómo|ver el|ver la)\b/i,
  /^(revisar|checkear|checar)\s*$/i,
  /^(continuar|seguir con|seguir el|seguir la)\b/i,
  /^(arreglar|solucionar)\s*$/i,
  /^(pendiente|pending|todo|tareas?)\s*$/i,
  /^(llamar|llamada|reunión|meeting)\s*$/i,
]

function getGtdWarning(desc) {
  const trimmed = desc.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length < 12) return 'La descripción es muy corta. ¿Qué resultado específico buscás?'
  for (const pattern of VAGUE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return 'Esta descripción puede ser vaga. Intentá incluir qué vas a hacer y cuál es el resultado concreto. Ej: "Redactar propuesta de precios para cliente X" en lugar de "Trabajar en propuesta".'
    }
  }
  return null
}

export default function AddTaskModal({ onAdd, onClose, lockedProject }) {
  const { user } = useAuth()
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(lockedProject ? String(lockedProject.id) : '')
  const [projects, setProjects] = useState([])
  const [assigneeId, setAssigneeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showGtdWarning, setShowGtdWarning] = useState(false)

  const gtdWarning = useMemo(() => getGtdWarning(description), [description])

  useEffect(() => {
    if (lockedProject) return
    api.get('/projects').then(r => {
      setProjects(r.data)
      if (r.data.length > 0) setProjectId(String(r.data[0].id))
    })
  }, [lockedProject])

  // Reset assignee to self when project changes
  useEffect(() => {
    setAssigneeId(user ? String(user.id) : '')
  }, [projectId, user])

  // Siempre mostrar solo los miembros del proyecto seleccionado
  const assigneeOptions = (lockedProject
    ? (lockedProject.members ?? [])
    : (projects.find(p => String(p.id) === projectId)?.members ?? [])
  ).map(pm => ({ id: pm.user.id, name: pm.user.name }))

  async function doSubmit() {
    setLoading(true)
    try {
      const body = { description: description.trim(), projectId }
      if (assigneeId && assigneeId !== String(user?.id)) body.targetUserId = assigneeId
      const { data } = await api.post('/tasks', body)
      onAdd(data)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim() || !projectId) return
    if (gtdWarning && !showGtdWarning) {
      setShowGtdWarning(true)
      return
    }
    await doSubmit()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Nueva tarea</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
            <textarea
              autoFocus
              required
              rows={3}
              value={description}
              onChange={e => { setDescription(e.target.value); setShowGtdWarning(false) }}
              className={`w-full border dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none transition-colors ${
                showGtdWarning
                  ? 'border-amber-400 focus:ring-amber-400'
                  : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
              }`}
              placeholder="¿Qué vas a hacer?"
            />
            {showGtdWarning && gtdWarning && (
              <div className="mt-2 flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 p-3">
                <span className="text-amber-500 flex-shrink-0 mt-0.5">⚠️</span>
                <div className="text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-medium mb-1">Sugerencia GTD</p>
                  <p>{gtdWarning}</p>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proyecto / Cliente</label>
            {lockedProject ? (
              <div className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
                {lockedProject.name}
              </div>
            ) : (
              <ProjectCombobox projects={projects} value={projectId} onChange={setProjectId} />
            )}
          </div>

          {assigneeOptions.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asignar a</label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {assigneeOptions.map(u => (
                  <option key={u.id} value={String(u.id)}>
                    {u.name}{String(u.id) === String(user?.id) ? ' (yo)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !projectId}
              className={`flex-1 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                showGtdWarning
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              {loading ? 'Guardando...' : showGtdWarning ? 'Guardar igual' : 'Agregar tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
