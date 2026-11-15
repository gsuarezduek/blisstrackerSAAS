import { useState, useRef, useEffect, useCallback } from 'react'
import { clearOAuthResult, waitForOAuthResult } from '../../../lib/oauthResultBridge'

/**
 * Abre el popup de OAuth de una red y espera el resultado que deja la página
 * puente (/oauth-result). La espera vive en `lib/oauthResultBridge.js`, común a
 * todos los flujos de OAuth de la app.
 *
 * @param {() => Promise<string>} getAuthUrl  devuelve la URL de autorización
 * @param {string} integrationType            type que debe venir en el resultado
 * @param {string} label                      nombre de la red, para los errores
 * @param {() => void} onConnected
 * @param {string} [closedMessage]            error a mostrar si cierran el popup sin
 *   terminar. Ojo: con COOP de por medio el cierre casi nunca se puede detectar
 *   (ver el puente), así que no se puede contar con este aviso.
 * @param {(pendingId: string) => void} [onPending]  el backend encontró varias
 *   cuentas y necesita que el usuario elija una antes de guardar la conexión
 *   (hoy solo Meta Ads) — si no se pasa, ese caso se trata como error genérico.
 */
export default function useOAuthPopup({ getAuthUrl, integrationType, label, onConnected, closedMessage = null, onPending = null, width = 560, height = 680 }) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const waiting = useRef(null)

  const stop = () => { if (waiting.current) { waiting.current.cancel(); waiting.current = null } }
  useEffect(() => stop, [])

  // El popup se cierra solo al terminar, pero con el handle repudiado por COOP no
  // hay forma de saberlo: sin esto, cerrarlo a mano dejaba el botón en "Conectando…"
  // hasta el timeout de 5 minutos.
  const cancel = useCallback(() => { stop(); setLoading(false) }, [])

  const start = useCallback(async () => {
    stop()
    setLoading(true); setError(null)
    let url
    try {
      url = await getAuthUrl()
    } catch (err) {
      setLoading(false)
      setError(err.response?.data?.error || 'No se pudo iniciar la conexión.')
      return
    }

    clearOAuthResult()
    const popup = window.open(url, `${integrationType}_oauth`, `width=${width},height=${height},left=200,top=100`)
    const wait = waitForOAuthResult({ popup })
    waiting.current = wait

    const { status, result } = await wait.promise
    if (waiting.current === wait) waiting.current = null
    if (status === 'cancelled') return   // desmontaje o cancelación explícita

    setLoading(false)
    if (status === 'closed')  { if (closedMessage) setError(closedMessage); return }
    if (status === 'timeout') { setError('La conexión tardó demasiado. Intentá de nuevo.'); return }

    if (result.integrationType !== integrationType) {
      setError(result.error || `No se pudo conectar ${label}.`)
    } else if (result.pending && result.pendingId && onPending) {
      onPending(result.pendingId)
    } else if (result.success) {
      onConnected?.()
    } else {
      setError(result.error || `No se pudo conectar ${label}.`)
    }
  }, [getAuthUrl, integrationType, label, onConnected, closedMessage, onPending, width, height])

  return { start, cancel, loading, error, setError }
}
