import { useState, useEffect } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import { Folder } from 'lucide-react'
import { Icon } from '../ui/Icon'

// Selector de carpeta destino: navega el mismo árbol con el mismo endpoint de
// listado (filtrando solo carpetas). La validación de "no mover dentro de sí
// misma / de una subcarpeta" la hace el backend — acá solo se oculta del
// listado las propias carpetas que se están moviendo, como guía visual, sin
// duplicar esa lógica. `items` siempre es un array (1 elemento = mover uno
// solo desde el menú ⋯, N = acción en lote desde la selección múltiple).
export default function MoveModal({ projectId, items, onClose, onMoved }) {
  const [folderId, setFolderId] = useState(null)
  const [path, setPath] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const movingIds = new Set(items.map(it => it.id))

  useEffect(() => {
    let active = true
    setLoading(true)
    const params = folderId ? `?parentId=${folderId}` : ''
    api.get(`/projects/${projectId}/files${params}`)
      .then(({ data }) => { if (active) { setFolders(data.folders); setPath(data.path) } })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [projectId, folderId])

  async function handleMove() {
    setSaving(true); setError('')
    const results = await Promise.allSettled(
      items.map(it => api.patch(`/projects/${projectId}/files/${it.id}`, { parentId: folderId }))
    )
    const failed = results.filter(r => r.status === 'rejected').length
    setSaving(false)
    if (failed > 0) {
      setError(failed === items.length ? 'No se pudo mover' : `${failed} de ${items.length} no se pudieron mover`)
      if (failed < items.length) onMoved()
    } else {
      onMoved()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b dark:border-gray-700 flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
            Mover {items.length > 1 ? `${items.length} elementos` : `"${items[0].name}"`}
          </p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none shrink-0">×</button>
        </div>
        <div className="px-5 py-2.5 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 flex-wrap border-b dark:border-gray-700">
          <button onClick={() => setFolderId(null)} className={`hover:text-primary-600 dark:hover:text-primary-400 ${!folderId ? 'font-semibold text-gray-700 dark:text-gray-200' : ''}`}>Raíz</button>
          {path.map(p => (
            <span key={p.id} className="flex items-center gap-1">
              <span>/</span>
              <button onClick={() => setFolderId(p.id)} className="hover:text-primary-600 dark:hover:text-primary-400">{p.name}</button>
            </span>
          ))}
        </div>
        <div className="overflow-y-auto px-3 py-2 flex-1 min-h-[160px]">
          {loading ? <LoadingSpinner className="py-8" /> : folders.filter(f => !movingIds.has(f.id)).length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">No hay subcarpetas acá</p>
          ) : (
            <div className="space-y-0.5">
              {folders.filter(f => !movingIds.has(f.id)).map(f => (
                <button
                  key={f.id} onClick={() => setFolderId(f.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-left text-gray-700 dark:text-gray-200"
                >
                  <Icon as={Folder} size={15} className="text-amber-500" /><span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <p className="px-5 pb-1 text-xs text-red-500 dark:text-red-400">{error}</p>}
        <div className="px-5 py-3 border-t dark:border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cancelar</button>
          <button onClick={handleMove} disabled={saving} className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium">
            {saving ? 'Moviendo…' : 'Mover acá'}
          </button>
        </div>
      </div>
    </div>
  )
}
