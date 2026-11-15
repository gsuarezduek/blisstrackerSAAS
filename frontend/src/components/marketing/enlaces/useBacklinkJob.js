import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../../api/client'

// Techo del polling: si el job no terminó en 5 min, se corta y se avisa en vez de
// dejar el intervalo corriendo para siempre. Mismo criterio que OnPageTab.
const MAX_POLL_MS = 5 * 60 * 1000
const POLL_MS = 3000

/**
 * Sigue un `BacklinkJob` (verify o classify) hasta que termina.
 *
 * Al montar reanuda el polling si el último job del tipo pedido quedó corriendo:
 * sin eso, un refresh de página durante una verificación de 100 enlaces dejaba la
 * UI mostrando el estado viejo hasta que alguien la recargara de nuevo.
 */
export default function useBacklinkJob({ projectId, kind = 'verify', onFinish }) {
  const [job,      setJob]      = useState(null)
  const [error,    setError]    = useState(null)
  const [timedOut, setTimedOut] = useState(false)
  const timerRef = useRef(null)
  const startRef = useRef(null)
  const finishRef = useRef(onFinish)
  finishRef.current = onFinish

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  const poll = useCallback((jobId, startedAt) => {
    stop()
    startRef.current = startedAt ? new Date(startedAt).getTime() : Date.now()
    timerRef.current = setInterval(async () => {
      if (Date.now() - startRef.current > MAX_POLL_MS) {
        stop()
        setTimedOut(true)
        return
      }
      try {
        const { data } = await api.get(`/marketing/projects/${projectId}/backlinks/jobs/${jobId}`)
        setJob(data)
        if (data.status !== 'running' && data.status !== 'pending') {
          stop()
          finishRef.current?.(data)
        }
      } catch {
        // Un error de red suelto no corta el polling: el próximo tick reintenta.
      }
    }, POLL_MS)
  }, [projectId, stop])

  // Reanudación tras un refresh: si el último job sigue corriendo, se retoma con
  // su createdAt real para que el techo de 5 min cuente desde que arrancó.
  useEffect(() => {
    if (!projectId) return
    let alive = true
    api.get(`/marketing/projects/${projectId}/backlinks/jobs`)
      .then(({ data }) => {
        if (!alive) return
        const last = (data || []).find(j => j.kind === kind)
        if (!last) return
        setJob(last)
        if (last.status === 'running' || last.status === 'pending') poll(last.id, last.createdAt)
      })
      .catch(() => {})
    return () => { alive = false; stop() }
  }, [projectId, kind, poll, stop])

  const start = useCallback(async ({ force = false } = {}) => {
    setError(null)
    setTimedOut(false)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/backlinks/verify`, { force })
      setJob({ id: data.jobId, kind, status: 'pending', errorMsg: 'Iniciando…' })
      poll(data.jobId)
      return true
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo iniciar la verificación.')
      // Si ya había una corriendo, el backend devuelve su id: en vez de un error
      // muerto, se engancha el polling a la que existe.
      const running = err.response?.data?.jobId
      if (running) poll(running)
      return false
    }
  }, [projectId, kind, poll])

  const busy = job?.status === 'running' || job?.status === 'pending'
  return { job, busy, error, timedOut, start }
}
