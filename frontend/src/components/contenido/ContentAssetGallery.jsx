import { useState } from 'react'
import ConfirmModal from '../ConfirmModal'

function formatDuration(sec) {
  if (!sec && sec !== 0) return null
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * Thumbnails de los assets de una pieza (todos 'ready' — content.controller.js
 * ya filtra los 'pending' al armar la respuesta de la pieza). Click selecciona
 * cuál se ve grande en el visor del modal; arrastrar reordena; solo `canEdit`
 * puede reordenar o borrar.
 */
export default function ContentAssetGallery({ assets, activeId, onSelectActive, onReorder, onDelete, canEdit }) {
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  if (!assets.length) return null

  function handleDrop(targetAsset) {
    const id = dragId
    setDragId(null)
    setOverId(null)
    if (!id || id === targetAsset.id) return
    const others = assets.filter(a => a.id !== id)
    const targetIndex = others.findIndex(a => a.id === targetAsset.id)
    onReorder(id, targetIndex === -1 ? others.length : targetIndex)
  }

  async function handleConfirmDelete() {
    setDeleting(true)
    try {
      await onDelete(confirmDelete.id)
      setConfirmDelete(null)
    } catch { /* el error queda expuesto en el contenedor */ } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {assets.map(a => {
        const duration = formatDuration(a.durationSec)
        const isActive = a.id === activeId
        return (
          <div
            key={a.id}
            draggable={canEdit}
            onDragStart={() => setDragId(a.id)}
            onDragEnd={() => { setDragId(null); setOverId(null) }}
            onDragOver={e => { if (canEdit) { e.preventDefault(); setOverId(a.id) } }}
            onDrop={() => canEdit && handleDrop(a)}
            onClick={() => onSelectActive(a.id)}
            className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 cursor-pointer shrink-0 transition-all group ${
              isActive ? 'border-primary-500' : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'} ${
              dragId === a.id ? 'opacity-40' : ''} ${
              overId === a.id && dragId && dragId !== a.id ? 'ring-2 ring-primary-400' : ''}`}
            title={a.fileName || undefined}
          >
            {a.kind === 'video' ? (
              a.posterUrl ? (
                <img src={a.posterUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xl">🎬</div>
              )
            ) : (
              <img src={a.url} alt="" className="w-full h-full object-cover" />
            )}

            {a.kind === 'video' && (
              <span className="absolute top-1 left-1 text-[9px] bg-black/60 text-white px-1 rounded">🎬{duration ? ` ${duration}` : ''}</span>
            )}

            {canEdit && (
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(a) }}
                className="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                title="Eliminar"
              >
                ✕
              </button>
            )}

            {a.sizeBytes && (
              <span className="absolute bottom-0.5 right-1 text-[9px] text-white drop-shadow">{formatSize(a.sizeBytes)}</span>
            )}
          </div>
        )
      })}

      <ConfirmModal
        open={!!confirmDelete}
        title="Eliminar archivo"
        message={confirmDelete ? `Se va a eliminar ${confirmDelete.fileName || 'este archivo'}.` : ''}
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
