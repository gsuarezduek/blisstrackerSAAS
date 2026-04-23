import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Página puente para el callback OAuth de integraciones Google.
 * Google redirige aquí desde el backend. Escribe el resultado en localStorage
 * (el padre hace polling) y se cierra sola.
 */
export default function OAuthResult() {
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const success = searchParams.get('success') === 'true'
    const error   = searchParams.get('error')
    const type    = searchParams.get('type')

    // Escribir resultado — el padre (ProjectInfoTab) hace polling cada 600ms
    try {
      localStorage.setItem('__ga_oauth_result', JSON.stringify({
        success, error, integrationType: type, ts: Date.now(),
      }))
    } catch { /* localStorage no disponible */ }

    // Cerrar el popup
    window.close()
    // Fallback si window.close() no funciona (el browser lo bloquea)
    setTimeout(() => { window.location.href = '/' }, 800)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-900 gap-3">
      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-gray-500 dark:text-gray-400">Procesando autorización…</p>
    </div>
  )
}
