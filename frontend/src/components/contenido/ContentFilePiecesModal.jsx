import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'

/**
 * Modal abierto desde el menú ⋯ de un archivo en Archivos ("📄 Contenido") —
 * lista las piezas del proyecto disponibles para vincular (todo menos
 * 'publicado') y permite togglear el vínculo con este archivo puntual.
 * Contraparte de ContentFileBrowserModal, que hace lo mismo pero desde el
 * lado de la pieza (elegir un archivo en vez de una pieza).
 */
export default function ContentFilePiecesModal({ projectId, file, onClose }) {
  const [pieces,  setPieces]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [savingId, setSavingId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.get(`/contenido/projects/${projectId}/files/${file.id}/pieces`)
      .then(r => setPieces(r.data.pieces ?? []))
      .catch(err => setError(err.response?.data?.error || 'No se pudieron cargar las piezas'))
      .finally(() => setLoading(false))
  }, [projectId, file.id])

  useEffect(() => { load() }, [load])

  async function toggle(piece) {
    setSavingId(piece.id)
    setError(null)
    try {
      if (piece.linked) {
        await api.delete(`/contenido/projects/${projectId}/pieces/${piece.id}/files/${file.id}`)
      } else {
        await api.post(`/contenido/projects/${projectId}/pieces/${piece.id}/files`, { fileId: file.id })
      }
      setPieces(prev => prev.map(p => p.id === piece.id ? { ...p, linked: !p.linked } : p))
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar el vínculo')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">📄 Contenido</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{file.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Elegí a qué piezas de Contenido vincular este archivo. Las piezas ya publicadas no aparecen acá.
          </p>

          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

          {loading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">Cargando…</p>
          ) : pieces.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
              No hay piezas disponibles para vincular (puede que todas estén publicadas, o que no haya ninguna creada todavía).
            </p>
          ) : (
            <div className="space-y-1">
              {pieces.map(p => (
                <button
                  key={p.id}
                  onClick={() => toggle(p)}
                  disabled={savingId === p.id}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 text-left transition-colors"
                >
                  <span className={`w-5 h-5 flex items-center justify-center rounded-md border text-xs shrink-0 ${
                    p.linked
                      ? 'bg-primary-600 border-primary-600 text-white'
                      : 'border-gray-300 dark:border-gray-600 text-transparent'}`}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-gray-800 dark:text-gray-100 truncate">{p.title}</span>
                    <span className="block text-xs text-gray-400 dark:text-gray-500">{p.statusLabel}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
