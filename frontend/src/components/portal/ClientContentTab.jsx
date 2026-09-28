import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'
import { networkLabel } from '../contenido/contentCatalog'
import ClientContentCalendar from './ClientContentCalendar'
import PieceReviewer, { ReviewComplete } from './PieceReviewer'
import { clientStatus, ClientStatusBadge } from './clientStatus'
import { Card, EmptyState, ErrorState, Icon, PrimaryButton, Segmented, SectionTitle, SkeletonList, friendlyDate, withAlpha } from './portalUi'

const API = import.meta.env.VITE_API_URL || ''

/**
 * Sección "Contenido" del portal de cliente. Tres vistas:
 *   - Para revisar: la cola de lo que espera la aprobación del cliente,
 *     ordenada por fecha de publicación (lo más urgente primero). Es la vista
 *     por defecto cuando hay algo pendiente.
 *   - Todo: el pipeline completo, agrupado por estados en lenguaje del cliente
 *     (ver clientStatus.js), con los archivados fuera.
 *   - Calendario: por fecha de publicación.
 * Cualquier pieza se abre en <PieceReviewer> (vista enfocada). Aprobar o pedir
 * cambios desde la cola avanza sola a la siguiente pieza pendiente.
 */

function sortByDate(a, b) {
  if (a.scheduledDate && b.scheduledDate) return a.scheduledDate.localeCompare(b.scheduledDate)
  if (a.scheduledDate) return -1
  if (b.scheduledDate) return 1
  return new Date(b.updatedAt) - new Date(a.updatedAt)
}

function Thumb({ piece, size = 'w-14 h-14' }) {
  const a = (piece.assets || [])[0]
  const src = !a || a.kind === 'link' ? null : (a.kind === 'video' ? a.posterUrl : a.url)
  return (
    <div className={`${size} rounded-xl overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center text-gray-400 relative`}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
        : <Icon name={a?.kind === 'link' ? 'link' : 'content'} className="w-5 h-5" />}
      {a?.kind === 'video' && (
        <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
          <Icon name="play" className="w-2.5 h-2.5" />
        </span>
      )}
    </div>
  )
}

function PieceRow({ piece, onOpen, brandPrimary, highlight, showStatus = false }) {
  const networks = (piece.networks || []).slice(0, 3).map(networkLabel).join(' · ')
  return (
    <button type="button" onClick={() => onOpen(piece)}
      className="w-full flex items-center gap-3.5 px-3 py-3 sm:px-4 text-left hover:bg-gray-50 transition-colors group">
      <Thumb piece={piece} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{piece.title}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          {piece.scheduledDate ? friendlyDate(piece.scheduledDate) : 'Sin fecha'}
          {networks && <> · {networks}</>}
        </p>
        {showStatus && !highlight && <ClientStatusBadge status={piece.status} className="mt-1.5" />}
      </div>
      {highlight ? (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
          style={{ backgroundColor: withAlpha(brandPrimary, 0.12), color: brandPrimary }}>
          Revisar <Icon name="chevronRight" className="w-3.5 h-3.5" />
        </span>
      ) : (
        <Icon name="chevronRight" className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0" />
      )}
    </button>
  )
}

export const QUEUE_START = '__queue__'

