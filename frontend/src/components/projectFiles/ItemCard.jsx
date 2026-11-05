import { Link } from 'react-router-dom'
import { fmtBytes } from '../../lib/fileIcons'
import { CalendarDays, Link2 } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { OverflowMenu } from '../ui/OverflowMenu'
import ItemThumb from './ItemThumb'
import { itemMenuActions } from './projectFilesHelpers'

// ─── Tarjeta de ítem (carpeta o archivo) con menú contextual ──────────────────
// La vista de miniaturas. Su hermana es <ItemRow>, la fila de la vista de
// lista: misma data y las mismas acciones (<itemMenuActions>), presentadas para
// reconocer un archivo de un vistazo en vez de para compararlos entre sí.

export default function ItemCard({ item, projectId, onOpen, onRename, onMove, onDelete, onDownload, onCopyLink, onShare, onCreateTask, onLinkToContent, caption, selected, onToggleSelect, dragProps, dropProps, dragging, dropActive }) {
  const isFolder = item.type === 'folder'
  return (
    <div
      {...dragProps}
      {...dropProps}
      draggable={!!dragProps}
      className={`relative group rounded-xl ${selected || dropActive ? 'ring-2 ring-primary-500' : ''} ${dragging ? 'opacity-50' : ''}`}
    >
      <button
        onClick={() => onOpen(item)}
        className={`w-full flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors text-center ${dropActive
          ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/30'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
        title={item.name}
      >
        <div className="relative">
          <ItemThumb item={item} size={56} />
          {item.isPublic && (
            <span
              className="absolute bottom-0.5 right-0.5 text-[9px] bg-primary-600 text-white rounded-full w-4 h-4 flex items-center justify-center leading-none"
              title={isFolder ? 'Carpeta compartida por link público' : 'Archivo compartido por link público'}
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

      {/* El menú va en un portal con position:fixed (ver <OverflowMenu>) para
          que no lo recorte ni un contenedor con overflow-hidden ni el borde de
          la ventana en la última fila de la grilla. */}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <OverflowMenu items={itemMenuActions(item, { onOpen, onRename, onMove, onDelete, onDownload, onCopyLink, onShare, onCreateTask, onLinkToContent })} />
      </div>

    </div>
  )
}
