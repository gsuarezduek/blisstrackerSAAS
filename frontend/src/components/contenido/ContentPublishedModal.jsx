import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import ContentNetworkChips from './ContentNetworkChips'

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * "📣 Publicadas" — las piezas en estado 'publicado' salen de la vista general
 * (Tabla/Kanban/Calendario, ver el nuevo default de listPieces en el backend)
 * y viven solo acá. Clickear una fila abre la misma ContentPieceModal de
 * siempre (vía onOpen → ?piece=id), no hay un detalle propio.
 */
export default function ContentPublishedModal({ projectId, onClose, onOpen }) {
  const [pieces,  setPieces]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api.get(`/contenido/projects/${projectId}/pieces`, { params: { status: 'publicado', take: 200 } })
      .then(r => setPieces(r.data.pieces ?? []))
      .catch(err => setError(err.response?.data?.error || 'No se pudieron cargar las piezas publicadas'))
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => { load() }, [load])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">📣 Publicadas</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

          {loading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">Cargando…</p>
          ) : pieces.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">Todavía no hay piezas publicadas.</p>
          ) : (
            <div className="space-y-1">
              {pieces.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onOpen(p.id); onClose() }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.title}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Publicada {fmtDate(p.publishedAt)}
                    </p>
                  </div>
                  <ContentNetworkChips networks={p.networks} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
