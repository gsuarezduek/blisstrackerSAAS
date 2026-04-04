import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { linkify } from '../utils/linkify'
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
  IN_PROGRESS: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
  PAUSED:      'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  PENDING:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

const STATUS_ORDER = { BLOCKED: 0, IN_PROGRESS: 1, PAUSED: 2, PENDING: 3 }

const ROLE_COLORS = [
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-yellow-100 text-yellow-700',
  'bg-blue-100 text-blue-700',
  'bg-cyan-100 text-cyan-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
]
function roleColor(name) {
  let hash = 0
  for (const c of (name || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return ROLE_COLORS[hash % ROLE_COLORS.length]
}

function Avatar({ user, size = 'md' }) {
  const cls = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'
  return (
    <img
      src={`/perfiles/${user.avatar ?? 'bee.png'}`}
      alt={user.name}
      className={`${cls} rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0`}
    />
  )
}

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { labelFor } = useRoles()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  // Archive state
  const [archive,      setArchive]      = useState([])
  const [archiveSkip,  setArchiveSkip]  = useState(0)
  const [hasMore,      setHasMore]      = useState(false)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveOpen,  setArchiveOpen]  = useState(false)

  useEffect(() => {
    api.get(`/projects/${id}/tasks`)
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || 'Error al cargar el proyecto'))
      .finally(() => setLoading(false))
  }, [id])

  const loadArchive = useCallback(async (skip = 0) => {
    setArchiveLoading(true)
    try {
      const { data: res } = await api.get(`/projects/${id}/completed?skip=${skip}`)
      setArchive(prev => skip === 0 ? res.tasks : [...prev, ...res.tasks])
      setHasMore(res.hasMore)
      setArchiveSkip(skip + res.tasks.length)
    } finally {
      setArchiveLoading(false)
    }
  }, [id])

  function handleOpenArchive() {
    setArchiveOpen(true)
    if (archive.length === 0) loadArchive(0)
  }

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
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  {totalPending === 0
                    ? 'No hay tareas pendientes'
                    : `${totalPending} tarea${totalPending !== 1 ? 's' : ''} pendiente${totalPending !== 1 ? 's' : ''}`}
                </p>
                {data.project.createdAt && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Activo desde: <span className="font-medium text-gray-500 dark:text-gray-400">
                      {new Date(data.project.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Links útiles */}
            {data.project.links?.length > 0 && (
              <div className="mb-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Links útiles</p>
                <div className="flex flex-wrap gap-2">
                  {data.project.links.map(link => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 border border-primary-100 dark:border-primary-800 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
                        <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                        <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                      </svg>
                      {link.label}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Servicios */}
            {data.project.services?.length > 0 && (
              <div className="mb-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">Servicios</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.project.services.map(ps => (
                    <span key={ps.service.id} className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 border border-primary-100 dark:border-primary-800 rounded-full px-2.5 py-0.5 font-medium">
                      {ps.service.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Equipo */}
            {data.project.members?.length > 0 && (
              <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
                  Equipo · {data.project.members.length} persona{data.project.members.length !== 1 ? 's' : ''}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {data.project.members.map(pm => (
                    <div key={pm.user.id} className="flex items-center gap-2 min-w-0">
                      <Avatar user={pm.user} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight truncate">{pm.user.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(pm.user.role)}`}>
                          {labelFor(pm.user.role)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state for pending */}
            {totalPending === 0 && (
              <div className="text-center py-10 text-gray-400">
                <p className="text-4xl mb-3">✅</p>
                <p className="font-medium">Todo al día</p>
                <p className="text-sm mt-1">No hay tareas pendientes en este proyecto</p>
              </div>
            )}

            {/* Tareas activas por usuario */}
            {totalPending > 0 && (
              <div className="space-y-4 mb-8">
                {data.byUser
                  .slice()
                  .sort((a, b) => {
                    const aMin = Math.min(...a.tasks.map(t => STATUS_ORDER[t.status]))
                    const bMin = Math.min(...b.tasks.map(t => STATUS_ORDER[t.status]))
                    return aMin - bMin || a.user.name.localeCompare(b.user.name)
                  })
                  .map(({ user, tasks }) => (
                    <div key={user.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                        <Avatar user={user} />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{user.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{labelFor(user.role)}</p>
                        </div>
                        <span className="ml-auto text-xs font-medium text-gray-500 dark:text-gray-400 flex-shrink-0">
                          {tasks.length} tarea{tasks.length !== 1 ? 's' : ''}
                        </span>
                      </div>
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
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{linkify(task.description)}</p>
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
            )}

            {/* Completadas esta semana */}
            {data.completedThisWeek?.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Completadas esta semana</span>
                  <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full px-2 py-0.5 font-medium">
                    {data.completedThisWeek.length}
                  </span>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                  {data.completedThisWeek.map(task => (
                    <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                      <Avatar user={task.user} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{linkify(task.description)}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {task.user.name} · {fmtDate(task.completedAt)}
                        </p>
                      </div>
                      <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full px-2 py-0.5 font-semibold flex-shrink-0 mt-0.5">✓</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Archivo histórico */}
            <div className="mb-8">
              {!archiveOpen ? (
                <button
                  onClick={handleOpenArchive}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2zM2 7.5h16l-1.573 7.868A2 2 0 0114.465 17H5.535a2 2 0 01-1.962-1.632L2 7.5z" />
                  </svg>
                  Ver archivo de tareas completadas
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Archivo</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">todas las tareas completadas</span>
                  </div>
                  {archive.length === 0 && !archiveLoading && (
                    <p className="text-sm text-gray-400 text-center py-8">No hay tareas completadas todavía</p>
                  )}
                  {archive.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                      {archive.map(task => (
                        <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                          <Avatar user={task.user} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{linkify(task.description)}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              {task.user.name} · {fmtDate(task.completedAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {archiveLoading && (
                    <p className="text-sm text-gray-400 text-center py-4">Cargando...</p>
                  )}
                  {!archiveLoading && hasMore && (
                    <button
                      onClick={() => loadArchive(archiveSkip)}
                      className="w-full mt-3 py-2.5 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors"
                    >
                      Cargar más
                    </button>
                  )}
                </>
              )}
            </div>

          </>
        )}
      </main>
    </div>
  )
}
