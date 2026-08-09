import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { fmtMoney } from './StatusBadge'
import LostReasonModal from './LostReasonModal'
import { LEAD_STATUSES, STATUS_BADGE, statusMeta } from './salesCatalog'

function ScrollArrow({ side, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Ver columnas anteriores' : 'Ver columnas siguientes'}
      className={`w-8 h-8 flex items-center justify-center rounded-full border shadow-sm transition-colors ${
        disabled
          ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-default shadow-none'
          : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-primary-100 hover:text-primary-700 hover:border-primary-300 dark:hover:bg-primary-900/40 dark:hover:text-primary-300'
      }`}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={side === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  )
}

// Pipeline Kanban: una columna por estado, arrastrar una card cambia el estado del lead
// (PATCH /ventas/leads/:id/status). Drag & drop nativo (sin dependencias).
export default function PipelineTab({ onOpenLead }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  // El pipeline solo muestra leads activos (no archivados) por default; "Ver
  // archivados" reemplaza la vista por un listado simple de los archivados.
  const [showArchived, setShowArchived] = useState(false)
  const [archived, setArchived] = useState([])
  const [archivedLoading, setArchivedLoading] = useState(false)
  // Al arrastrar una card a "Perdido" se pide el motivo en un modal (no window.prompt)
  // antes de aplicar el cambio; { id, status } de la card en espera de confirmación.
  const [lostPending, setLostPending] = useState(null)
  const [lostSaving, setLostSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await api.get('/ventas/leads')
    setLeads(data)
    setLoading(false)
  }, [])

  const loadArchived = useCallback(async () => {
    setArchivedLoading(true)
    try {
      const { data } = await api.get('/ventas/leads?archived=true')
      setArchived(data)
    } finally {
      setArchivedLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (showArchived) loadArchived() }, [showArchived, loadArchived])

  async function unarchive(id) {
    setArchived(ls => ls.filter(l => l.id !== id))
    try {
      await api.patch(`/ventas/leads/${id}/archive`, { archived: false })
      load()
    } catch {
      loadArchived() // revertir ante error
    }
  }

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  // Recalcula al cargar leads (cambia el ancho total) y al resize de ventana.
  useEffect(() => {
    updateScrollState()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
    }
  }, [updateScrollState, leads])

  function scrollByPage(dir) {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  async function applyStatusChange(id, status, lostReason) {
    // Optimista: mover la card ya.
    setLeads(ls => ls.map(l => (l.id === id ? { ...l, status, ...(lostReason ? { lostReason } : {}) } : l)))
    try {
      await api.patch(`/ventas/leads/${id}/status`, { status, ...(lostReason ? { lostReason } : {}) })
    } catch {
      load() // revertir ante error
    }
  }

  async function moveTo(status) {
    const id = dragId
    setDragId(null); setOverCol(null)
    if (!id) return
    const lead = leads.find(l => l.id === id)
    if (!lead || lead.status === status) return

    if (statusMeta(status)?.isLost) {
      setLostPending({ id, status }) // pide el motivo antes de aplicar el cambio
      return
    }
    await applyStatusChange(id, status)
  }

  async function confirmLost(reason) {
    if (!lostPending) return
    setLostSaving(true)
    try {
      await applyStatusChange(lostPending.id, lostPending.status, reason)
      setLostPending(null)
    } finally {
      setLostSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  const showArrows = !showArchived && (canScrollLeft || canScrollRight)

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <button
          onClick={() => setShowArchived(s => !s)}
          className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
        >
          {showArchived ? '← Volver al pipeline' : '🗄 Ver archivados'}
        </button>
        {showArrows && (
          <div className="flex items-center gap-1.5">
            <ScrollArrow side="left" onClick={() => scrollByPage(-1)} disabled={!canScrollLeft} />
            <ScrollArrow side="right" onClick={() => scrollByPage(1)} disabled={!canScrollRight} />
          </div>
        )}
      </div>

      {showArchived ? (
        archivedLoading ? <LoadingSpinner /> : (
          <div className="space-y-2">
            {archived.length === 0 && <p className="text-sm text-gray-400 py-6 text-center">No hay leads archivados.</p>}
            {archived.map(l => (
              <div key={l.id} className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                <div className="min-w-0 cursor-pointer" onClick={() => onOpenLead(l.id)}>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[statusMeta(l.status)?.color]}`} title={l.status === 'perdido' ? l.lostReason : undefined}>{statusMeta(l.status)?.label}</span>
                    <span className="font-medium text-sm text-gray-900 dark:text-white truncate">{l.company?.name || '—'}</span>
                  </div>
                  {l.title && <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{l.title}</div>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{l.estimatedValue ? fmtMoney(l.estimatedValue, l.currency) : ''}</span>
                  <button onClick={() => unarchive(l.id)} className="text-xs font-medium text-primary-600 hover:underline">↩️ Desarchivar</button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
      <>
      <div ref={scrollRef} className="overflow-x-auto pb-2 scroll-smooth">
        <div className="flex gap-3 min-w-max">
          {LEAD_STATUSES.map(col => {
              const items = leads.filter(l => l.status === col.key)
              const total = items.reduce((s, l) => s + (l.estimatedValue ? Number(l.estimatedValue) : 0), 0)
              return (
                <div
                  key={col.key}
                  onDragOver={e => { e.preventDefault(); setOverCol(col.key) }}
                  onDragLeave={() => setOverCol(c => (c === col.key ? null : c))}
                  onDrop={() => moveTo(col.key)}
                  className={`w-64 shrink-0 rounded-2xl border p-2 transition-colors ${overCol === col.key ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-900/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30'}`}
                >
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[col.color]}`}>{col.label}</span>
                    <span className="text-xs text-gray-400">{items.length}</span>
                  </div>
                  <div className="px-2 pb-1 text-[11px] text-gray-400">{fmtMoney(total, items[0]?.currency || 'ARS')}</div>

                  <div className="space-y-2 min-h-[40px]">
                    {items.map(l => (
                      <div
                        key={l.id}
                        draggable
                        onDragStart={() => setDragId(l.id)}
                        onDragEnd={() => { setDragId(null); setOverCol(null) }}
                        onClick={() => onOpenLead(l.id)}
                        className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 cursor-pointer hover:shadow-sm transition-shadow ${dragId === l.id ? 'opacity-50' : ''}`}
                      >
                        <div className="font-medium text-sm text-gray-900 dark:text-white truncate">{l.company?.name || '—'}</div>
                        {l.title && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{l.title}</div>}
                        {col.key === 'perdido' && l.lostReason && <div className="text-xs text-red-500 dark:text-red-400 truncate mt-0.5" title={l.lostReason}>✕ {l.lostReason}</div>}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{l.estimatedValue ? fmtMoney(l.estimatedValue, l.currency) : ''}</span>
                          {l.owner && <span className="text-[11px] text-gray-400 truncate max-w-[90px]" title={l.owner.name}>{l.owner.name}</span>}
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && <div className="text-center text-xs text-gray-300 dark:text-gray-600 py-4">—</div>}
                  </div>
                </div>
              )
            })}
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3 px-1">Arrastrá una tarjeta a otra columna para cambiar su estado. {statusMeta('ganado').label} habilita crear el proyecto desde el lead.</p>
      </>
      )}

      <LostReasonModal open={!!lostPending} loading={lostSaving} onConfirm={confirmLost} onCancel={() => setLostPending(null)} />
    </div>
  )
}
