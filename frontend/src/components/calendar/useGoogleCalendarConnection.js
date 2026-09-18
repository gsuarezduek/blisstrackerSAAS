import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../../api/client'

const POPUP_NAME = 'google_calendar_oauth'
const STORAGE_KEY = '__ga_oauth_result' // mismo bridge que useGoogleIntegration.js (OAuthResult.jsx)
const POLL_INTERVAL_MS = 600
const POPUP_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Conexión personal con Google Calendar (push de eventos agendados) — a
 * diferencia de useGoogleIntegration.js (GA4/Ads/GSC, por proyecto), esta es
 * por persona+workspace, sin projectId. Reusa el mismo popup + bridge
 * (OAuthResult.jsx escribe en localStorage con esta misma clave fija) porque
 * el mecanismo es genérico — solo cambia el endpoint de auth-url/status.
 */
export function useGoogleCalendarConnection() {
  const [status, setStatus] = useState(null) // { connected, accountEmail } | null mientras carga
  const [connecting, setConnecting] = useState(false)
  const pollRef = useRef(null)

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
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const { data } = await api.get('/calendar/google/auth-url')
      localStorage.removeItem(STORAGE_KEY)
      window.open(data.url, POPUP_NAME, 'width=520,height=660,left=200,top=80')

      return new Promise(resolve => {
        const startedAt = Date.now()
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(() => {
          const stored = localStorage.getItem(STORAGE_KEY)
          if (stored) {
            clearInterval(pollRef.current)
            pollRef.current = null
            localStorage.removeItem(STORAGE_KEY)
            try {
              const result = JSON.parse(stored)
              setConnecting(false)
              if (result.success) {
                reload().then(() => resolve({ ok: true }))
              } else {
                resolve({ ok: false, error: result.error })
              }
            } catch {
              setConnecting(false)
              resolve({ ok: false, error: 'invalid_result' })
            }
            return
          }
          if (Date.now() - startedAt > POPUP_TIMEOUT_MS) {
            clearInterval(pollRef.current)
            pollRef.current = null
            setConnecting(false)
            resolve({ ok: false, error: 'timeout' })
          }
        }, POLL_INTERVAL_MS)
      })
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
