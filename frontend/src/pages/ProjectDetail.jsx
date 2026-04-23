import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import { linkify } from '../utils/linkify'
import { fmtMins, completedDuration } from '../utils/format'
import api from '../api/client'
import useRoles from '../hooks/useRoles'
import UserTasksModal from '../components/UserTasksModal'
import AddTaskModal from '../components/AddTaskModal'
import TaskCommentsModal from '../components/TaskCommentsModal'
import ProjectSituation from '../components/ProjectSituation'
import ProjectInfoTab from '../components/ProjectInfoTab'
import { useAuth } from '../context/AuthContext'
import { avatarUrl } from '../utils/avatarUrl'

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
      src={avatarUrl(user.avatar)}
      alt={user.name}
      className={`${cls} rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0`}
    />
  )
}

function fmtDate(iso, tz = 'America/Argentina/Buenos_Aires') {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz })
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user: authUser } = useAuth()
  const { labelFor } = useRoles()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [linkForm, setLinkForm] = useState(null) // null = oculto, { label, url } = visible
  const [linkSaving, setLinkSaving] = useState(false)
  const [commentTask, setCommentTask] = useState(null)
  const [infoTab, setInfoTab] = useState('situacion')
  const [teamTaskModal, setTeamTaskModal] = useState(false)
  const [teamTaskDesc, setTeamTaskDesc] = useState('')
  const [teamTaskSending, setTeamTaskSending] = useState(false)
  const [teamTaskResult, setTeamTaskResult] = useState(null) // { ok, errors }
  const teamTaskRef = useRef(null)

  const [projectList, setProjectList] = useState([])

  // Archive state
  const [archive,      setArchive]      = useState([])
  const [archiveSkip,  setArchiveSkip]  = useState(0)
  const [hasMore,      setHasMore]      = useState(false)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveOpen,  setArchiveOpen]  = useState(false)

  const encodedId = encodeURIComponent(id)

  useEffect(() => {
    api.get(`/projects/${encodedId}/tasks`)
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || 'Error al cargar el proyecto'))
      .finally(() => setLoading(false))
  }, [encodedId])

  useEffect(() => {
    api.get('/projects').then(r => setProjectList(r.data)).catch(() => {})
  }, [])

  // Abrir modal de comentarios desde ?task=:id (eg. al llegar desde una notificación)
  useEffect(() => {
    const taskId = Number(searchParams.get('task'))
    if (!taskId || !data) return
    let found = null
    for (const u of data.byUser ?? []) {
      found = u.tasks.find(t => t.id === taskId)
      if (found) break
    }
    if (!found) found = data.completedThisWeek?.find(t => t.id === taskId)
    if (found) setCommentTask(found)
  }, [data, searchParams])

  const loadArchive = useCallback(async (skip = 0) => {
    setArchiveLoading(true)
    try {
      const { data: res } = await api.get(`/projects/${encodedId}/completed?skip=${skip}`)
      setArchive(prev => skip === 0 ? res.tasks : [...prev, ...res.tasks])
      setHasMore(res.hasMore)
      setArchiveSkip(skip + res.tasks.length)
    } finally {
      setArchiveLoading(false)
    }
  }, [encodedId])

  function handleOpenArchive() {
    setArchiveOpen(true)
    if (archive.length === 0) loadArchive(0)
  }

  const totalPending = data?.byUser.reduce((s, u) => s + u.tasks.length, 0) ?? 0

  async function handleAddTask() {
    const { data: res } = await api.get(`/projects/${encodedId}/tasks`)
    setData(res)
    setShowAddTask(false)
  }

  async function handleAddTeamTask(e) {
    e.preventDefault()
    if (!teamTaskDesc.trim()) return
    const members = data?.project?.members ?? []
    if (members.length === 0) return
    setTeamTaskSending(true)
    setTeamTaskResult(null)
    const results = await Promise.allSettled(
      members.map(pm =>
        api.post('/tasks', {
          description: teamTaskDesc.trim(),
          projectId: data.project.id,
          targetUserId: pm.user.id,
        })
      )
    )
    const errors = results
      .map((r, i) => r.status === 'rejected' ? members[i].user.name : null)
      .filter(Boolean)
    setTeamTaskResult({ ok: results.length - errors.length, errors })
    setTeamTaskDesc('')
    setTeamTaskSending(false)
    // Reload tasks
    const { data: res } = await api.get(`/projects/${encodedId}/tasks`)
    setData(res)
  }

  function handleCommentAdded(taskId, newCount) {
    setData(prev => ({
      ...prev,
      byUser: prev.byUser.map(u => ({
        ...u,
        tasks: u.tasks.map(t =>
          t.id === taskId ? { ...t, _count: { ...t._count, comments: newCount } } : t
        ),
      })),
    }))
  }

  async function handleAddLink() {
    if (!linkForm?.label?.trim() || !linkForm?.url?.trim()) return
    setLinkSaving(true)
    try {
      const existing = (data.project.links ?? []).map(l => ({ label: l.label, url: l.url }))
      const newLinks = [...existing, { label: linkForm.label.trim(), url: linkForm.url.trim() }]
      const { data: updated } = await api.put(`/projects/${encodedId}/links`, { links: newLinks })
      setData(prev => ({ ...prev, project: { ...prev.project, links: updated.links } }))
      setLinkForm(null)
    } finally {
      setLinkSaving(false)
    }
  }

  async function handleDeleteLink(linkId) {
    const newLinks = (data.project.links ?? [])
      .filter(l => l.id !== linkId)
      .map(l => ({ label: l.label, url: l.url }))
    try {
      const { data: updated } = await api.put(`/projects/${encodedId}/links`, { links: newLinks })
      setData(prev => ({ ...prev, project: { ...prev.project, links: updated.links } }))
    } catch (err) {
      console.error('Error al eliminar link', err)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-8">

        {/* Nav bar */}
        {(() => {
          const currentIdx = projectList.findIndex(p => String(p.id) === String(id) || p.name === id)
          const nextProject = currentIdx >= 0 && currentIdx < projectList.length - 1 ? projectList[currentIdx + 1] : null
          return (
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => navigate('/my-projects')}
                className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                </svg>
                Mis Proyectos
              </button>
              {nextProject && (
                <button
                  onClick={() => navigate(`/my-projects/${encodeURIComponent(nextProject.name)}`)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                >
                  <span className="truncate max-w-[160px]">{nextProject.name}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          )
        })()}

        {loading && <LoadingSpinner className="py-16" />}

        {error && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">⚠️</p>
            <p>{error}</p>
          </div>
        )}

        {data && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
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
                        {new Date(data.project.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: data.project.timezone || 'America/Argentina/Buenos_Aires' })}
                      </span>
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowAddTask(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                </svg>
                Agregar tarea
              </button>
            </div>

            {/* Info tabs: Situación / Links / Personas / Servicios */}
            <div className="mb-6">
              {/* Tab bar — mobile select */}
              <div className="mb-3">
                <select
                  className="sm:hidden w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={infoTab}
                  onChange={e => setInfoTab(e.target.value)}
                >
                  {data.project.situationEnabled !== false && <option value="situacion">Situación</option>}
                  {data.project.linksEnabled !== false && <option value="links">Links útiles</option>}
                  <option value="personas">Equipo</option>
                  {data.project.services?.length > 0 && <option value="servicios">Servicios</option>}
                  <option value="info">Info</option>
                </select>
                {/* Desktop */}
                <div className="hidden sm:flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 w-fit">
                  {data.project.situationEnabled !== false && (
                    <button
                      onClick={() => setInfoTab('situacion')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${infoTab === 'situacion' ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      Situación
                    </button>
                  )}
                  {data.project.linksEnabled !== false && (
                    <button
                      onClick={() => setInfoTab('links')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${infoTab === 'links' ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      Links útiles
                    </button>
                  )}
                  <button
                    onClick={() => setInfoTab('personas')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${infoTab === 'personas' ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  >
                    Equipo
                  </button>
                  {data.project.services?.length > 0 && (
                    <button
                      onClick={() => setInfoTab('servicios')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${infoTab === 'servicios' ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      Servicios
                    </button>
                  )}
                  <button
                    onClick={() => setInfoTab('info')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${infoTab === 'info' ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  >
                    Info
                  </button>
                </div>
              </div>

              {/* Tab: Situación */}
              {infoTab === 'situacion' && data.project.situationEnabled !== false && (
                <ProjectSituation
                  encodedProjectId={encodedId}
                  initialContent={data.project.situation || ''}
                />
              )}

              {/* Tab: Links útiles */}
              {infoTab === 'links' && data.project.linksEnabled !== false && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Links útiles</p>
                    {!linkForm && (
                      <button
                        onClick={() => setLinkForm({ label: '', url: '' })}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                      >
                        + Agregar
                      </button>
                    )}
                  </div>

                  {(data.project.links ?? []).length === 0 && !linkForm && (
                    <p className="text-sm text-gray-400 dark:text-gray-500">Sin links por el momento.</p>
                  )}

                  {(data.project.links ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {data.project.links.map(link => (
                        <div key={link.id} className="flex items-center gap-1 group">
                          <a
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
                          <button
                            onClick={() => handleDeleteLink(link.id)}
                            className="opacity-0 group-hover:opacity-100 ml-0.5 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-all rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                            title="Eliminar link"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {linkForm && (
                    <div className="mt-2 flex flex-wrap gap-2 items-end">
                      <input
                        type="text"
                        placeholder="Nombre"
                        value={linkForm.label}
                        onChange={e => setLinkForm(p => ({ ...p, label: e.target.value }))}
                        className="flex-1 min-w-[120px] text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
                      />
                      <input
                        type="url"
                        placeholder="https://..."
                        value={linkForm.url}
                        onChange={e => setLinkForm(p => ({ ...p, url: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && handleAddLink()}
                        className="flex-[2] min-w-[180px] text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
                      />
                      <button
                        onClick={handleAddLink}
                        disabled={linkSaving || !linkForm.label.trim() || !linkForm.url.trim()}
                        className="text-sm px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                      >
                        {linkSaving ? '...' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => setLinkForm(null)}
                        className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Personas */}
              {infoTab === 'personas' && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                  {(data.project.members?.length ?? 0) === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500">Sin personas en el equipo.</p>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              )}

              {/* Tab: Servicios */}
              {infoTab === 'servicios' && data.project.services?.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
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

              {/* Tab: Info */}
              {infoTab === 'info' && (
                <ProjectInfoTab project={data.project} onSave={updated => setData(prev => ({ ...prev, project: { ...prev.project, ...updated } }))} />
              )}
            </div>

            {/* Empty state for pending */}
            {totalPending === 0 && (
              <div className="text-center py-10 text-gray-400">
                <p className="text-4xl mb-3">🐝</p>
                <p className="font-medium">Todo al día</p>
                <p className="text-sm mt-1">No hay tareas pendientes en este proyecto</p>
              </div>
            )}

            {/* Tareas activas por usuario */}
            {data?.activeCount > data?.activeLimit && (
              <div className="mb-4 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                Mostrando las primeras {data.activeLimit} tareas activas de {data.activeCount} totales. Completá o mové tareas al backlog para ver el resto.
              </div>
            )}

            {/* Agregar tarea a todo el equipo — solo admins, siempre visible */}
            {authUser?.isAdmin && (
              <div className="mb-4 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 overflow-hidden">
                <button
                  className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => { setTeamTaskModal(v => !v); setTeamTaskResult(null); setTeamTaskDesc('') }}
                >
                  <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 dark:text-gray-500">
                      <path d="M11 5a3 3 0 11-6 0 3 3 0 016 0zM2.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 018 18a9.953 9.953 0 01-5.385-1.572zM16.25 5.75a.75.75 0 00-1.5 0v2h-2a.75.75 0 000 1.5h2v2a.75.75 0 001.5 0v-2h2a.75.75 0 000-1.5h-2v-2z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Agregar tarea a todo el equipo</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{data?.project?.members?.length ?? 0} personas</p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                    className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${teamTaskModal ? 'rotate-180' : ''}`}
                  >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                {teamTaskModal && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700">
                    <form onSubmit={handleAddTeamTask} className="space-y-3">
                      <textarea
                        ref={teamTaskRef}
                        autoFocus
                        rows={2}
                        value={teamTaskDesc}
                        onChange={e => setTeamTaskDesc(e.target.value)}
                        placeholder="Descripción de la tarea..."
                        className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 resize-none"
                      />
                      <div className="flex items-center gap-3">
                        <button
                          type="submit"
                          disabled={teamTaskSending || !teamTaskDesc.trim()}
                          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors disabled:opacity-50"
                        >
                          {teamTaskSending ? (
                            <>
                              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                              </svg>
                              Enviando...
                            </>
                          ) : `Asignar a ${data?.project?.members?.length ?? 0} personas`}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setTeamTaskModal(false); setTeamTaskResult(null) }}
                          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                      {teamTaskResult && (
                        <div className={`text-xs rounded-lg px-3 py-2 ${teamTaskResult.errors.length > 0 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'}`}>
                          {teamTaskResult.ok > 0 && <span>✓ Tarea asignada a {teamTaskResult.ok} persona{teamTaskResult.ok !== 1 ? 's' : ''}.</span>}
                          {teamTaskResult.errors.length > 0 && <span> Error en: {teamTaskResult.errors.join(', ')}.</span>}
                        </div>
                      )}
                    </form>
                  </div>
                )}
              </div>
            )}

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
                      <button
                        className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                        onClick={() => setSelectedUser(user)}
                      >
                        <Avatar user={user} />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{user.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{labelFor(user.role)}</p>
                        </div>
                        <span className="ml-auto text-xs font-medium text-gray-500 dark:text-gray-400 flex-shrink-0">
                          {tasks.length} tarea{tasks.length !== 1 ? 's' : ''}
                        </span>
                      </button>
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
                                <div className="flex-1 min-w-0">
                                  <p
                                    onClick={() => setCommentTask(task)}
                                    className="text-sm text-gray-700 dark:text-gray-300 leading-snug cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                  >{linkify(task.description)}</p>
                                  {task.createdBy && (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                      Creada por {task.createdBy.name.split(' ')[0]}
                                    </p>
                                  )}
                                  <div className="mt-1">
                                    {(task._count?.comments ?? 0) > 0 ? (
                                      <button
                                        onClick={() => setCommentTask(task)}
                                        className="text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                      >
                                        💬 {task._count.comments} comentario{task._count.comments !== 1 ? 's' : ''}
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => setCommentTask(task)}
                                        title="Agregar comentario"
                                        className="text-xs text-gray-300 dark:text-gray-600 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
                                      >
                                        💬 Comentar
                                      </button>
                                    )}
                                  </div>
                                </div>
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
            {data.completedThisWeek?.length > 0 && (() => {
              const totalMins = data.completedThisWeek.reduce((acc, t) => {
                if (!t.startedAt || !t.completedAt) return acc
                return acc + Math.max(0, Math.round((new Date(t.completedAt) - new Date(t.startedAt)) / 60000) - (t.pausedMinutes || 0))
              }, 0)
              return (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Completadas esta semana</span>
                    <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full px-2 py-0.5 font-medium">
                      {data.completedThisWeek.length}
                    </span>
                    {totalMins > 0 && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 font-medium">
                        ⏱ {fmtMins(totalMins)}
                      </span>
                    )}
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                    {data.completedThisWeek.map(task => {
                      const dur = completedDuration(task)
                      return (
                        <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                          <Avatar user={task.user} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">{linkify(task.description)}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              {task.user.name} · {fmtDate(task.completedAt, data?.project?.timezone)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                            {dur && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{dur}</span>
                            )}
                            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full px-2 py-0.5 font-semibold">✓</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

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
                              {task.user.name} · {fmtDate(task.completedAt, data?.project?.timezone)}
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

      {selectedUser && (
        <UserTasksModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}

      {showAddTask && data && (
        <AddTaskModal
          lockedProject={data.project}
          onAdd={handleAddTask}
          onClose={() => setShowAddTask(false)}
        />
      )}

      {commentTask && (
        <TaskCommentsModal
          task={{ ...commentTask, project: commentTask.project ?? data?.project }}
          onClose={() => setCommentTask(null)}
          onCommentAdded={count => handleCommentAdded(commentTask.id, count)}
          onTaskEdited={updated => {
            setCommentTask(prev => ({ ...prev, description: updated.description }))
            setData(prev => ({
              ...prev,
              byUser: prev.byUser.map(u => ({
                ...u,
                tasks: u.tasks.map(t => t.id === updated.id ? { ...t, description: updated.description } : t),
              })),
            }))
          }}
        />
      )}
    </div>
  )
}
