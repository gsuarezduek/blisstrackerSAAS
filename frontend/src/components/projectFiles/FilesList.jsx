import { Link } from 'react-router-dom'
import { fmtBytes } from '../../lib/fileIcons'
import { ArrowDown, ArrowUp, CalendarDays, Link2 } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { OverflowMenu } from '../ui/OverflowMenu'
import ItemThumb from './ItemThumb'
import { fmtDate, itemMenuActions, nextSortForColumn, sortDirFor } from './projectFilesHelpers'

// ═══════════════════════════════════════════════════════════════════════════════
// Vista de lista de la Nube — la hermana de la grilla de <ItemCard>
//
// La grilla sirve para reconocer un archivo (es una pared de miniaturas); la
// lista sirve para compararlos: quién subió qué, cuándo y cuánto pesa, que es
// data que el backend ya mandaba (`shapeItem` → `uploadedBy`, `createdAt`,
// `sizeBytes`) pero que en la tarjeta entraba apretada en un pie de 10px.
//
// Las dos vistas comparten el cuadrito (<ItemThumb>) y las acciones
// (`itemMenuActions`): lo único propio de acá son las columnas.
// ═══════════════════════════════════════════════════════════════════════════════

// Header y filas repiten la MISMA plantilla de columnas — tienen que coincidir,
// así que vive en una constante y no duplicada en dos className.
// En mobile sobreviven tres columnas (selección, nombre, menú) y los metadatos
// bajan a una segunda línea bajo el nombre; de `md` para arriba son columnas de
// verdad. Mismo recurso que usa TaskCard para sus acciones: dos presentaciones
// alternadas por CSS, no dos componentes.
const COLS = 'grid grid-cols-[1.5rem_minmax(0,1fr)_2rem] md:grid-cols-[1.5rem_minmax(0,1fr)_9rem_6rem_5rem_2rem] gap-2 items-center'

// Encabezado clickeable: ordena por su columna y alterna el sentido si ya era
// la activa. Convive con el <select> de orden de la barra de arriba — los dos
// escriben el mismo `sortBy`, así que no hay dos estados que sincronizar.
function SortHeader({ label, column, sortBy, onSortChange, className = '' }) {
  const dir = sortDirFor(column, sortBy)
  return (
    <button
      onClick={() => onSortChange(nextSortForColumn(column, sortBy))}
      className={`flex items-center gap-1 text-left hover:text-gray-700 dark:hover:text-gray-200 ${dir ? 'text-gray-700 dark:text-gray-200 font-medium' : ''} ${className}`}
    >
      {label}
      {dir && <Icon as={dir === 'asc' ? ArrowUp : ArrowDown} size={12} />}
    </button>
  )
}

