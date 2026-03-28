import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'
import useRoles from '../hooks/useRoles'

const STATUS_LABEL = {
  BLOCKED:     'Bloqueada',
  IN_PROGRESS: 'En curso',
  PAUSED:      'Pausada',
  PENDING:     'Pendiente',
}

const STATUS_CLASS = {
  BLOCKED:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PAUSED:      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  PENDING:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

const STATUS_ORDER = { BLOCKED: 0, IN_PROGRESS: 1, PAUSED: 2, PENDING: 3 }

const AVATAR_COLORS = ['bg-indigo-500','bg-pink-500','bg-yellow-500','bg-green-500','bg-blue-500','bg-purple-500','bg-red-500','bg-cyan-500']

function Avatar({ name }) {
  const initials = name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
  return (
    <div className={`${color} text-white w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0`}>
      {initials}
    </div>
  )
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { labelFor } = useRoles()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/projects/${id}/tasks`)
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || 'Error al cargar el proyecto'))
      .finally(() => setLoading(false))
  }, [id])

  const totalPending = data?.byUser.reduce((s, u) => s + u.tasks.length, 0) ?? 0

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">

        {/* Back */}
        <button
          onClick={() => navigate('/my-projects')}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 mb-6 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Mis Proyectos
        </button>

        {loading && <div className="text-center py-16 text-gray-400">Cargando...</div>}

        {error && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">⚠️</p>
            <p>{error}</p>
          </div>
        )}

        {data && (
          <>
            {/* Header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{data.project.name}</h1>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {totalPending === 0
                  ? 'No hay tareas pendientes'
                  : `${totalPending} tarea${totalPending !== 1 ? 's' : ''} pendiente${totalPending !== 1 ? 's' : ''}`}
              </p>
            </div>

            {totalPending === 0 && (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">✅</p>
                <p className="font-medium">Todo al día</p>
                <p className="text-sm mt-1">No hay tareas pendientes en este proyecto</p>
              </div>
            )}

            {/* Tasks by user */}
            <div className="space-y-4">
              {data.byUser
                .slice()
                .sort((a, b) => {
                  // Ordenar: usuarios con IN_PROGRESS primero
                  const aMin = Math.min(...a.tasks.map(t => STATUS_ORDER[t.status]))
                  const bMin = Math.min(...b.tasks.map(t => STATUS_ORDER[t.status]))
                  return aMin - bMin || a.user.name.localeCompare(b.user.name)
                })
                .map(({ user, tasks }) => (
                  <div key={user.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">

                    {/* User header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                      <Avatar name={user.name} />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{user.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{labelFor(user.role)}</p>
                      </div>
                      <span className="ml-auto text-xs font-medium text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {tasks.length} tarea{tasks.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Task list */}
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                      {tasks
                        .slice()
                        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
                        .map(task => (
                          <div key={task.id} className={`flex flex-col gap-1.5 px-4 py-3 ${task.status === 'BLOCKED' ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                            <div className="flex items-start gap-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${STATUS_CLASS[task.status]}`}>
                                {STATUS_LABEL[task.status]}
                              </span>
                              <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{task.description}</p>
                            </div>
                            {task.status === 'BLOCKED' && task.blockedReason && (
                              <div className="ml-0 flex items-start gap-1.5 pl-2 border-l-2 border-red-300 dark:border-red-700">
                                <p className="text-xs text-red-600 dark:text-red-400">{task.blockedReason}</p>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>

                  </div>
                ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
