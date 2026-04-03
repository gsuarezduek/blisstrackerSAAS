import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

const COUNT_CONFIG = [
  { key: 'IN_PROGRESS',    label: 'En curso',    bg: 'bg-primary-100 dark:bg-primary-900/30',  text: 'text-primary-700 dark:text-primary-400' },
  { key: 'BLOCKED',        label: 'Bloqueadas',  bg: 'bg-red-100 dark:bg-red-900/30',          text: 'text-red-700 dark:text-red-400' },
  { key: 'PAUSED',         label: 'Pausadas',    bg: 'bg-gray-100 dark:bg-gray-700',           text: 'text-gray-500 dark:text-gray-400' },
  { key: 'PENDING',        label: 'Pendientes',  bg: 'bg-gray-100 dark:bg-gray-700',        text: 'text-gray-600 dark:text-gray-400' },
  { key: 'COMPLETED_WEEK', label: 'Esta semana', bg: 'bg-green-100 dark:bg-green-900/30',   text: 'text-green-700 dark:text-green-400' },
]

export default function MyProjects() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    api.get('/projects')
      .then(r => setProjects(r.data))
      .finally(() => setLoading(false))
  }, [])

  const isAdmin = user?.role === 'ADMIN'
  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mis Proyectos</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {isAdmin
              ? `${projects.length} proyectos activos`
              : `Participás en ${projects.length} proyecto${projects.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {loading && <div className="text-center py-16 text-gray-400">Cargando...</div>}

        {!loading && projects.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📂</p>
            <p className="font-medium">No estás asignado a ningún proyecto todavía</p>
            <p className="text-sm mt-1">Pedile a un administrador que te agregue a un proyecto</p>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div className="relative mb-5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar proyecto..."
              className="w-full pl-9 pr-9 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-xl py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            )}
          </div>
        )}

        {!loading && search && filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Sin resultados para "{search}"</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(p => {
            const counts = p.taskCounts ?? {}
            const activePills = COUNT_CONFIG.filter(c => counts[c.key] > 0)
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/my-projects/${p.id}`)}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col gap-4 cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-md transition-all"
              >
                {/* Project name */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                    <h2 className="font-bold text-gray-900 dark:text-white text-lg leading-tight">{p.name}</h2>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                  </svg>
                </div>

                {/* Task count pills */}
                {activePills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {activePills.map(c => (
                      <span key={c.key} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>
                        {counts[c.key]} {c.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin tareas pendientes esta semana</p>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
