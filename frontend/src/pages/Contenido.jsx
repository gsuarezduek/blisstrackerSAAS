import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import HowToButton from '../components/HowToButton'
import ProjectSearchSelect from '../components/marketing/ProjectSearchSelect'
import ContentFilters from '../components/contenido/ContentFilters'
import ContentMonthTabs from '../components/contenido/ContentMonthTabs'
import ContentTableView from '../components/contenido/ContentTableView'
import ContentKanbanView from '../components/contenido/ContentKanbanView'
import ContentCalendarView, { currentMonthStr } from '../components/contenido/ContentCalendarView'
import ContentPieceModal from '../components/contenido/ContentPieceModal'
import ContentTrashModal from '../components/contenido/ContentTrashModal'
import ConfirmModal from '../components/ConfirmModal'
import useContentPieces from '../components/contenido/useContentPieces'
import useContentSocket from '../components/contenido/useContentSocket'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { OPEN_STATUSES } from '../components/contenido/contentCatalog'
import { CalendarDays, Lock, X } from 'lucide-react'
import { Icon } from '../components/ui/Icon'

// Vistas del calendario de contenido. Igual que Marketing.jsx, el estado de
// navegación vive 100% en la URL (?view=&projectId=&month=&piece=…): así los
// deep-links de notificaciones y emails funcionan sin estado extra y sobreviven
// a un refresh.
const VIEWS = [
  { id: 'calendario', label: 'Calendario' },
  { id: 'tabla',      label: 'Tabla' },
  { id: 'kanban',     label: 'Kanban' },
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
  const [filters,   setFilters]   = useState({ status: '', network: '', ownerId: '', q: '' })
  const [summary,   setSummary]   = useState(null) // { byStatus, total, awaitingClient } — GET /summary
  const [requestingApproval, setRequestingApproval] = useState(false)
  const [approvalMsg, setApprovalMsg] = useState(null) // { type: 'success'|'error', text }
  const [trashOpen, setTrashOpen] = useState(false)

  useEffect(() => {
    // Proyectos privados ajenos (locked) afuera del selector: el backend igual
    // bloquearía todo lo demás, pero así no aparece como una opción muerta.
    api.get('/projects').then(r => setProjects(r.data.filter(p => !p.locked))).catch(() => {})
  }, [])

  const rawView = searchParams.get('view')
  const view = VALID_VIEWS.has(rawView) ? rawView : 'tabla'

  // Mes activo, compartido por las pestañas de la Tabla y la navegación ‹ › del
  // Calendario — una sola noción en la URL, así cambiar de vista lo conserva.
  // 'none' = pestaña "Sin programar" (piezas sin fecha todavía, ej. ideas).
  const rawMonth = searchParams.get('month')
  const month = rawMonth === 'none' ? 'none' : (MONTH_RE.test(rawMonth || '') ? rawMonth : currentMonthStr())
  // El Calendario necesita un mes real: "Sin programar" no es una grilla.
  const calendarMonth = month === 'none' ? currentMonthStr() : month

  const pieceId = searchParams.get('piece')

  // La Tabla y el Calendario se acotan al mes activo; el Kanban, no (ver abajo).
  // Sin filtro de estado el backend devuelve todo lo vivo del mes, publicadas
  // incluidas — el recorte de la vista es el mes, no el estado.
  const effectiveFilters = useMemo(() => {
    // `take` explícito: el backend corta en 50 por default y el frontend no
    // pagina. Con la vista acotada a un mes 200 es holgado; si aun así sobrara,
    // se avisa debajo de la tabla en vez de perder piezas en silencio.
    const base = { ...filters, take: 200 }
    if (view === 'kanban') {
      // El Kanban es el pipeline de producción y cruza meses (una pieza de
      // noviembre se produce en octubre), así que acotarlo al mes lo rompería.
      // Pide los estados abiertos explícitamente: son sus únicas columnas, y sin
      // esto el tope de piezas se gastaría en publicadas que no tiene dónde
      // mostrar.
      return { ...base, status: filters.status || OPEN_STATUSES.map(s => s.key).join(',') }
    }
    if (view === 'calendario') return { ...base, ...monthBoundsOf(calendarMonth) }
    if (month === 'none')      return { ...base, noDate: '1' }
    return { ...base, ...monthBoundsOf(month) }
  }, [view, month, calendarMonth, filters])

  const { pieces, members, clientContacts, total, loading, error, setError, reload, create, update, move, star, remove } =
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
    // Un comentario nuevo (del cliente o del equipo) puede cambiar el
    // "último mensaje del cliente" que la Tabla muestra debajo del título
    // (ver ContentTableView) — no viaja en `content:piece:updated`, así que
    // sin este handler quedaba desactualizado hasta el próximo reload manual.
    onCommentNew: scheduleReload,
  })

  // Una pieza puede abrirse (?piece=id) sin estar en `pieces` — ej. un deep-link
  // (notificación/email) a una pieza que no matchea los filtros/mes activos.
  // `fetchedPiece` cubre ese caso; se limpia solo apenas la pieza vuelve a
  // aparecer en `pieces` o se cierra el modal.
  const [fetchedPiece, setFetchedPiece] = useState(null)
  const pieceInList = useMemo(() => pieces.some(p => String(p.id) === String(pieceId)), [pieces, pieceId])

  const refetchPiece = useCallback(() => {
    if (!projectId || !pieceId) { setFetchedPiece(null); return }
    api.get(`/contenido/projects/${projectId}/pieces/${pieceId}`)
      .then(r => setFetchedPiece(r.data))
      .catch(() => setFetchedPiece(null))
  }, [projectId, pieceId])

  useEffect(() => {
    if (!pieceId || pieceInList) { setFetchedPiece(null); return }
    refetchPiece()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId, pieceInList, projectId])

  const openPiece = useMemo(() => pieces.find(p => String(p.id) === String(pieceId)) ?? fetchedPiece, [pieces, pieceId, fetchedPiece])

  // Espejo de `update`/`reload` del hook, pero para una pieza traída aparte
  // (fuera de `pieces`): pegarle directo al PATCH/GET puntual en vez de tocar
  // una lista que no la contiene. Un cambio de `status` puede sacar o meter la
  // pieza de la vista activa (pasar a/desde 'archivado', o salir de los estados
  // abiertos que pide el Kanban) — se recarga la lista además del update
  // puntual, así no queda un row obsoleto hasta el próximo refresh manual.
  async function handleModalUpdate(id, patch) {
    if (pieceInList) {
      const result = await update(id, patch)
      if (patch.status !== undefined) reload()
      return result
    }
    const { data } = await api.patch(`/contenido/projects/${projectId}/pieces/${id}`, patch)
    setFetchedPiece(data)
    if (patch.status !== undefined) reload()
    return data
  }

  // Espejo de handleModalUpdate para el toggle de estrella — misma razón: la
  // pieza abierta en el modal puede venir de `fetchedPiece` (deep-link fuera de
  // los filtros activos), no de `pieces`.
  async function handleModalStar(id) {
    if (pieceInList) return star(id)
    const { data } = await api.patch(`/contenido/projects/${projectId}/pieces/${id}/star`)
    setFetchedPiece(data)
    return data
  }

  function handleModalPieceChanged() {
    if (pieceInList) reload()
    else refetchPiece()
  }

  // Una pieza real pasa por varios responsables/tramos de trabajo a lo largo de
  // su vida (CM arma el copy → diseñador arma el reel → CM revisa → CM publica):
  // cada vez que se le asigna un responsable del EQUIPO y el tramo actual ya
  // terminó (o nunca existió), se ofrece (opcional, no bloqueante) crear ya el
  // tramo nuevo en su dashboard. Asignar al cliente (ownerContactId) queda
  // afuera a propósito: el cliente no es un User, no se le puede crear una Task
  // interna. Si el tramo actual sigue EN CURSO, el backend rechaza con 409 (hay
  // que pausarlo/completarlo primero) — ese error se muestra dentro del propio
  // modal en vez de cerrarlo en silencio.
  const [dashboardPrompt, setDashboardPrompt] = useState(null) // { pieceId, projectId, ownerName }
  const [sendingPrompt, setSendingPrompt] = useState(false)
  const [dashboardPromptError, setDashboardPromptError] = useState(null)

  function findPieceById(id) {
    return pieces.find(p => String(p.id) === String(id))
      ?? (openPiece && String(openPiece.id) === String(id) ? openPiece : null)
  }

  async function updateAndMaybePromptDashboard(id, patch, updateFn) {
    const before = findPieceById(id)
    const result = await updateFn(id, patch)
    const tramoLibre = !before?.currentTask || before.currentTask.status === 'COMPLETED'
    if (
      patch.ownerId !== undefined && patch.ownerId !== null &&
      before && tramoLibre && before.owner?.id !== patch.ownerId
    ) {
      const member = members.find(m => m.id === patch.ownerId)
      setDashboardPromptError(null)
      setDashboardPrompt({ pieceId: id, projectId: before.projectId, ownerName: member?.name ?? 'el responsable' })
    }
    return result
  }

  async function handleConfirmDashboardPrompt() {
    if (!dashboardPrompt) return
    setSendingPrompt(true)
    setDashboardPromptError(null)
    try {
      await api.post(`/contenido/projects/${dashboardPrompt.projectId}/pieces/${dashboardPrompt.pieceId}/send-to-dashboard`)
      setDashboardPrompt(null)
      if (pieceInList || String(pieceId) === String(dashboardPrompt.pieceId)) reload()
      if (String(pieceId) === String(dashboardPrompt.pieceId) && !pieceInList) refetchPiece()
    } catch (err) {
      // Se deja el modal abierto (ej. 409 porque el tramo anterior sigue en
      // curso) para que se vea el motivo, en vez de perderlo al cerrarlo solo.
      setDashboardPromptError(err.response?.data?.error || 'No se pudo enviar al dashboard')
    } finally {
      setSendingPrompt(false)
    }
  }

  // Una pieza nueva nace en el mes que estás mirando: con la Tabla acotada al
  // mes, crearla sin fecha la haría desaparecer de la vista en el próximo reload
  // — el mismo "desaparece sola" que se vino a corregir. Cae hoy si el mes
  // activo es el actual, y el día 1 si estás planificando otro mes (editable
  // después, como cualquier fecha). En "Sin programar" nace sin fecha, que es
  // justamente lo que esa pestaña junta.
  const createInActiveMonth = useCallback((payload) => {
    if (payload.scheduledAt || month === 'none') return create(payload)
    const [y, m] = month.split('-').map(Number)
    const day = month === currentMonthStr() ? new Date().getDate() : 1
    return create({ ...payload, scheduledAt: new Date(y, m - 1, day, 12, 0).toISOString() })
  }, [create, month])

  // Las pestañas de mes se recargan cuando cambia la distribución por fecha de
  // lo que está cargado: alcanza para cubrir crear/borrar una pieza y moverla de
  // mes (que no cambia el total y por eso no se puede derivar de `summary`).
  const monthsSignature = useMemo(() => pieces.map(p => p.scheduledDate ?? 'none').join(','), [pieces])

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
      const who = (data.contacts || []).map(c => (c.name?.trim() ? `${c.name} (${c.email})` : c.email)).join(', ')
      setApprovalMsg({
        type: 'success',
        text: who
          ? `Se pidió aprobación a ${who} sobre ${data.pieces} pieza${data.pieces === 1 ? '' : 's'}.`
          : `Avisamos a ${data.sent} contacto${data.sent === 1 ? '' : 's'} sobre ${data.pieces} pieza${data.pieces === 1 ? '' : 's'}.`,
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
          <div className="mb-4"><Icon as={CalendarDays} size={32} className="inline-block text-gray-300 dark:text-gray-600" /></div>
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Elegí un proyecto</h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
            El calendario de contenido se organiza por proyecto. Seleccioná uno arriba para ver o planificar sus piezas.
          </p>
        </div>
      )
    }

    return (
      <>
        {/* Las pestañas de mes son la navegación primaria de la Tabla. El
            Calendario navega con sus propias ‹ › sobre el MISMO `month`; el
            Kanban es global (ver effectiveFilters), así que no las lleva. */}
        {view === 'tabla' && (
          <ContentMonthTabs
            projectId={projectId}
            month={month}
            onChange={m => patchParams({ month: m })}
            refreshKey={monthsSignature}
          />
        )}

        {view !== 'calendario' && (
          <ContentFilters value={filters} onChange={setFilters} members={members} total={total} />
        )}

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center justify-between gap-3">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-sm shrink-0"><Icon as={X} size={16} /></button>
          </div>
        )}

        {loading && pieces.length === 0 ? (
          <div className="py-16"><LoadingSpinner size="lg" /></div>
        ) : view === 'tabla' ? (
          <>
            <ContentTableView
              pieces={pieces}
              members={members}
              clientContacts={clientContacts}
              loading={loading}
              canEdit={canEdit}
              onCreate={createInActiveMonth}
              onUpdate={(id, patch) => updateAndMaybePromptDashboard(id, patch, update)}
              onStar={star}
              onDelete={handleDelete}
              onOpen={p => patchParams({ piece: p.id })}
            />
            {total > pieces.length && (
              <p className="mt-2 px-1 text-xs text-amber-600 dark:text-amber-400">
                Mostrando {pieces.length} de {total} piezas. Usá la búsqueda o los filtros para acotar.
              </p>
            )}
          </>
        ) : view === 'kanban' ? (
          <>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 px-1">
              El Kanban muestra el pipeline completo, de todos los meses — una pieza de noviembre se produce en octubre.
              Lo publicado y lo archivado se ve en la Tabla, en su mes.
            </p>
            <ContentKanbanView
              pieces={pieces}
              canEdit={canEdit}
              onMove={move}
              onStar={star}
              onOpen={p => patchParams({ piece: p.id })}
            />
          </>
        ) : (
          <ContentCalendarView
            pieces={pieces}
            month={calendarMonth}
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
                  <Icon as={X} size={16} />
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
            <div className="mb-4"><Icon as={Lock} size={32} className="inline-block text-gray-300 dark:text-gray-600" /></div>
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
                  {requestingApproval ? 'Enviando…' : 'Pedir aprobación'}
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
                <button
                  onClick={() => setTrashOpen(true)}
                  title="Piezas eliminadas, recuperables durante 30 días"
                  className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors inline-flex items-center gap-1.5"
                >
                  Papelera
                </button>
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
          clientContacts={clientContacts}
          canEdit={canEdit}
          currentUserId={user?.id}
          isAdmin={user?.isAdmin}
          onUpdate={(id, patch) => updateAndMaybePromptDashboard(id, patch, handleModalUpdate)}
          onStar={handleModalStar}
          onDelete={handleDelete}
          onPieceChanged={handleModalPieceChanged}
          onClose={() => patchParams({ piece: '' })}
        />
      )}

      {trashOpen && (
        <ContentTrashModal
          projectId={projectId}
          isAdmin={user?.isAdmin}
          onClose={() => setTrashOpen(false)}
          onRestored={reload}
        />
      )}

      <ConfirmModal
        open={!!dashboardPrompt}
        title="Enviar al dashboard"
        message={
          dashboardPromptError
            ? dashboardPromptError
            : dashboardPrompt ? `¿Querés crear ya la tarea para que ${dashboardPrompt.ownerName} la vea en su dashboard?` : ''
        }
        confirmLabel={dashboardPromptError ? 'Reintentar' : 'Enviar'}
        cancelLabel={dashboardPromptError ? 'Cerrar' : 'Ahora no'}
        danger={false}
        loading={sendingPrompt}
        onConfirm={handleConfirmDashboardPrompt}
        onCancel={() => { setDashboardPrompt(null); setDashboardPromptError(null) }}
      />
    </div>
  )
}
