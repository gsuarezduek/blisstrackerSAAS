import { Link } from 'react-router-dom'
import { fmtBytes, iconFor } from '../../lib/fileIcons'
import { CalendarDays, Folder, Link2 } from 'lucide-react'
import { Icon } from '../ui/Icon'

// ─── Tarjeta de ítem (carpeta o archivo) con menú contextual ──────────────────

export default function ItemCard({ item, projectId, menuOpen, onOpenMenu, onOpen, onRename, onMove, onDelete, onDownload, onCopyLink, onShare, onCreateTask, onLinkToContent, caption, selected, onToggleSelect }) {
  const isFolder = item.type === 'folder'
  const isImage = !isFolder && item.mimeType?.startsWith('image/')
  const isPreviewable = !isFolder && !isImage && item.previewable
  return (
    <div className={`relative group rounded-xl ${selected ? 'ring-2 ring-primary-500' : ''}`}>
      <button
        onClick={() => onOpen(item)}
        className="w-full flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-center"
        title={item.name}
      >
        <div className="w-14 h-14 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-900/40 overflow-hidden relative">
          {isImage && item.url ? (
            <img src={item.url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Icon as={isFolder ? Folder : iconFor(item.mimeType)} size={30} className={isFolder ? 'text-amber-500' : 'text-gray-400'} />
          )}
          {isFolder && item.isPublic && (
            <span
              className="absolute bottom-0.5 right-0.5 text-[9px] bg-primary-600 text-white rounded-full w-4 h-4 flex items-center justify-center leading-none"
              title="Carpeta compartida por link público"
            ><Icon as={Link2} size={10} /></span>
          )}
        </div>
        <span className="text-xs text-gray-700 dark:text-gray-200 truncate w-full">{item.name}</span>
        {!isFolder && <span className="text-[10px] text-gray-400 dark:text-gray-500">{fmtBytes(item.sizeBytes)}</span>}
        {caption && <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate w-full">{caption}</span>}
      </button>

      {/* Fuera del botón de arriba (que abre la vista previa) — a propósito, para
          poder hacer las dos cosas: click en la tarjeta ve el archivo, click acá
          va a la pieza. Si hay más de una vinculada, va a la primera; el resto
          se listan en el tooltip. */}
      {!isFolder && item.contentPieces?.length > 0 && (
        <Link
          to={`/contenido?projectId=${projectId}&piece=${item.contentPieces[0].id}`}
          onClick={e => e.stopPropagation()}
          title={`Ir a la pieza: ${item.contentPieces.map(p => p.title).join(', ')}`}
          className="block w-full text-center text-[10px] text-primary-600 dark:text-primary-400 hover:underline truncate px-1 mt-0.5"
        >
          <Icon as={CalendarDays} size={10} className="inline align-[-1px] mr-0.5" />{item.contentPieces.length === 1 ? item.contentPieces[0].title : `${item.contentPieces.length} piezas`}
        </Link>
      )}

      {onToggleSelect && (
        <button
          onClick={e => { e.stopPropagation(); onToggleSelect(item) }}
          className={`absolute top-1 left-1 w-5 h-5 flex items-center justify-center rounded-md border text-[11px] transition-opacity ${
            selected
              ? 'bg-primary-600 border-primary-600 text-white opacity-100'
              : 'bg-white/90 dark:bg-gray-800/90 border-gray-300 dark:border-gray-600 text-transparent opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
          title="Seleccionar"
        >
          ✓
        </button>
      )}

      <button
        onClick={e => { e.stopPropagation(); onOpenMenu(menuOpen ? null : item.id) }}
        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-sm"
        title="Más acciones"
      >
        ⋯
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => onOpenMenu(null)} />
          <div className="absolute top-7 right-1 z-50 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 text-sm">
            {isPreviewable && (
              <button onClick={() => { onOpenMenu(null); onOpen(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Ver</button>
            )}
            <button onClick={() => { onOpenMenu(null); onRename(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Renombrar</button>
            <button onClick={() => { onOpenMenu(null); onMove(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Mover</button>
            {isFolder && onShare && (
              <button onClick={() => { onOpenMenu(null); onShare(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
                {item.isPublic ? 'Compartido' : 'Compartir'}
              </button>
            )}
            {!isFolder && (
              <>
                <button onClick={() => { onOpenMenu(null); onDownload(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">⬇️ Descargar</button>
                <button onClick={() => { onOpenMenu(null); onCopyLink(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Copiar enlace</button>
                {onLinkToContent && (
                  <button onClick={() => { onOpenMenu(null); onLinkToContent(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Contenido</button>
                )}
                {onCreateTask && (
                  <button onClick={() => { onOpenMenu(null); onCreateTask(item) }} className="w-full text-left px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Crear tarea</button>
                )}
              </>
            )}
            <button onClick={() => { onOpenMenu(null); onDelete(item) }} className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400">Eliminar</button>
          </div>
        </>
      )}
    </div>
  )
}
