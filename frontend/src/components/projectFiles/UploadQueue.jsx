import { X } from 'lucide-react'
import { Icon } from '../ui/Icon'

// ─── Cola de subida ────────────────────────────────────────────────────────────

export default function UploadQueue({ queue, onCancel }) {
  if (queue.length === 0) return null
  return (
    <div className="space-y-1.5">
      {queue.map(it => (
        <div key={it.id} className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
          <span className="truncate flex-1 text-gray-600 dark:text-gray-300">{it.name}</span>
          {it.status === 'error' ? (
            <span className="text-red-500 dark:text-red-400 shrink-0">{it.error}</span>
          ) : (
            <>
              <span className="text-gray-400 shrink-0">
                {it.status === 'queued' ? 'En cola'
                  : it.status === 'waiting' ? 'Esperando turno…'
                  : it.status === 'thumbnail' ? 'Generando miniatura…'
                  : it.status === 'confirming' ? 'Confirmando…'
                  : `Subiendo… ${it.progress}%`}
              </span>
              <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden shrink-0">
                <div className="h-full bg-primary-500 transition-all" style={{ width: `${it.status === 'uploading' ? it.progress : (it.status === 'thumbnail' || it.status === 'confirming') ? 100 : 0}%` }} />
              </div>
              <button onClick={() => onCancel(it.id)} className="text-gray-400 hover:text-red-500 shrink-0" title="Cancelar"><Icon as={X} size={16} /></button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
