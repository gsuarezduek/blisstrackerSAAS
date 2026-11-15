import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../../api/client'
import { clearOAuthResult, waitForOAuthResult } from '../../lib/oauthResultBridge'

const POPUP_NAME = 'google_calendar_oauth'

/**
 * Conexión personal con Google Calendar (push de eventos agendados) — a
 * diferencia de useGoogleIntegration.js (GA4/Ads/GSC, por proyecto), esta es
 * por persona+workspace, sin projectId. Reusa el mismo popup + puente
 * (`lib/oauthResultBridge.js`) porque el mecanismo es genérico — solo cambia el
 * endpoint de auth-url/status.
 */
export function useGoogleCalendarConnection() {
  const [status, setStatus] = useState(null) // { connected, accountEmail } | null mientras carga
  const [connecting, setConnecting] = useState(false)
  const waiting = useRef(null)

  const reload = useCallback(async () => {
    try {
      const { data } = await api.get('/calendar/google/status')
      setStatus(data)
      return data
    } catch {
      return null
    }
  }, [])

  useEffect(() => { reload() }, [reload])
  useEffect(() => () => { if (waiting.current) waiting.current.cancel() }, [])

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const { data } = await api.get('/calendar/google/auth-url')
      clearOAuthResult()
      const popup = window.open(data.url, POPUP_NAME, 'width=520,height=660,left=200,top=80')

      if (waiting.current) waiting.current.cancel()
      const wait = waitForOAuthResult({ popup })
      waiting.current = wait
      const { status, result } = await wait.promise
      if (waiting.current === wait) waiting.current = null
      if (status === 'cancelled') return { ok: false, error: 'cancelled' }

      setConnecting(false)
      if (status !== 'result') return { ok: false, error: status }
      if (!result.success)     return { ok: false, error: result.error }
      await reload()
      return { ok: true }
    } catch (err) {
      setConnecting(false)
      return { ok: false, error: err.message }
    }
  }, [reload])

  const disconnect = useCallback(async () => {
    await api.delete('/calendar/google')
    setStatus({ connected: false, accountEmail: null })
  }, [])

  return { status, connecting, connect, disconnect }
}

export default useGoogleCalendarConnection
