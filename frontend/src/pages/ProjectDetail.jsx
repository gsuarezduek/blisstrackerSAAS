import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../api/client'
import TaskCommentsModal from '../components/TaskCommentsModal'
import ProjectBriefs from '../components/briefs/ProjectBriefs'
import ProjectMeetings from '../components/meetings/ProjectMeetings'
import ProjectReports from '../components/ProjectReports'
import ProjectFiles from '../components/ProjectFiles'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import useMembers from '../hooks/useMembers'
import TareasTab from './project-detail/tareas'
import InfoTab, { TeamModal } from './project-detail/info'
import OverviewTab from './project-detail/overview'
import AccesosTab from './project-detail/accesos'
import { AvatarStack } from './project-detail/ui'
import { TriangleAlert } from 'lucide-react'
import { Icon } from '../components/ui/Icon'

// Nombres viejos de pestañas que siguen llegando por links guardados/notificaciones
// (`?infoTab=info` desde Marketing para cargar el sitio web, `reportes`).
const LEGACY_TABS = { info: 'ajustes', reportes: 'horas' }
function tabFromParam(value) {
  return LEGACY_TABS[value] || value || 'resumen'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const { user: authUser } = useAuth()
  const { enabled: marketingEnabled } = useFeatureFlag('marketing')
  const { enabled: contenidoEnabled } = useFeatureFlag('contenido')
  const { enabled: calendarioEnabled } = useFeatureFlag('calendario')
  const { members: workspaceMembers } = useMembers()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [linkForm, setLinkForm] = useState(null) // null = oculto, { label, url } = visible
  const [linkSaving, setLinkSaving] = useState(false)
  const [commentTask, setCommentTask] = useState(null)
  const [infoTab, setInfoTab] = useState(() => tabFromParam(searchParams.get('infoTab')))
  const [statusFilter, setStatusFilter] = useState('')

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

  const loadProject = useCallback(() => {
    return api.get(`/projects/${encodedId}/tasks`)
      .then(r => { setData(r.data); setError('') })
      .catch(err => setError(err.response?.data?.error || 'Error al cargar el proyecto'))
      .finally(() => setLoading(false))
  }, [encodedId])

  useEffect(() => { loadProject() }, [loadProject])

  // Una tarea creada desde el modal global (tecla N / botón flotante) puede ser de
  // este proyecto: refrescamos el tablero para que aparezca sin recargar la página.
  useEffect(() => {
    function onTaskCreated() { loadProject() }
    window.addEventListener('bliss:task-created', onTaskCreated)
    return () => window.removeEventListener('bliss:task-created', onTaskCreated)
  }, [loadProject])

  // Navegar entre pestañas deja la pestaña en la URL (?infoTab=), así un link
  // compartido o el botón "atrás" vuelven al mismo lugar. `opts.status` preselecciona
  // el filtro de la pestaña Tareas (ej. "ver bloqueadas").
  function goTab(key, opts = {}) {
    setInfoTab(key)
    if (key === 'tareas') setStatusFilter(opts.status || '')
    const next = new URLSearchParams(searchParams)
    if (key === 'resumen') next.delete('infoTab'); else next.set('infoTab', key)
    next.delete('fileId')
    setSearchParams(next, { replace: true })
  }

  // Si la URL cambia por fuera (buscador global → "?infoTab=archivos&fileId="
  // estando ya en este proyecto), seguimos a la URL.
  const tabParam = searchParams.get('infoTab')
  useEffect(() => { setInfoTab(tabFromParam(tabParam)) }, [tabParam])

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

  const projectStar = projectList.find(p => p.id === data?.project?.id)
  async function toggleStar() {
    if (!projectStar) return
    const next = !projectStar.starred
    setProjectList(prev => prev.map(p => p.id === projectStar.id ? { ...p, starred: next } : p))
    try { await api.patch(`/projects/${projectStar.id}/star`) }
    catch { setProjectList(prev => prev.map(p => p.id === projectStar.id ? { ...p, starred: !next } : p)) }
  }

  const allTasks = data?.byUser.flatMap(u => u.tasks) ?? []
  const blockedCount = allTasks.filter(t => t.status === 'BLOCKED').length
  const inProgressCount = allTasks.filter(t => t.status === 'IN_PROGRESS').length
  const canEditProject = authUser?.isAdmin || (data?.project.members ?? []).some(pm => pm.user.id === authUser?.id)

  const tabs = data ? [
    { key: 'resumen',   label: 'Resumen' },
    { key: 'tareas',    label: 'Tareas', count: totalPending, alert: blockedCount > 0 },
    { key: 'reuniones', label: 'Reuniones' },
    ...(data.project.filesEnabled !== false ? [{ key: 'archivos', label: 'Nube' }] : []),
    ...(data.project.briefsEnabled !== false ? [{ key: 'briefs', label: 'Briefs' }] : []),
    ...(data.project.linksEnabled !== false ? [{ key: 'accesos', label: 'Links y accesos' }] : []),
    { key: 'horas',     label: 'Horas' },
    { key: 'ajustes',   label: 'Ajustes' },
  ] : []
  const activeTab = tabs.some(t => t.key === infoTab) ? infoTab : 'resumen'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8">

        {/* Navegación entre proyectos */}
        {(() => {
          const currentIdx = projectList.findIndex(p => String(p.id) === String(id) || p.name === id)
          const nextProject = currentIdx >= 0 && currentIdx < projectList.length - 1 ? projectList[currentIdx + 1] : null
          return (
            <div className="flex items-center justify-between mb-5">
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
                  title="Siguiente proyecto"
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
            <Icon as={TriangleAlert} size={32} strokeWidth={1.5} className="mx-auto mb-3" />
            <p>{error}</p>
          </div>
        )}

        {data && (
          <>
            {/* Header: nombre + pulso del proyecto + atajos a otros módulos */}
            <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {projectStar && (
                    <button type="button" onClick={toggleStar}
                      title={projectStar.starred ? 'Quitar de destacados' : 'Destacar proyecto'}
                      aria-label={projectStar.starred ? 'Quitar de destacados' : 'Destacar proyecto'}
                      className="-m-1 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0">
                      {projectStar.starred ? (
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-yellow-400">
                          <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L10 18.354 5.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.005z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-5 h-5 text-gray-300 dark:text-gray-600 hover:text-yellow-400">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                        </svg>
                      )}
                    </button>
                  )}
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white break-words">{data.project.name}</h1>
                </div>

                <div className="mt-2 flex items-center gap-x-4 gap-y-2 flex-wrap text-sm">
                  {totalPending === 0 ? (
                    <span className="text-gray-500 dark:text-gray-400">Sin tareas activas</span>
                  ) : (
                    <button type="button" onClick={() => goTab('tareas')} className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400">
                      <span className="font-semibold text-gray-900 dark:text-white">{totalPending}</span> tarea{totalPending !== 1 ? 's' : ''} activa{totalPending !== 1 ? 's' : ''}
                    </button>
                  )}
                  {inProgressCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                      <span className="w-2 h-2 rounded-full bg-primary-500" />{inProgressCount} en curso
                    </span>
                  )}
                  {blockedCount > 0 && (
                    <button type="button" onClick={() => goTab('tareas', { status: 'BLOCKED' })}
                      className="inline-flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400 hover:underline">
                      <span className="w-2 h-2 rounded-full bg-red-500" />{blockedCount} bloqueada{blockedCount !== 1 ? 's' : ''}
                    </button>
                  )}
                  {(data.project.members?.length ?? 0) > 0 && (
                    <button type="button" onClick={() => goTab('resumen')} title="Equipo del proyecto" className="flex items-center gap-2">
                      <AvatarStack users={data.project.members.map(pm => pm.user)} max={5} size="xs" />
                    </button>
                  )}
                  {data.project.createdAt && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      Activo desde {new Date(data.project.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: data.project.timezone || 'America/Argentina/Buenos_Aires' })}
                    </span>
                  )}
                </div>
              </div>

              {/* "+ Nueva tarea" abre el MISMO modal global que la tecla N y el botón flotante
                  (GlobalShortcuts, vía `bliss:open-add-task`): ya sabe que estamos en este
                  proyecto por `bliss:project-context`. Chat sigue solo en el botón flotante. */}
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                {marketingEnabled && (
                  <button
                    onClick={() => navigate(`/marketing?tab=hoy&projectId=${data.project.id}`)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-xl transition-colors"
                  >
                    Marketing
                  </button>
                )}
                {contenidoEnabled && (
                  <button
                    onClick={() => navigate(`/contenido?projectId=${data.project.id}`)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-xl transition-colors"
                    title="Calendario de contenido"
                  >
                    Contenido
                  </button>
                )}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('bliss:open-add-task'))}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-sm font-semibold text-white rounded-xl shadow-sm transition-colors"
                  title="Nueva tarea en este proyecto (tecla N)"
                >
                  <span className="text-base leading-none">+</span>
                  Nueva tarea
                </button>
              </div>
            </header>

            {/* Pestañas — subrayado, con scroll horizontal en mobile */}
            <nav className="mb-5 border-b border-gray-200 dark:border-gray-700" aria-label="Secciones del proyecto">
              <div className="flex gap-1 overflow-x-auto -mb-px" role="tablist">
                {tabs.map(t => {
                  const active = t.key === activeTab
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => goTab(t.key)}
                      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                        active
                          ? 'border-primary-500 text-gray-900 dark:text-white'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}
                    >
                      {t.label}
                      {t.count > 0 && (
                        <span className={`text-xs rounded-full px-1.5 py-0.5 tabular-nums ${active ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                          {t.count}
                        </span>
                      )}
                      {t.alert && <span className="w-1.5 h-1.5 rounded-full bg-red-500" aria-label="Hay tareas bloqueadas" />}
                    </button>
                  )
                })}
              </div>
            </nav>

            <div>
              {activeTab === 'resumen' && (
                <OverviewTab
                  data={data}
                  encodedId={encodedId}
                  authUser={authUser}
                  onOpenComments={setCommentTask}
                  goTab={goTab}
                  contentEnabled={contenidoEnabled && authUser?.moduleAccess?.contenido !== false}
                  calendarEnabled={calendarioEnabled && authUser?.moduleAccess?.calendario !== false}
                  onOpenTeamEdit={openTeamEdit}
                />
              )}

              {activeTab === 'tareas' && (
                <TareasTab
                  data={data}
                  onOpenComments={setCommentTask}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
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

              {activeTab === 'reuniones' && (
                <ProjectMeetings
                  projectId={data.project.id}
                  canEdit={canEditProject}
                  deepLinkMeetingId={Number(searchParams.get('meeting')) || null}
                />
              )}

              {activeTab === 'archivos' && (
                <ProjectFiles
                  projectId={data.project.id}
                  deepLinkFileId={searchParams.get('fileId')}
                  onCreateTaskFromFile={(file, link) => {
                    // El modal de nueva tarea es el global (GlobalShortcuts): ya sabe que
                    // estamos en este proyecto por `bliss:project-context`.
                    window.dispatchEvent(new CustomEvent('bliss:open-add-task', {
                      detail: { description: `Archivo: ${file.name}\n${link}` },
                    }))
                  }}
                  contenidoEnabled={contenidoEnabled}
                />
              )}

              {activeTab === 'briefs' && (
                <ProjectBriefs projectId={data.project.id} canEdit={canEditProject} />
              )}

              {activeTab === 'accesos' && (
                <AccesosTab
                  data={data}
                  encodedId={encodedId}
                  linkForm={linkForm}
                  setLinkForm={setLinkForm}
                  linkSaving={linkSaving}
                  onAddLink={handleAddLink}
                  onDeleteLink={handleDeleteLink}
                />
              )}

              {activeTab === 'horas' && (
                <ProjectReports projectId={data.project.id} />
              )}

              {activeTab === 'ajustes' && (
                <InfoTab
                  data={data}
                  setData={setData}
                  authUser={authUser}
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
            </div>
          </>
        )}
      </main>

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
