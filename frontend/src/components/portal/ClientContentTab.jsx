import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import ClientPieceCard from './ClientPieceCard'

const API = import.meta.env.VITE_API_URL || ''

/**
 * Tab "Contenido" del portal de cliente — lista las piezas en estados
 * `portalVisible` (idea/producción/revisión NUNCA llegan acá, el backend ya
 * filtra por PORTAL_VISIBLE_STATUSES) agrupadas en "Esperando tu aprobación"
 * (canDecide) y el resto. Requiere identidad de contacto (canApprove/canDecide
 * vienen del lado del servidor) — un token legacy sin contactId puede leer
 * pero ClientPieceCard corta a re-login apenas intenta aprobar/comentar.
 */
export default function ClientContentTab({ slug, token, requireReauth, brandPrimary }) {
  const [pieces,  setPieces]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

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
        <p className="text-sm text-gray-500">Todavía no hay piezas para revisar.</p>
      </div>
    )
  }

  const awaiting = pieces.filter(p => p.canDecide)
  const rest     = pieces.filter(p => !p.canDecide)

  return (
    <div className="space-y-5">
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
