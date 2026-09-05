import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../api/client'
import AddTaskModal from '../components/AddTaskModal'
import TaskCommentsModal from '../components/TaskCommentsModal'
import ProjectBriefs from '../components/briefs/ProjectBriefs'
import ProjectMeetings from '../components/meetings/ProjectMeetings'
import ProjectReports from '../components/ProjectReports'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import useMembers from '../hooks/useMembers'
import TareasTab from './project-detail/tareas'
import InfoTab, { TeamModal } from './project-detail/info'

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
                <TareasTab
                  data={data}
                  encodedId={encodedId}
                  totalPending={totalPending}
                  navigate={navigate}
                  onOpenComments={setCommentTask}
                  archive={archive}
                  archiveSkip={archiveSkip}
                  hasMore={hasMore}
                  archiveLoading={archiveLoading}
                  archiveFrom={archiveFrom}
                  archiveTo={archiveTo}
                  archiveUserId={archiveUserId}
                  workspaceMembers={workspaceMembers}
                  onArchiveUserChange={handleArchiveUserChange}
                  onArchiveDateSearch={handleArchiveDateSearch}
                  setArchiveFrom={setArchiveFrom}
                  setArchiveTo={setArchiveTo}
                  onLoadMore={loadArchive}
                />
              )}

              {/* Tab: Info — incluye Links/Accesos, Servicios, Equipo e Info del proyecto */}
              {infoTab === 'info' && (
                <InfoTab
                  data={data}
                  setData={setData}
                  encodedId={encodedId}
                  authUser={authUser}
                  linkForm={linkForm}
                  setLinkForm={setLinkForm}
                  linkSaving={linkSaving}
                  onAddLink={handleAddLink}
                  onDeleteLink={handleDeleteLink}
                  editingServices={editingServices}
                  setEditingServices={setEditingServices}
                  servicesDraft={servicesDraft}
                  setServicesDraft={setServicesDraft}
                  allServices={allServices}
                  servicesSaving={servicesSaving}
                  onOpenServicesEdit={openServicesEdit}
                  onSaveServices={handleSaveServices}
                  onOpenTeamEdit={openTeamEdit}
                />
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
        <TeamModal
          data={data}
          allUsers={allUsers}
          teamQuery={teamQuery}
          setTeamQuery={setTeamQuery}
          syncTeam={syncTeam}
          teamSaving={teamSaving}
          onClose={() => setShowTeamModal(false)}
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
