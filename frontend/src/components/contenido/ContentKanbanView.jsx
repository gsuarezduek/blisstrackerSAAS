import { useState, useMemo } from 'react'
import ContentNetworkChips from './ContentNetworkChips'
import { OPEN_STATUSES, STATUS_BADGE } from './contentCatalog'
import { formatDateTime } from './dateHelpers'

/**
 * Kanban por estado. Drag & drop HTML5 nativo, mismo patrón que
 * ventas/PipelineTab.jsx (dragId + overCol, sin dependencias), extendido con
 * un segundo nivel de dragOver por card para poder soltar ANTES de una tarjeta
 * puntual y no solo al final de la columna.
 *
 * Solo columnas de OPEN_STATUSES: "Publicado" y "Archivado" son terminales y
 * no tienen sentido como destino de un drag (se marcan desde el detalle).
 */
export default function ContentKanbanView({ pieces, canEdit, onMove, onOpen }) {
  const [dragId, setDragId] = useState(null)
  // { status, beforeId } — beforeId null = soltar al final de la columna.
  const [dropTarget, setDropTarget] = useState(null)

  const columns = useMemo(() => {
    const byStatus = {}
    for (const s of OPEN_STATUSES) byStatus[s.key] = []
    for (const p of pieces) {
      if (byStatus[p.status]) byStatus[p.status].push(p)
    }
    for (const key of Object.keys(byStatus)) {
      byStatus[key].sort((a, b) => a.order - b.order || new Date(a.updatedAt) - new Date(b.updatedAt))
    }
    return byStatus
  }, [pieces])

  function handleDrop(status) {
    const id = dragId
    const target = dropTarget
    setDragId(null)
    setDropTarget(null)
    if (!id) return

    const colPieces = (columns[status] || []).filter(p => p.id !== id)
    let targetIndex = colPieces.length
    if (target?.status === status && target.beforeId) {
      const idx = colPieces.findIndex(p => p.id === target.beforeId)
      if (idx !== -1) targetIndex = idx
    }
    onMove(id, { status, order: targetIndex })
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {OPEN_STATUSES.map(col => {
          const items = columns[col.key] || []
          const isOver = dropTarget?.status === col.key
          return (
            <div
              key={col.key}
              onDragOver={e => { if (canEdit) { e.preventDefault(); setDropTarget({ status: col.key, beforeId: null }) } }}
              onDragLeave={() => setDropTarget(t => (t?.status === col.key && !t.beforeId ? null : t))}
              onDrop={() => canEdit && handleDrop(col.key)}
              className={`w-64 shrink-0 rounded-2xl border p-2 transition-colors ${
                isOver
                  ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-900/10'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30'}`}
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[col.color]}`}>
                  {col.label}
                </span>
                <span className="text-xs text-gray-400">{items.length}</span>
              </div>

              <div className="space-y-2 min-h-[40px] px-0.5 pb-1">
                {items.map(p => (
                  <div
                    key={p.id}
                    draggable={canEdit}
                    onDragStart={() => setDragId(p.id)}
                    onDragEnd={() => { setDragId(null); setDropTarget(null) }}
                    onDragOver={e => {
                      if (!canEdit) return
                      e.preventDefault()
                      e.stopPropagation()
                      setDropTarget({ status: col.key, beforeId: p.id })
                    }}
                    onClick={() => onOpen(p)}
                    className={`bg-white dark:bg-gray-800 border rounded-xl p-3 cursor-pointer hover:shadow-sm transition-shadow ${
                      dragId === p.id ? 'opacity-50' : 'border-gray-200 dark:border-gray-700'} ${
                      dropTarget?.beforeId === p.id ? 'border-t-2 border-t-primary-500' : ''}`}
                  >
                    <div className="font-medium text-sm text-gray-900 dark:text-white truncate">{p.title}</div>
                    <div className="flex items-center justify-between mt-2 gap-2">
                      <ContentNetworkChips networks={p.networks} size="w-3.5 h-3.5" />
                      {p.owner && (
                        <span className="text-[11px] text-gray-400 truncate max-w-[90px] shrink-0" title={p.owner.name}>
                          {p.owner.name}
                        </span>
                      )}
                    </div>
                    {p.scheduledAt && (
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{formatDateTime(p.scheduledAt)}</div>
                    )}
                  </div>
                ))}
                {items.length === 0 && <div className="text-center text-xs text-gray-300 dark:text-gray-600 py-4">—</div>}
              </div>
            </div>
          )
        })}
      </div>
      {canEdit && (
        <p className="text-xs text-gray-400 mt-3 px-1">Arrastrá una tarjeta a otra columna para cambiar su estado, o soltala sobre otra tarjeta para reordenar.</p>
      )}
    </div>
  )
}
