import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import LoadingSpinner from '../components/LoadingSpinner'
import { writeOAuthResult } from '../lib/oauthResultBridge'

/**
 * Página puente para el callback OAuth de integraciones (Google, Meta, TikTok,
 * LinkedIn). El proveedor redirige acá desde el backend; se escribe el resultado
 * para la ventana que abrió el popup (ver `lib/oauthResultBridge.js`) y se cierra.
 */
export default function OAuthResult() {
  const [searchParams] = useSearchParams()
  // `window.close()` no funciona si Cross-Origin-Opener-Policy cortó la relación
  // con el opener (pasa en el flujo de Google). Antes el fallback navegaba a `/`,
  // que dejaba el Dashboard entero metido en una ventana de 520px; ahora se le
  // pide a la persona que la cierre, que es lo único que queda por hacer.
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const success   = searchParams.get('success') === 'true'
    const error     = searchParams.get('error')
    const type      = searchParams.get('type')
    const pending   = searchParams.get('pending') === 'true'
    const pendingId = searchParams.get('pendingId')

    // `pending`: el backend encontró varias cuentas (hoy solo Meta Ads) y necesita
    // que el usuario elija una antes de guardar la conexión — no es éxito ni error.
    writeOAuthResult({ success, error, integrationType: type, pending, pendingId })

    window.close()
    const t = setTimeout(() => setStuck(true), 800)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-gray-900 gap-3 px-6 text-center">
      {stuck ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Listo. Ya podés cerrar esta ventana y volver a BlissTracker.
        </p>
      ) : (
        <>
          <LoadingSpinner size="lg" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Procesando autorización…</p>
        </>
      )}
    </div>
  )
}
