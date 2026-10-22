import { useState, useEffect } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'

// "🔗 Compartir" — link público de solo lectura, para una carpeta (comparte
// todo su subárbol) o un archivo suelto (comparte solo ese archivo) — a
// diferencia de "🔗 Copiar enlace" de abajo, que es un deep-link interno que
// solo abre dentro de la app logueado. Llama siempre a createPublicLink al
// montar: es idempotente (devuelve el token existente si ya estaba
// compartido), así no hace falta un GET aparte para saber de antemano si
// tenía link o no.
export default function ShareFolderModal({ projectId, item, onClose, onChanged }) {
  const isFolder = item.type === 'folder'
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.post(`/projects/${projectId}/files/${item.id}/public-link`)
      .then(({ data }) => {
        if (!active) return
        setToken(data.publicToken)
        if (!item.isPublic) onChanged() // recién se compartió: refresca el badge/estado en la grilla de fondo
      })
      .catch(() => { if (active) setError('No se pudo generar el link') })
      .finally(() => active && setLoading(false))
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, item.id])

  const link = token ? `${window.location.origin}/shared-${isFolder ? 'folder' : 'file'}/${token}` : ''

  async function handleCopy() {
    try { await navigator.clipboard.writeText(link) } catch { /* fallback: seleccionar el input */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleRevoke() {
    setRevoking(true); setError('')
    try {
      await api.delete(`/projects/${projectId}/files/${item.id}/public-link`)
      onChanged()
      onClose()
    } catch {
      setError('No se pudo dejar de compartir')
      setRevoking(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">Compartir "{item.name}"</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {isFolder
            ? 'Cualquiera con este link puede ver y descargar el contenido de esta carpeta (y sus subcarpetas), sin necesidad de una cuenta.'
            : 'Cualquiera con este link puede ver y descargar este archivo, sin necesidad de una cuenta.'}
        </p>
        {loading ? (
          <LoadingSpinner className="py-4" />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input readOnly value={link} onFocus={e => e.target.select()} className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-xs" />
              <button onClick={handleCopy} className="text-sm px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium shrink-0">
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            {error && <p className="text-xs text-red-500 dark:text-red-400 mt-2">{error}</p>}
            <div className="flex justify-between items-center mt-4">
              <button onClick={handleRevoke} disabled={revoking} className="text-xs text-red-500 dark:text-red-400 hover:text-red-600 disabled:opacity-50">
                {revoking ? 'Desactivando…' : 'Dejar de compartir'}
              </button>
              <button onClick={onClose} className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
