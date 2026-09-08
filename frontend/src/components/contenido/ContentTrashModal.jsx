import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'

function timeAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'hoy'
  if (days === 1) return 'hace 1 día'
  return `hace ${days} días`
}

/**
 * Papelera de piezas de Contenido. Las piezas borradas (DELETE /pieces/:pid)
 * quedan acá recuperables — la limpieza semanal las borra en duro pasados
 * `contentPieceTrashRetentionDays` (30 por defecto, ver cleanup.service.js).
 * `onRestored` dispara el reload de la lista principal (Tabla/Kanban/Calendario)
 * para que la pieza restaurada reaparezca sin recargar la página.
 */
export default function ContentTrashModal({ projectId, onClose, onRestored }) {
  const [pieces,      setPieces]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [restoringId, setRestoringId] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.get(`/contenido/projects/${projectId}/pieces/trash`)
      .then(r => setPieces(r.data.pieces ?? []))
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar la papelera'))
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function handleRestore(id) {
    setRestoringId(id)
    setError(null)
    try {
      await api.post(`/contenido/projects/${projectId}/pieces/${id}/restore`)
      setPieces(prev => prev.filter(p => p.id !== id))
      onRestored?.()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo restaurar la pieza')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">🗑 Papelera</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Las piezas quedan acá 30 días antes de eliminarse definitivamente.
          </p>

          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

          {loading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">Cargando…</p>
          ) : pieces.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">La papelera está vacía.</p>
          ) : (
            <div className="space-y-2">
              {pieces.map(p => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.title}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {p.statusLabel} · Eliminada {timeAgo(p.deletedAt)}{p.deletedBy ? ` por ${p.deletedBy.name}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestore(p.id)}
                    disabled={restoringId === p.id}
                    className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white transition-colors"
                  >
                    {restoringId === p.id ? 'Restaurando…' : '↩️ Restaurar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
