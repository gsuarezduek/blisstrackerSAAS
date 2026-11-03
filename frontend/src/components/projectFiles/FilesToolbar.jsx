import { useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { Icon } from '../ui/Icon'

// ─── Breadcrumb + acciones (papelera / nueva carpeta / subir archivos) ───────

const DROP_ACTIVE = 'rounded ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/30'

export default function FilesToolbar({ folderId, path, onNavigate, onShowTrash, onNewFolder, onFilesSelected, dropTargetProps, isDropTarget }) {
  const inputRef = useRef(null)

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 flex-wrap min-w-0">
        <button
          {...dropTargetProps(null)}
          onClick={() => onNavigate(null)}
          className={`hover:text-primary-600 dark:hover:text-primary-400 ${!folderId ? 'font-semibold text-gray-800 dark:text-gray-100' : ''} ${isDropTarget(null) ? DROP_ACTIVE : ''}`}
        >
          Raíz
        </button>
        {path.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1 min-w-0">
            <span>/</span>
            <button
              {...dropTargetProps(p.id)}
              onClick={() => onNavigate(p.id)}
              className={`truncate hover:text-primary-600 dark:hover:text-primary-400 ${i === path.length - 1 ? 'font-semibold text-gray-800 dark:text-gray-100' : ''} ${isDropTarget(p.id) ? DROP_ACTIVE : ''}`}
            >
              {p.name}
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onShowTrash}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
          title="Papelera"
        >
          <Icon as={Trash2} size={15} />
        </button>
        <button
          onClick={onNewFolder}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
        >
          Nueva carpeta
        </button>
        <button
          onClick={() => inputRef.current?.click()}
          className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium"
        >
          ⬆ Subir archivos
        </button>
        <input
          ref={inputRef} type="file" multiple className="hidden"
          onChange={e => { if (e.target.files?.length) onFilesSelected(e.target.files); e.target.value = '' }}
        />
      </div>
    </div>
  )
}
