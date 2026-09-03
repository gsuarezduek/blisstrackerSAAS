import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import { linkify } from '../utils/linkify'
import { completedDuration } from '../utils/format'
import api from '../api/client'
import AddTaskModal from '../components/AddTaskModal'
import UserLink from '../components/UserLink'
import TaskCommentsModal from '../components/TaskCommentsModal'
import ProjectSituation from '../components/ProjectSituation'
import ProjectInfoTab from '../components/ProjectInfoTab'
import ProjectBriefs from '../components/briefs/ProjectBriefs'
import ProjectMeetings from '../components/meetings/ProjectMeetings'
import ProjectReports from '../components/ProjectReports'
import ClientPortalConfig from '../components/ClientPortalConfig'
import ProjectAccesos from '../components/ProjectAccesos'
import DateRangeFilter from '../components/DateRangeFilter'
import { useAuth } from '../context/AuthContext'
import { avatarUrl } from '../utils/avatarUrl'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import useMembers from '../hooks/useMembers'
import RoleBadge from '../components/RoleBadge'

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

// Lunes de esta semana → hoy, en ART — mismo default que usa Reports.jsx.
function defaultArchiveFrom() {
  const tz = 'America/Argentina/Buenos_Aires'
  const now = new Date(); const day = now.getDay() || 7
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
  return mon.toLocaleDateString('en-CA', { timeZone: tz })
}
function defaultArchiveTo() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user: authUser } = useAuth()
  const { enabled: marketingEnabled } = useFeatureFlag('marketing')
  const { enabled: contenidoEnabled } = useFeatureFlag('contenido')
  const { members: workspaceMembers } = useMembers()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [showAddTask, setShowAddTask] = useState(false)
  const [linkForm, setLinkForm] = useState(null) // null = oculto, { label, url } = visible
  const [linkSaving, setLinkSaving] = useState(false)
  const [commentTask, setCommentTask] = useState(null)
  const [infoTab, setInfoTab] = useState(searchParams.get('infoTab') || 'tareas')

  const [projectList, setProjectList] = useState([])

  // Admin: edición de equipo
  const [showTeamModal,  setShowTeamModal]  = useState(false)
  const [allUsers,       setAllUsers]       = useState(null)
  const [teamQuery,      setTeamQuery]      = useState('')
  const [teamSaving,     setTeamSaving]     = useState(false)

  // Admin: edición de servicios
  const [editingServices, setEditingServices] = useState(false)
  const [servicesDraft,   setServicesDraft]   = useState([])
  const [allServices,     setAllServices]     = useState(null)
  const [servicesSaving,  setServicesSaving]  = useState(false)

  // Archive state — filtros de fecha (default: esta semana) y persona
  const [archive,      setArchive]      = useState([])
  const [archiveSkip,  setArchiveSkip]  = useState(0)
  const [hasMore,      setHasMore]      = useState(false)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveFrom,  setArchiveFrom]  = useState(defaultArchiveFrom)
  const [archiveTo,    setArchiveTo]    = useState(defaultArchiveTo)
  const [archiveUserId, setArchiveUserId] = useState('')

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

  // Publica el proyecto actual para que el botón flotante de "Nueva tarea"
  // (GlobalShortcuts) la asocie a este proyecto en vez de pedir elegir uno.
  useEffect(() => {
    if (!data?.project) return
    window.dispatchEvent(new CustomEvent('bliss:project-context', { detail: data.project }))
  }, [data])

  useEffect(() => {
    return () => window.dispatchEvent(new CustomEvent('bliss:project-context', { detail: null }))
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
    if (found) setCommentTask(found)
  }, [data, searchParams])

  const loadArchive = useCallback(async (skip = 0, filters = {}) => {
    const { from = archiveFrom, to = archiveTo, userId = archiveUserId } = filters
    setArchiveLoading(true)
    try {
      const params = new URLSearchParams({ skip })
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (userId) params.set('userId', userId)
      const { data: res } = await api.get(`/projects/${encodedId}/completed?${params}`)
      setArchive(prev => skip === 0 ? res.tasks : [...prev, ...res.tasks])
      setHasMore(res.hasMore)
      setArchiveSkip(skip + res.tasks.length)
    } finally {
      setArchiveLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encodedId, archiveFrom, archiveTo, archiveUserId])

  useEffect(() => { loadArchive(0) }, [encodedId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleArchiveDateSearch(from, to) {
    setArchiveFrom(from)
    setArchiveTo(to)
    loadArchive(0, { from, to, userId: archiveUserId })
  }

  function handleArchiveUserChange(e) {
    const userId = e.target.value
    setArchiveUserId(userId)
    loadArchive(0, { from: archiveFrom, to: archiveTo, userId })
  }

  const totalPending = data?.byUser.reduce((s, u) => s + u.tasks.length, 0) ?? 0

  async function handleAddTask() {
    const { data: res } = await api.get(`/projects/${encodedId}/tasks`)
    setData(res)
    setShowAddTask(false)
  }

  function handleCommentAdded(taskId, newCount) {
    const bump = t => t.id === taskId ? { ...t, _count: { ...t._count, comments: newCount } } : t
    setData(prev => ({
      ...prev,
      byUser: prev.byUser.map(u => ({ ...u, tasks: u.tasks.map(bump) })),
    }))
    setArchive(prev => prev.map(bump))
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

  async function openTeamEdit() {
    if (!allUsers) {
      const { data: users } = await api.get('/users')
      setAllUsers(users.filter(u => u.active))
    }
    setTeamQuery('')
    setShowTeamModal(true)
  }

  async function syncTeam(nextUsers) {
    setTeamSaving(true)
    try {
      const { data: updated } = await api.put(`/projects/${data.project.id}`, {
        memberIds: nextUsers.map(u => u.id),
      })
      setData(prev => ({ ...prev, project: { ...prev.project, members: updated.members } }))
    } finally {
      setTeamSaving(false)
    }
  }

  async function openServicesEdit() {
    if (!allServices) {
      const { data: svcs } = await api.get('/services/all')
      setAllServices(svcs)
    }
    setServicesDraft((data.project.services || []).map(ps => ps.service.id))
    setEditingServices(true)
  }

  async function handleSaveServices() {
    setServicesSaving(true)
    try {
      const { data: updated } = await api.put(`/projects/${data.project.id}`, {
        serviceIds: servicesDraft,
      })
      setData(prev => ({ ...prev, project: { ...prev.project, services: updated.services } }))
      setEditingServices(false)
    } finally {
      setServicesSaving(false)
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
      <main className="max-w-6xl mx-auto px-4 py-8">

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
              <div className="flex items-center gap-2 flex-shrink-0">
                {data.project.chatChannel?.slug && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('bliss:open-chat', { detail: { slug: data.project.chatChannel.slug } }))}
                    className="flex items-center justify-center w-10 h-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-lg rounded-xl transition-colors"
                    title="Chat del proyecto"
                  >
                    💬
                  </button>
                )}
                {marketingEnabled && (
                  <button
                    onClick={() => navigate(`/marketing?tab=geo-seo&sub=geo&projectId=${data.project.id}`)}
                    className="flex items-center justify-center w-10 h-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-lg rounded-xl transition-colors"
                    title="Marketing"
                  >
                    🎯
                  </button>
                )}
                {contenidoEnabled && (
                  <button
                    onClick={() => navigate(`/contenido?projectId=${data.project.id}`)}
                    className="flex items-center justify-center w-10 h-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-lg rounded-xl transition-colors"
                    title="Calendario de contenido"
                  >
                    📅
                  </button>
                )}
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
            </div>

            {/* Info tabs: Tareas / Info / Briefs / Reuniones / Reportes */}
            <div className="mb-6">
              {/* Tab bar — mobile select */}
              <div className="mb-3">
                <select
                  className="sm:hidden w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
                  value={infoTab}
                  onChange={e => setInfoTab(e.target.value)}
                >
                  <option value="tareas">Tareas</option>
                  <option value="info">Info</option>
                  {data.project.briefsEnabled !== false && <option value="briefs">Briefs</option>}
                  <option value="reuniones">Reuniones</option>
                  <option value="reportes">Reportes</option>
                </select>
                {/* Desktop */}
                <div className="hidden sm:flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 w-fit">
                  <button
                    onClick={() => setInfoTab('tareas')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${infoTab === 'tareas' ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  >
                    Tareas
                  </button>
                  <button
                    onClick={() => setInfoTab('info')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${infoTab === 'info' ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  >
                    Info
                  </button>
                  {data.project.briefsEnabled !== false && (
                    <button
                      onClick={() => setInfoTab('briefs')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${infoTab === 'briefs' ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      Briefs
                    </button>
                  )}
                  <button
                    onClick={() => setInfoTab('reuniones')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${infoTab === 'reuniones' ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  >
                    Reuniones
                  </button>
                  <button
                    onClick={() => setInfoTab('reportes')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${infoTab === 'reportes' ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  >
                    Reportes
                  </button>
                </div>
              </div>

              {/* Tab: Tareas — situación de la cuenta + tablero de tareas del proyecto */}
              {infoTab === 'tareas' && (
                <div className="space-y-4">
                  {data.project.situationEnabled !== false && (
                    <ProjectSituation
                      encodedProjectId={encodedId}
                      initialContent={data.project.situation || ''}
                    />
                  )}
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
                    <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                      Mostrando las primeras {data.activeLimit} tareas activas de {data.activeCount} totales. Completá o mové tareas al backlog para ver el resto.
                    </div>
                  )}

                  {totalPending > 0 && (
                    <div className="space-y-4">
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
                              onClick={() => navigate(`/users/${user.id}`)}
                              title="Ver perfil de esta persona"
                            >
                              <Avatar user={user} />
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{user.name}</p>
                                <RoleBadge role={user.role} userId={user.id} className="inline-block mt-0.5" />
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
                                          className="text-sm text-gray-700 dark:text-gray-300 leading-snug whitespace-pre-wrap break-words cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
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

                  {/* Tareas completadas — persona + tarea + fecha + duración, con filtro de fecha y persona */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tareas completadas</span>
                      <select
                        value={archiveUserId}
                        onChange={handleArchiveUserChange}
                        className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Todas las personas</option>
                        {workspaceMembers.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    <DateRangeFilter
                      from={archiveFrom} to={archiveTo}
                      onFromChange={setArchiveFrom} onToChange={setArchiveTo}
                      onSearch={handleArchiveDateSearch} loading={archiveLoading}
                      searchLabel="Filtrar"
                    />

                    {archive.length === 0 && !archiveLoading && (
                      <p className="text-sm text-gray-400 text-center py-8">No hay tareas completadas en este período</p>
                    )}
                    {archive.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                        {archive.map(task => {
                          const dur = completedDuration(task)
                          return (
                            <div key={task.id} className="flex items-start gap-3 px-4 py-3">
                              <Avatar user={task.user} size="sm" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug whitespace-pre-wrap break-words">{linkify(task.description)}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  <span>{task.user.name}</span>
                                  <RoleBadge userId={task.user.id} />
                                  <span>· {fmtDate(task.completedAt, data?.project?.timezone)}</span>
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                                <button
                                  onClick={() => setCommentTask(task)}
                                  title="Ver comentarios"
                                  className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                                >
                                  💬{(task._count?.comments ?? 0) > 0 ? ` ${task._count.comments}` : ''}
                                </button>
                                {dur && (
                                  <span className="text-xs text-gray-400 dark:text-gray-500 font-medium flex items-center gap-1">
                                    {task.minutesOverride != null && <span className="text-amber-500" title="Duración editada manualmente">✎</span>}
                                    {dur}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {archiveLoading && archive.length === 0 && (
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
                  </div>
                </div>
              )}

              {/* Tab: Info — incluye Links/Accesos, Servicios, Equipo e Info del proyecto */}
              {infoTab === 'info' && (
                <div className="space-y-4">

                  {/* Links + Accesos */}
                  {data.project.linksEnabled !== false && (
                    <>
                      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Links</p>
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

                      <ProjectAccesos projectId={encodedId} />
                    </>
                  )}

                  {/* Servicios */}
                  {(data.project.services?.length > 0 || authUser?.isAdmin) && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Servicios</p>
                        {authUser?.isAdmin && !editingServices && (
                          <button
                            onClick={openServicesEdit}
                            className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                          >
                            ✏️ Editar
                          </button>
                        )}
                      </div>

                      {editingServices && allServices ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            {allServices.filter(s => s.active).map(s => (
                              <label key={s.id} className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={servicesDraft.includes(s.id)}
                                  onChange={() => setServicesDraft(prev =>
                                    prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                                  )}
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">{s.name}</span>
                              </label>
                            ))}
                            {allServices.filter(s => s.active).length === 0 && (
                              <p className="text-sm text-gray-400 dark:text-gray-500">No hay servicios creados todavía.</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={handleSaveServices}
                              disabled={servicesSaving}
                              className="text-sm px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                            >
                              {servicesSaving ? 'Guardando...' : 'Guardar'}
                            </button>
                            <button
                              onClick={() => setEditingServices(false)}
                              className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (data.project.services?.length ?? 0) > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {data.project.services.map(ps => (
                            <span key={ps.service.id} className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 border border-primary-100 dark:border-primary-800 rounded-full px-2.5 py-0.5 font-medium">
                              {ps.service.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">Sin servicios asignados todavía.</p>
                      )}
                    </div>
                  )}

                  {/* Cliente — portal externo (informes + briefs + datos en vivo) */}
                  <ClientPortalConfig
                    projectId={data.project.id}
                    canEdit={authUser?.isAdmin || (data.project.members ?? []).some(pm => pm.user.id === authUser?.id)}
                  />

                  {/* Equipo */}
                  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                        Equipo{(data.project.members?.length ?? 0) > 0 ? ` · ${data.project.members.length} persona${data.project.members.length !== 1 ? 's' : ''}` : ''}
                      </p>
                      {authUser?.isAdmin && (
                        <button
                          onClick={openTeamEdit}
                          className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                        >
                          ✏️ Editar equipo
                        </button>
                      )}
                    </div>
                    {(data.project.members?.length ?? 0) === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500">Sin personas en el equipo.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {data.project.members.map(pm => (
                          <UserLink
                            key={pm.user.id}
                            userId={pm.user.id}
                            as="div"
                            className="group relative aspect-square rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-primary-400 dark:hover:ring-primary-500 transition-all"
                          >
                            <img
                              src={avatarUrl(pm.user.avatar)}
                              alt={pm.user.name}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                            <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
                              <p className="text-white font-semibold text-sm leading-tight truncate drop-shadow">{pm.user.name}</p>
                              <div className="mt-1">
                                <RoleBadge role={pm.user.role} userId={pm.user.id} />
                              </div>
                            </div>
                          </UserLink>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Info del proyecto */}
                  <ProjectInfoTab project={data.project} onSave={updated => setData(prev => ({ ...prev, project: { ...prev.project, ...updated } }))} />
                </div>
              )}

              {/* Tab: Briefs */}
              {infoTab === 'briefs' && data.project.briefsEnabled !== false && (
                <ProjectBriefs
                  projectId={data.project.id}
                  canEdit={authUser?.isAdmin || (data.project.members ?? []).some(pm => pm.user.id === authUser?.id)}
                />
              )}

              {/* Tab: Reuniones */}
              {infoTab === 'reuniones' && (
                <ProjectMeetings
                  projectId={data.project.id}
                  canEdit={authUser?.isAdmin || (data.project.members ?? []).some(pm => pm.user.id === authUser?.id)}
                />
              )}

              {/* Tab: Reportes — horas y tareas completadas por mes, histórico */}
              {infoTab === 'reportes' && (
                <ProjectReports projectId={data.project.id} />
              )}
            </div>

          </>
        )}
      </main>

      {showAddTask && data && (
        <AddTaskModal
          lockedProject={data.project}
          onAdd={handleAddTask}
          onClose={() => setShowAddTask(false)}
        />
      )}

      {showTeamModal && allUsers && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b dark:border-gray-700 flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Equipo del proyecto</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">{data.project.name}</p>
              </div>
              <button onClick={() => setShowTeamModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors ml-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-4 p-5 overflow-y-auto">

              {/* Buscador */}
              <div className="relative">
                <input
                  autoFocus
                  value={teamQuery}
                  onChange={e => setTeamQuery(e.target.value)}
                  placeholder="Buscar persona por nombre..."
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 pr-9"
                />
                {teamQuery && (
                  <button onClick={() => setTeamQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                    </svg>
                  </button>
                )}
                {teamQuery && (() => {
                  const currentIds = new Set(data.project.members.map(pm => pm.user.id))
                  const suggestions = allUsers.filter(u =>
                    !currentIds.has(u.id) && u.name.toLowerCase().includes(teamQuery.toLowerCase())
                  )
                  return (
                    <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                      {suggestions.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                          {allUsers.filter(u => !currentIds.has(u.id)).length === 0
                            ? 'Todos los usuarios ya están en este proyecto'
                            : 'No se encontraron resultados'}
                        </p>
                      ) : suggestions.map(u => (
                        <div key={u.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 border-b dark:border-gray-600 last:border-b-0 transition-colors">
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{u.name}</p>
                            <RoleBadge role={u.teamRole || u.role} userId={u.id} className="inline-block mt-0.5" />
                          </div>
                          <button
                            onClick={() => {
                              syncTeam([...data.project.members.map(pm => pm.user), u])
                              setTeamQuery('')
                            }}
                            disabled={teamSaving}
                            className="text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0 ml-3"
                          >
                            + Agregar
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* Miembros actuales */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  En el proyecto · {data.project.members.length} persona{data.project.members.length !== 1 ? 's' : ''}
                </p>
                {data.project.members.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">
                    Sin equipo asignado todavía
                  </p>
                ) : (
                  <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                    {data.project.members.map(pm => (
                      <div key={pm.user.id} className="flex items-center justify-between px-4 py-2.5 border-b dark:border-gray-600 last:border-b-0">
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{pm.user.name}</p>
                          <RoleBadge role={pm.user.teamRole || pm.user.role} userId={pm.user.id} className="inline-block mt-0.5" />
                        </div>
                        <button
                          onClick={() => syncTeam(data.project.members.filter(m => m.user.id !== pm.user.id).map(m => m.user))}
                          disabled={teamSaving}
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
                onClick={() => setShowTeamModal(false)}
                className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl py-2.5 text-sm transition-colors"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
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
          onTaskDeleted={id => {
            setData(prev => ({
              ...prev,
              byUser: prev.byUser.map(u => ({
                ...u,
                tasks: u.tasks.filter(t => t.id !== id),
              })),
            }))
          }}
        />
      )}
    </div>
  )
}
