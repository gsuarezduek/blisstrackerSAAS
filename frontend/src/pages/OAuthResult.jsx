import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import LoadingSpinner from '../components/LoadingSpinner'

/**
 * Página puente para el callback OAuth de integraciones Google.
 * Google redirige aquí desde el backend. Escribe el resultado en localStorage
 * (el padre hace polling) y se cierra sola.
 */
export default function OAuthResult() {
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const success   = searchParams.get('success') === 'true'
    const error     = searchParams.get('error')
    const type      = searchParams.get('type')
    const pending   = searchParams.get('pending') === 'true'
    const pendingId = searchParams.get('pendingId')

    // Escribir resultado — el padre (ProjectInfoTab/useOAuthPopup) hace polling cada 600ms.
    // `pending`: el backend encontró varias cuentas (hoy solo Meta Ads) y necesita que
    // el usuario elija una antes de guardar la conexión — no es éxito ni error todavía.
    try {
      localStorage.setItem('__ga_oauth_result', JSON.stringify({
        success, error, integrationType: type, pending, pendingId, ts: Date.now(),
      }))
    } catch { /* localStorage no disponible */ }

    // Cerrar el popup
    window.close()
    // Fallback si window.close() no funciona (el browser lo bloquea)
    setTimeout(() => { window.location.href = '/' }, 800)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-900 gap-3">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-gray-500 dark:text-gray-400">Procesando autorización…</p>
    </div>
  )
}
