import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import ProjectSearchSelect from '../components/marketing/ProjectSearchSelect'
import ContentFilters from '../components/contenido/ContentFilters'
import ContentTableView from '../components/contenido/ContentTableView'
import useContentPieces from '../components/contenido/useContentPieces'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

// Vistas del calendario de contenido. Igual que Marketing.jsx, el estado de
// navegación vive 100% en la URL (?view=&projectId=&month=&piece=…): así los
// deep-links de notificaciones y emails funcionan sin estado extra y sobreviven
// a un refresh.
const VIEWS = [
  { id: 'calendario', label: '📅 Calendario' },
  { id: 'tabla',      label: '📋 Tabla' },
  { id: 'kanban',     label: '🗂 Kanban' },
]
const VALID_VIEWS = new Set(VIEWS.map(v => v.id))

// Vista por defecto. Pasa a 'calendario' cuando esa vista esté implementada (F2);
// hasta entonces la tabla es la única que muestra algo útil.
const DEFAULT_VIEW = 'tabla'

function Placeholder({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-3xl mb-4">🚧</div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">{label} — en construcción</h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">Esta vista está en desarrollo.</p>
    </div>
  )
}

export default function Contenido() {
  const { enabled, loading: flagLoading } = useFeatureFlag('contenido')
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [projects,  setProjects]  = useState([])
  const [projectId, setProjectId] = useState(searchParams.get('projectId') ?? '')
  const [filters,   setFilters]   = useState({ status: '', network: '', ownerId: '', q: '' })

  useEffect(() => {
    api.get('/projects').then(r => setProjects(r.data)).catch(() => {})
  }, [])

  const rawView = searchParams.get('view')
  const view = VALID_VIEWS.has(rawView) ? rawView : DEFAULT_VIEW

  const { pieces, members, total, loading, error, setError, create, update, remove } =
    useContentPieces(projectId, filters)

  // Espejo exacto de canWrite() del backend: admin/owner del workspace, o
  // miembro del equipo del proyecto.
  const canEdit = useMemo(() => {
    if (user?.isAdmin) return true
    const project = projects.find(p => String(p.id) === String(projectId))
    return (project?.members ?? []).some(pm => pm.user?.id === user?.id)
  }, [user, projects, projectId])

  function patchParams(patch) {
    setSearchParams(prev => {
      const p = Object.fromEntries(prev.entries())
      for (const [k, v] of Object.entries(patch)) {
        if (v) p[k] = v
        else delete p[k]
      }
      return p
    }, { replace: true })
  }

  function handleProjectChange(id) {
    setProjectId(id)
    patchParams({ projectId: id })
  }

  // El modal de detalle llega en F2; por ahora el click al título no hace nada.
  const handleOpenPiece = useCallback(() => {}, [])

  function renderContent() {
    if (!projectId) {
      return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <div className="text-4xl mb-4">📅</div>
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Elegí un proyecto</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
            El calendario de contenido se organiza por proyecto. Seleccioná uno arriba para ver o planificar sus piezas.
          </p>
        </div>
      )
    }

    return (
      <>
        <ContentFilters value={filters} onChange={setFilters} members={members} total={total} />

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center justify-between gap-3">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-sm shrink-0">✕</button>
          </div>
        )}

        {loading && pieces.length === 0
          ? <div className="py-16"><LoadingSpinner size="lg" /></div>
          : view === 'tabla'
            ? (
              <ContentTableView
                pieces={pieces}
                members={members}
                loading={loading}
                canEdit={canEdit}
                onCreate={create}
                onUpdate={update}
                onDelete={remove}
                onOpen={handleOpenPiece}
              />
            )
            : <Placeholder label={VIEWS.find(v => v.id === view)?.label ?? view} />
        }
      </>
    )
  }

  if (flagLoading) return <LoadingSpinner size="lg" fullPage />

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contenido</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Calendario de piezas, producción y aprobación del cliente
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-64">
                <ProjectSearchSelect
                  projects={projects}
                  value={projectId}
                  onChange={handleProjectChange}
                  placeholder="Elegí un proyecto…"
                />
              </div>
              {projectId && (
                <button
                  onClick={() => handleProjectChange('')}
                  title="Quitar el filtro de proyecto"
                  className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
            {projectId && (
              <Link
                to={`/my-projects/${projectId}`}
                className="self-start text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
              >
                Ir al proyecto →
              </Link>
            )}
          </div>
        </div>

        {!enabled ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Sección no disponible</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
              Esta sección está siendo activada gradualmente. Si querés acceso anticipado, contactá al equipo de BlissTracker.
            </p>
          </div>
        ) : (
          <>
            {/* ── Selector de vista — desktop ── */}
            <div className="hidden sm:flex gap-1 mb-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1">
              {VIEWS.map(v => (
                <button
                  key={v.id}
                  onClick={() => patchParams({ view: v.id })}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    view === v.id
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            {/* ── Selector de vista — mobile ── */}
            <select
              value={view}
              onChange={e => patchParams({ view: e.target.value })}
              className="sm:hidden w-full mb-4 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
            >
              {VIEWS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>

            {renderContent()}
          </>
        )}
      </main>
    </div>
  )
}
