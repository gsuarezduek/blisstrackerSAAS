import { useState, useRef, useEffect, useCallback } from 'react'

const RESULT_KEY = '__ga_oauth_result'
const TIMEOUT_MS = 5 * 60 * 1000

/**
 * Abre el popup de OAuth de una red y espera el resultado que deja la página
 * puente (/oauth-result) en localStorage. Antes cada pestaña de Marketing tenía
 * su copia de este polling; acá vive una sola vez y además limpia el intervalo
 * al desmontar (las copias viejas quedaban corriendo si cambiabas de pestaña).
 *
 * @param {() => Promise<string>} getAuthUrl  devuelve la URL de autorización
 * @param {string} integrationType            type que debe venir en el resultado
 * @param {string} label                      nombre de la red, para los errores
 * @param {() => void} onConnected
 * @param {string} [closedMessage]            error a mostrar si cierran el popup sin terminar
 */
export default function useOAuthPopup({ getAuthUrl, integrationType, label, onConnected, closedMessage = null, width = 560, height = 680 }) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const timer = useRef(null)

  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null } }
  useEffect(() => stop, [])

  const start = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const url = await getAuthUrl()
      localStorage.removeItem(RESULT_KEY)
      const popup = window.open(url, `${integrationType}_oauth`, `width=${width},height=${height},left=200,top=100`)
      let elapsed = 0
      stop()
      timer.current = setInterval(() => {
        elapsed += 600
        try {
          const raw = localStorage.getItem(RESULT_KEY)
          if (raw) {
            const result = JSON.parse(raw)
            localStorage.removeItem(RESULT_KEY)
            stop(); setLoading(false)
            if (result.success && result.integrationType === integrationType) onConnected?.()
            else setError(result.error || `No se pudo conectar ${label}.`)
            return
          }
        } catch { /* resultado ilegible: seguimos esperando */ }
        if (popup?.closed) {
          stop(); setLoading(false)
          if (closedMessage) setError(closedMessage)
        } else if (elapsed >= TIMEOUT_MS) {
          stop(); setLoading(false)
          setError('La conexión tardó demasiado. Intentá de nuevo.')
        }
      }, 600)
    } catch (err) {
      setLoading(false)
      setError(err.response?.data?.error || 'No se pudo iniciar la conexión.')
    }
  }, [getAuthUrl, integrationType, label, onConnected, closedMessage, width, height])

  return { start, loading, error, setError }
}
