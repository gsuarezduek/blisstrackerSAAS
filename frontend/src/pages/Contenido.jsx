import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import HowToButton from '../components/HowToButton'
import ProjectSearchSelect from '../components/marketing/ProjectSearchSelect'
import ContentFilters from '../components/contenido/ContentFilters'
import ContentTableView from '../components/contenido/ContentTableView'
import ContentKanbanView from '../components/contenido/ContentKanbanView'
import ContentCalendarView, { currentMonthStr } from '../components/contenido/ContentCalendarView'
import ContentPieceModal from '../components/contenido/ContentPieceModal'
import useContentPieces from '../components/contenido/useContentPieces'
import useContentSocket from '../components/contenido/useContentSocket'
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
const MONTH_RE = /^\d{4}-\d{2}$/

// Rango [primer día, último día] del mes, para acotar el fetch al mes visible
// en la vista Calendario (mismos query params from/to que ya soporta el backend).
function monthBoundsOf(month) {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
}

export default function Contenido() {
  const { enabled, loading: flagLoading } = useFeatureFlag('contenido')
  const { user } = useAuth()
  const moduleAllowed = enabled && !!user?.moduleAccess?.contenido
  const [searchParams, setSearchParams] = useSearchParams()
  const [projects,  setProjects]  = useState([])
  const [projectId, setProjectId] = useState(searchParams.get('projectId') ?? '')
  const [filters,   setFilters]   = useState({ status: '', network: '', ownerId: '', q: '', scheduledMonth: '' })
  const [summary,   setSummary]   = useState(null) // { byStatus, total, awaitingClient } — GET /summary
  const [requestingApproval, setRequestingApproval] = useState(false)
  const [approvalMsg, setApprovalMsg] = useState(null) // { type: 'success'|'error', text }

  useEffect(() => {
    api.get('/projects').then(r => setProjects(r.data)).catch(() => {})
  }, [])

  const rawView = searchParams.get('view')
  const view = VALID_VIEWS.has(rawView) ? rawView : 'tabla'

  const rawMonth = searchParams.get('month')
  const month = MONTH_RE.test(rawMonth || '') ? rawMonth : currentMonthStr()

  const pieceId = searchParams.get('piece')

  // Traduce el filtro de mes de la Tabla/Kanban (`scheduledMonth`) a los query
  // params que ya entiende el backend: un mes concreto → rango from/to; "none" →
  // noDate=1 (piezas sin fecha, ej. todavía en Idea); vacío → sin filtrar.
  function scheduledMonthParams(scheduledMonth) {
    if (!scheduledMonth) return {}
    if (scheduledMonth === 'none') return { noDate: '1' }
    return monthBoundsOf(scheduledMonth)
  }

  // El Calendario acota el fetch al mes navegado (ignora `scheduledMonth`: ahí
  // la navegación de mes ya cumple ese rol); la Tabla y el Kanban usan el filtro
  // de mes elegido, si hay uno.
  const effectiveFilters = useMemo(() => {
    const { scheduledMonth, ...rest } = filters
    return view === 'calendario'
      ? { ...rest, ...monthBoundsOf(month) }
      : { ...rest, ...scheduledMonthParams(scheduledMonth) }
  }, [view, month, filters])

  const { pieces, members, total, loading, error, setError, reload, create, update, move, remove } =
    useContentPieces(projectId, effectiveFilters)

  // Cualquier pieza creada/editada/movida/borrada por otra persona (u otra
  // pestaña propia) reprograma un reload — debounced para que una racha de
  // eventos (ej. varios assets confirmándose seguidos) no dispare N fetches.
  const reloadTimer = useRef(null)
  const scheduleReload = useCallback(() => {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(reload, 300)
  }, [reload])
  useEffect(() => () => clearTimeout(reloadTimer.current), [])

  useContentSocket(projectId, {
    onPieceCreated: scheduleReload,
    onPieceUpdated: scheduleReload,
    onPieceDeleted: scheduleReload,
  })

  const openPiece = useMemo(() => pieces.find(p => String(p.id) === String(pieceId)) ?? null, [pieces, pieceId])

  // Conteo por estado (incluye `awaitingClient`, el badge del botón "Pedir
  // aprobación"). Independiente de `filters`/`view` — siempre refleja TODAS las
  // piezas del proyecto, no solo las que la vista actual tiene cargadas.
  useEffect(() => {
    setApprovalMsg(null)
    if (!projectId) { setSummary(null); return }
    let cancelled = false
    api.get(`/contenido/projects/${projectId}/summary`).then(r => { if (!cancelled) setSummary(r.data) }).catch(() => {})
    return () => { cancelled = true }
  }, [projectId, pieces])

  async function handleRequestApproval() {
    if (!projectId || requestingApproval) return
    setRequestingApproval(true)
    setApprovalMsg(null)
    try {
      const { data } = await api.post(`/contenido/projects/${projectId}/request-approval`)
      setApprovalMsg({
        type: 'success',
        text: `Avisamos a ${data.sent} contacto${data.sent === 1 ? '' : 's'} sobre ${data.pieces} pieza${data.pieces === 1 ? '' : 's'}.`,
      })
    } catch (err) {
      setApprovalMsg({ type: 'error', text: err.response?.data?.error || 'No se pudo enviar el aviso' })
    } finally {
      setRequestingApproval(false)
    }
  }

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

  function handleDelete(id) {
    if (String(pieceId) === String(id)) patchParams({ piece: '' })
    return remove(id)
  }

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
        {view !== 'calendario' && (
          <ContentFilters projectId={projectId} value={filters} onChange={setFilters} members={members} total={total} />
        )}

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center justify-between gap-3">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-sm shrink-0">✕</button>
          </div>
        )}

        {loading && pieces.length === 0 ? (
          <div className="py-16"><LoadingSpinner size="lg" /></div>
        ) : view === 'tabla' ? (
          <ContentTableView
            pieces={pieces}
            members={members}
            loading={loading}
            canEdit={canEdit}
            onCreate={create}
            onUpdate={update}
            onDelete={handleDelete}
            onOpen={p => patchParams({ piece: p.id })}
          />
        ) : view === 'kanban' ? (
          <ContentKanbanView
            pieces={pieces}
            canEdit={canEdit}
            onMove={move}
            onOpen={p => patchParams({ piece: p.id })}
          />
        ) : (
          <ContentCalendarView
            pieces={pieces}
            month={month}
            onMonthChange={m => patchParams({ month: m })}
            canEdit={canEdit}
            onUpdate={update}
            onOpen={p => patchParams({ piece: p.id })}
          />
        )}
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
            <div className="flex items-center gap-1.5">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contenido</h1>
              <HowToButton topic="contenido.calendario" />
            </div>
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

        {!moduleAllowed ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Sección no disponible</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
              {enabled
                ? 'No tenés acceso a esta sección. Consultá con un administrador.'
                : 'Esta sección está siendo activada gradualmente. Si querés acceso anticipado, contactá al equipo de BlissTracker.'}
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

            {projectId && canEdit && (
              <div className="mb-4 flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleRequestApproval}
                  disabled={requestingApproval || !summary?.awaitingClient}
                  title={!summary?.awaitingClient
                    ? 'No hay piezas esperando aprobación'
                    : 'Avisa por email a los contactos del portal que pueden aprobar'}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors inline-flex items-center gap-1.5"
                >
                  📨 {requestingApproval ? 'Enviando…' : 'Pedir aprobación'}
                  {summary?.awaitingClient ? ` (${summary.awaitingClient})` : ''}
                </button>
                {approvalMsg && (
                  <span className={`text-xs font-medium ${
                    approvalMsg.type === 'success'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'}`}
                  >
                    {approvalMsg.text}
                  </span>
                )}
              </div>
            )}

            {renderContent()}
          </>
        )}
      </main>

      {openPiece && (
        <ContentPieceModal
          piece={openPiece}
          members={members}
          canEdit={canEdit}
          currentUserId={user?.id}
          isAdmin={user?.isAdmin}
          onUpdate={update}
          onDelete={handleDelete}
          onPieceChanged={reload}
          onClose={() => patchParams({ piece: '' })}
        />
      )}
    </div>
  )
}
