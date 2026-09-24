import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import ClientPieceCard from './ClientPieceCard'
import ClientContentCalendar from './ClientContentCalendar'

const API = import.meta.env.VITE_API_URL || ''

/**
 * Tab "Contenido" del portal de cliente — lista TODAS las piezas del proyecto,
 * en cualquier estado (idea/producción/revisión interna incluidas: el cliente
 * ve el pipeline completo para estar al tanto del avance), agrupadas en
 * "Esperando tu aprobación" (canDecide) destacada arriba y el resto del
 * contenido debajo. Requiere identidad de contacto (canApprove/canDecide vienen
 * del lado del servidor) — un token legacy sin contactId puede leer pero
 * ClientPieceCard corta a re-login apenas intenta aprobar/comentar.
 * Además de la vista Lista hay una vista Calendario (solo lectura, por fecha de
 * publicación) — ver ClientContentCalendar.jsx. La elección se recuerda en localStorage.
 */
const VIEW_KEY = 'bliss_client_content_view'

function readView() {
  try { return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'list' } catch { return 'list' }
}

export default function ClientContentTab({ slug, token, requireReauth, brandPrimary }) {
  const [pieces,  setPieces]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [view,    setView]    = useState(readView)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    axios.get(`${API}/api/public/client-portal/${slug}/content`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setPieces(r.data.pieces || []))
      .catch(err => {
        if (err.response?.status === 401) requireReauth()
        else setError(err.response?.data?.error || 'No se pudo cargar el contenido')
      })
      .finally(() => setLoading(false))
  }, [slug, token, requireReauth])

  useEffect(() => { reload() }, [reload])

  // Reemplaza la pieza actualizada in-place — cambia de grupo solo (aprobar/
  // pedir cambios cambia `canDecide`), sin recargar todo el listado.
  function handlePieceChanged(updated) {
    setPieces(prev => prev.map(p => (p.id === updated.id ? updated : p)))
  }

  if (loading) return <p className="text-sm text-gray-500">Cargando piezas…</p>
  if (error)   return <p className="text-sm text-red-600">{error}</p>

  if (pieces.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-3xl mb-2">📅</p>
        <p className="text-sm text-gray-500">Todavía no hay piezas de contenido cargadas.</p>
      </div>
    )
  }

  function changeView(next) {
    setView(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* sin storage: no se recuerda */ }
  }

  const awaiting = pieces.filter(p => p.canDecide)
  const rest     = pieces.filter(p => !p.canDecide)

  const viewToggle = (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-medium">
      {[['list', '☰ Lista'], ['calendar', '📅 Calendario']].map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => changeView(key)}
          className={`px-3 py-1 rounded-md transition-colors ${
            view === key ? 'text-white' : 'text-gray-500 hover:text-gray-800'}`}
          style={view === key ? { backgroundColor: brandPrimary || '#F7931A' } : undefined}
        >
          {label}
        </button>
      ))}
    </div>
  )

  if (view === 'calendar') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {viewToggle}
          {awaiting.length > 0 && (
            <p className="text-xs font-semibold text-amber-600">
              {awaiting.length} esperando tu aprobación (resaltadas en el calendario)
            </p>
          )}
        </div>
        <ClientContentCalendar
          pieces={pieces} slug={slug} token={token} requireReauth={requireReauth}
          brandPrimary={brandPrimary} onChanged={handlePieceChanged}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>{viewToggle}</div>
      {awaiting.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
            Esperando tu aprobación ({awaiting.length})
          </p>
          <div className="space-y-3">
            {awaiting.map(p => (
              <ClientPieceCard
                key={p.id} slug={slug} token={token} requireReauth={requireReauth}
                piece={p} brandPrimary={brandPrimary} onChanged={handlePieceChanged} defaultOpen
              />
            ))}
          </div>
        </div>
      )}
      {rest.length > 0 && (
        <div>
          {awaiting.length > 0 && (
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Resto del contenido</p>
          )}
          <div className="space-y-3">
            {rest.map(p => (
              <ClientPieceCard
                key={p.id} slug={slug} token={token} requireReauth={requireReauth}
                piece={p} brandPrimary={brandPrimary} onChanged={handlePieceChanged}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
