import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { fmtBytes, iconFor } from '../../lib/fileIcons'
import { Folder } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { fmtDate } from './projectFilesHelpers'

// "🗑️ Papelera" — lista solo las raíces de cada subárbol borrado (el backend
// ya colapsa una carpeta con contenido en una sola fila) con quién y cuándo lo
// borró, y un botón para restaurar (cascadea a todo el contenido, si aplica).
export default function TrashModal({ projectId, isAdmin, onClose, onRestored }) {
  const [items, setItems] = useState(null) // null = cargando
  const [restoringId, setRestoringId] = useState(null)
  const [purgingId, setPurgingId] = useState(null)
  const [confirmPurgeId, setConfirmPurgeId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setItems(null)
    api.get(`/projects/${projectId}/files/trash`)
      .then(({ data }) => setItems(data.items))
      .catch(() => { setItems([]); setError('No se pudo cargar la papelera') })
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleRestore(item) {
    setRestoringId(item.id); setError('')
    try {
      await api.post(`/projects/${projectId}/files/${item.id}/restore`)
      setItems(prev => prev.filter(it => it.id !== item.id))
      onRestored()
    } catch {
      setError('No se pudo restaurar')
    } finally { setRestoringId(null) }
  }

  async function handlePurge(item) {
    setPurgingId(item.id); setError(''); setConfirmPurgeId(null)
    try {
      await api.delete(`/projects/${projectId}/files/${item.id}/purge`)
      setItems(prev => prev.filter(it => it.id !== item.id))
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo eliminar definitivamente')
    } finally { setPurgingId(null) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b dark:border-gray-700 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Papelera</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none shrink-0">×</button>
        </div>
        <div className="overflow-y-auto px-3 py-2 flex-1 min-h-[160px]">
          {items === null ? <LoadingSpinner className="py-8" /> : items.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">La papelera está vacía</p>
          ) : (
            <div className="space-y-0.5">
              {items.map(it => (
                <div key={it.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <Icon as={it.type === 'folder' ? Folder : iconFor(it.mimeType)} size={20} className={it.type === 'folder' ? 'text-amber-500' : 'text-gray-400'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{it.name}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                      {fmtBytes(it.totalSizeBytes)} · Eliminado por {it.deletedBy?.name ?? 'alguien'} · {fmtDate(it.deletedAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestore(it)} disabled={restoringId === it.id || purgingId === it.id}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 shrink-0"
                  >
                    {restoringId === it.id ? 'Restaurando…' : 'Restaurar'}
                  </button>
                  {isAdmin && (
                    confirmPurgeId === it.id ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handlePurge(it)} disabled={purgingId === it.id}
                          className="text-xs px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                        >
                          {purgingId === it.id ? 'Eliminando…' : 'Confirmar'}
                        </button>
                        <button
                          onClick={() => setConfirmPurgeId(null)} disabled={purgingId === it.id}
                          className="text-xs px-2 py-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmPurgeId(it.id)} disabled={restoringId === it.id || purgingId === it.id}
                        title="Eliminar definitivamente ahora, sin esperar la limpieza automática"
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 shrink-0"
                      >
                        Eliminar
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {error && <p className="px-5 pb-3 text-xs text-red-500 dark:text-red-400">{error}</p>}
      </div>
    </div>
  )
}