function ItemRow({ item, projectId, onOpen, onRename, onMove, onDelete, onDownload, onCopyLink, onShare, onCreateTask, onLinkToContent, selected, onToggleSelect, dragProps, dropProps, dragging, dropActive, highlighted }) {
  const isFolder = item.type === 'folder'
  const size = isFolder ? '—' : fmtBytes(item.sizeBytes)
  const who = item.uploadedBy?.name || '—'
  // Los resultados del buscador traen su propio breadcrumb: son de cualquier
  // carpeta del proyecto, así que sin la ruta no se sabe de dónde salió cada uno.
  const routeLabel = item.path ? (item.path.length ? `Raíz / ${item.path.map(p => p.name).join(' / ')}` : 'Raíz') : null

  return (
    <div
      {...dragProps}
      {...dropProps}
      draggable={!!dragProps}
      className={`group ${COLS} px-2 py-1.5 rounded-lg border transition-colors ${
        dropActive
          ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/30'
          : highlighted
            ? 'border-primary-400 ring-2 ring-primary-400 animate-pulse bg-white dark:bg-gray-800'
            : selected
              ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
              : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'
      } ${dragging ? 'opacity-50' : ''}`}
    >
      {onToggleSelect ? (
        <button
          onClick={() => onToggleSelect(item)}
          className={`w-5 h-5 flex items-center justify-center rounded-md border text-[11px] transition-opacity ${
            selected
              ? 'bg-primary-600 border-primary-600 text-white opacity-100'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-transparent opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
          title="Seleccionar"
        >
          ✓
        </button>
      ) : <span />}

      {/* Nombre: el click abre el ítem, igual que en la grilla. */}
      <div className="min-w-0 flex items-center gap-2">
        <button onClick={() => onOpen(item)} className="min-w-0 flex items-center gap-2 text-left" title={item.name}>
          <ItemThumb item={item} size={32} />
          <span className="min-w-0">
            <span className="block text-sm text-gray-700 dark:text-gray-200 truncate">{item.name}</span>
            {/* Segunda línea: la ruta cuando viene del buscador y, solo en
                mobile, los metadatos que allá no tienen columna propia. */}
            {routeLabel && <span className="block text-[10px] text-gray-400 dark:text-gray-500 truncate">{routeLabel}</span>}
            <span className="md:hidden block text-[10px] text-gray-400 dark:text-gray-500 truncate">
              {[item.uploadedBy?.name, fmtDate(item.createdAt), isFolder ? null : fmtBytes(item.sizeBytes)].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>
        {item.isPublic && (
          <Icon
            as={Link2} size={13} className="flex-shrink-0 text-primary-600 dark:text-primary-400"
            title={isFolder ? 'Carpeta compartida por link público' : 'Archivo compartido por link público'}
          />
        )}
        {!isFolder && item.contentPieces?.length > 0 && (
          <Link
            to={`/contenido?projectId=${projectId}&piece=${item.contentPieces[0].id}`}
            onClick={e => e.stopPropagation()}
            title={`Ir a la pieza: ${item.contentPieces.map(p => p.title).join(', ')}`}
            className="flex-shrink-0 text-primary-600 dark:text-primary-400 hover:underline"
          >
            <Icon as={CalendarDays} size={13} />
          </Link>
        )}
      </div>

      <span className="hidden md:block text-xs text-gray-500 dark:text-gray-400 truncate" title={who}>{who}</span>
      <span className="hidden md:block text-xs text-gray-500 dark:text-gray-400" title={item.createdAt ? new Date(item.createdAt).toLocaleString('es-AR') : ''}>
        {fmtDate(item.createdAt) || '—'}
      </span>
      <span className="hidden md:block text-xs text-gray-500 dark:text-gray-400">{size}</span>

      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <OverflowMenu items={itemMenuActions(item, { onOpen, onRename, onMove, onDelete, onDownload, onCopyLink, onShare, onCreateTask, onLinkToContent })} />
      </div>
    </div>
  )
}

/**
 * `selectedIds` y `fileDrag` son opcionales: el modo búsqueda los pasa en null
 * porque mezcla ítems de distintas carpetas, donde ni la selección en lote ni
 * el arrastre para mover tienen un destino claro (misma decisión que ya tomaba
 * la grilla).
 */
export default function FilesList({ items, sortBy, onSortChange, highlightId, selectedIds, fileDrag, ...handlers }) {
  return (
    <div>
      <div className={`${COLS} px-2 pb-1.5 mb-1 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500`}>
        <span />
        <SortHeader label="Nombre" column="name" sortBy={sortBy} onSortChange={onSortChange} />
        <span className="hidden md:block">Subido por</span>
        <SortHeader label="Fecha" column="date" sortBy={sortBy} onSortChange={onSortChange} className="hidden md:flex" />
        <SortHeader label="Tamaño" column="size" sortBy={sortBy} onSortChange={onSortChange} className="hidden md:flex" />
        <span />
      </div>
      <div className="space-y-0.5">
        {items.map(item => (
          <ItemRow
            key={`${item.type}-${item.id}`}
            item={item}
            highlighted={highlightId === item.id}
            selected={selectedIds?.has(item.id)}
            dragProps={fileDrag?.dragSourceProps(item)}
            dropProps={item.type === 'folder' ? fileDrag?.dropTargetProps(item.id) : undefined}
            dragging={fileDrag?.isItemDragging(item)}
            dropActive={item.type === 'folder' && fileDrag?.isDropTarget(item.id)}
            {...handlers}
          />
        ))}
      </div>
    </div>
  )
}