export default function ClientContentTab({ slug, token, requireReauth, brandPrimary, viewerCanApprove = true, initialPieceId, onInitialPieceConsumed, onPendingChange }) {
  const [pieces,  setPieces]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [view,    setView]    = useState(null) // null hasta la primera carga: se decide según haya pendientes
  // Revisor abierto: { id, queue: [ids], fromReview: bool }
  const [reviewing, setReviewing] = useState(null)
  const [finished,  setFinished]  = useState(false)

  const reload = useCallback(() => {
    setLoading(true); setError(null)
    axios.get(`${API}/api/public/client-portal/${slug}/content`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const list = r.data.pieces || []
        setPieces(list)
        setView(v => v || (list.some(p => p.canDecide) ? 'review' : 'all'))
        // Entrada directa desde Inicio o un link (?piece=). Si la pieza está
        // pendiente, se abre en modo cola (recorre todas las pendientes);
        // QUEUE_START abre la primera pendiente.
        if (initialPieceId) {
          const queue = list.filter(p => p.canDecide).sort(sortByDate)
          const target = initialPieceId === QUEUE_START ? queue[0] : list.find(p => String(p.id) === String(initialPieceId))
          if (target?.canDecide) setReviewing({ id: target.id, queue: queue.map(p => p.id), fromReview: true })
          else if (target) setReviewing({ id: target.id, queue: [target.id], fromReview: false })
          onInitialPieceConsumed?.()
        }
      })
      .catch(err => {
        if (err.response?.status === 401) requireReauth()
        else setError(err.response?.data?.error || 'No se pudo cargar el contenido')
      })
      .finally(() => setLoading(false))
    // initialPieceId solo aplica a la primera carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token, requireReauth])

  useEffect(() => { reload() }, [reload])

  const pending = useMemo(() => pieces.filter(p => p.canDecide).sort(sortByDate), [pieces])
  useEffect(() => { onPendingChange?.(pending.length) }, [pending.length, onPendingChange])

  const groups = useMemo(() => {
    const byKey = {}
    for (const p of pieces) {
      const g = clientStatus(p.status)
      if (g.key === 'archived' || g.key === 'review') continue
      ;(byKey[g.key] ??= { group: g, items: [] }).items.push(p)
    }
    return Object.values(byKey)
      .sort((a, b) => a.group.order - b.group.order)
      .map(x => ({ ...x, items: x.items.sort(sortByDate) }))
  }, [pieces])

  function handlePieceChanged(updated) {
    setPieces(prev => prev.map(p => (p.id === updated.id ? updated : p)))
  }

  function openPiece(piece, list, fromReview = false) {
    setReviewing({ id: piece.id, queue: list.map(p => p.id), fromReview })
  }

  function handleDecided(updated) {
    if (!reviewing?.fromReview) return
    // Siguiente pieza TODAVÍA pendiente de la cola, empezando después de la actual.
    const stillPending = new Set(pieces.filter(p => p.canDecide && p.id !== updated.id).map(p => p.id))
    const idx = reviewing.queue.indexOf(updated.id)
    const ordered = [...reviewing.queue.slice(idx + 1), ...reviewing.queue.slice(0, idx)]
    const next = ordered.find(id => stillPending.has(id))
    // Pequeña pausa para que se lea el toast antes de cambiar de pieza.
    setTimeout(() => {
      if (next) setReviewing(r => ({ ...r, id: next }))
      else { setReviewing(null); setFinished(true); setView('all') }
    }, 450)
  }

  if (loading && pieces.length === 0) return <Card className="p-5"><SkeletonList rows={4} /></Card>
  if (error) return <Card><ErrorState message={error} onRetry={reload} /></Card>

  const current = reviewing ? pieces.find(p => p.id === reviewing.id) : null
  const qIdx = reviewing ? reviewing.queue.indexOf(reviewing.id) : -1
  const goTo = id => setReviewing(r => ({ ...r, id }))

  const visible = pieces.filter(p => clientStatus(p.status).key !== 'archived')

  return (
    <div>
      <SectionTitle
        title="Contenido"
        subtitle={pending.length > 0
          ? `Tenés ${pending.length} ${pending.length === 1 ? 'pieza' : 'piezas'} esperando tu aprobación`
          : 'Todo lo que estamos preparando para tus redes'}
        action={pending.length > 1 && view === 'review' && (
          <PrimaryButton brandPrimary={brandPrimary} onClick={() => openPiece(pending[0], pending, true)} className="hidden sm:inline-flex">
            Revisar todo
          </PrimaryButton>
        )}
      />

      <Segmented
        className="mb-4"
        brandPrimary={brandPrimary}
        value={view}
        onChange={setView}
        options={[
          { key: 'review', label: 'Para revisar', count: pending.length },
          { key: 'all', label: 'Todo el contenido' },
          { key: 'calendar', label: 'Calendario' },
        ]}
      />

      {pieces.length === 0 ? (
        <Card><EmptyState icon="content" title="Todavía no hay contenido">Cuando el equipo cargue las primeras piezas, las vas a ver acá.</EmptyState></Card>
      ) : view === 'review' ? (
        pending.length === 0 ? (
          <Card>
            <EmptyState icon="checkCircle" title="Estás al día"
              action={<button type="button" onClick={() => setView('all')} className="text-sm font-semibold" style={{ color: brandPrimary }}>Ver todo el contenido</button>}>
              No hay piezas esperando tu aprobación. Te avisamos por email cuando haya algo nuevo.
            </EmptyState>
          </Card>
        ) : (
          <Card className="divide-y divide-gray-100 overflow-hidden">
            {pending.map(p => <PieceRow key={p.id} piece={p} highlight brandPrimary={brandPrimary} onOpen={x => openPiece(x, pending, true)} />)}
          </Card>
        )
      ) : view === 'all' ? (
        groups.length === 0 ? (
          <Card><EmptyState icon="content" title="Nada más por ahora">Todo el contenido activo está en «Para revisar».</EmptyState></Card>
        ) : (
          <div className="space-y-5">
            {groups.map(({ group, items }) => (
              <div key={group.key}>
                <p className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                  <span className={`w-2 h-2 rounded-full ${group.dot}`} /> {group.label}
                  <span className="text-gray-400 font-medium normal-case tracking-normal">· {items.length}</span>
                </p>
                <Card className="divide-y divide-gray-100 overflow-hidden">
                  {items.map(p => <PieceRow key={p.id} piece={p} brandPrimary={brandPrimary} onOpen={x => openPiece(x, items)} />)}
                </Card>
              </div>
            ))}
          </div>
        )
      ) : (
        <Card className="p-3 sm:p-4">
          <ClientContentCalendar pieces={visible} brandPrimary={brandPrimary} onOpen={p => openPiece(p, [p])} />
        </Card>
      )}

      {current && (
        <PieceReviewer
          key={reviewing.fromReview ? 'queue' : current.id}
          slug={slug} token={token} requireReauth={requireReauth}
          piece={current} brandPrimary={brandPrimary} viewerCanApprove={viewerCanApprove}
          position={qIdx + 1} total={reviewing.queue.length}
          onPrev={qIdx > 0 ? () => goTo(reviewing.queue[qIdx - 1]) : null}
          onNext={qIdx < reviewing.queue.length - 1 ? () => goTo(reviewing.queue[qIdx + 1]) : null}
          onClose={() => setReviewing(null)}
          onChanged={handlePieceChanged}
          onDecided={handleDecided}
        />
      )}
      {finished && <ReviewComplete brandPrimary={brandPrimary} onClose={() => setFinished(false)} />}
    </div>
  )
}
