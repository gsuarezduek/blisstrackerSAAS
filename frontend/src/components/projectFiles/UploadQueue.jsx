import { X } from 'lucide-react'
import { Icon } from '../ui/Icon'

// ─── Cola de subida ────────────────────────────────────────────────────────────

export default function UploadQueue({ queue, onCancel }) {
  if (queue.length === 0) return null
  return (
    <div className="space-y-1.5">
      {queue.map(it => (
        <div key={it.id} className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-gray-900/40 rounded-lg px-2.5 py-1.5">
          {/* La miniatura ya está generada cuando arranca el PUT (ver
              runUpload), así que se ve el frame del video mientras sube — que
              es justo cuando más sirve, porque un archivo grande tarda. */}
          {it.previewUrl && (
            <img src={it.previewUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0 border border-gray-200 dark:border-gray-600" />
          )}
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
                <div className="h-full bg-primary-500 transition-all" style={{ width: `${it.status === 'uploading' ? it.progress : it.status === 'confirming' ? 100 : 0}%` }} />
              </div>
              <button onClick={() => onCancel(it.id)} className="text-gray-400 hover:text-red-500 shrink-0" title="Cancelar"><Icon as={X} size={16} /></button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
