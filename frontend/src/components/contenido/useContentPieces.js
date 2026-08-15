import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../api/client'

/**
 * Datos del calendario de contenido de un proyecto.
 *
 * Las mutaciones son optimistas y revierten ante error (mismo criterio que el
 * Pipeline de Ventas): la UI responde al instante y, si el backend rechaza, el
 * estado vuelve a como estaba y el error queda expuesto en `error`.
 *
 * @param {string|number} projectId
 * @param {object} filters — { from, to, status, network, ownerId, q }
 */
export function useContentPieces(projectId, filters = {}) {
  const [pieces,  setPieces]  = useState([])
  const [members, setMembers] = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  // Serializado para que el efecto no se dispare por identidad del objeto.
  const filterKey = JSON.stringify(filters)
  // Descarta respuestas de requests viejos que llegan tarde (cambio de proyecto
  // o de filtros mientras una request está en vuelo).
  const reqIdRef = useRef(0)

  const reload = useCallback(() => {
    if (!projectId) {
      setPieces([]); setMembers([]); setTotal(0)
      return
    }
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError(null)

    const params = {}
    for (const [k, v] of Object.entries(JSON.parse(filterKey))) {
      if (v !== '' && v != null) params[k] = v
    }

    api.get(`/contenido/projects/${projectId}/pieces`, { params })
      .then(r => {
        if (reqId !== reqIdRef.current) return
        setPieces(r.data.pieces ?? [])
        setMembers(r.data.members ?? [])
        setTotal(r.data.total ?? 0)
      })
      .catch(err => {
        if (reqId !== reqIdRef.current) return
        setError(err.response?.data?.error || 'No se pudieron cargar las piezas')
      })
      .finally(() => {
        if (reqId === reqIdRef.current) setLoading(false)
      })
  }, [projectId, filterKey])

  useEffect(() => { reload() }, [reload])

  const create = useCallback(async (payload) => {
    setError(null)
    try {
      const { data } = await api.post(`/contenido/projects/${projectId}/pieces`, payload)
      setPieces(prev => [data, ...prev])
      setTotal(t => t + 1)
      return data
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear la pieza')
      throw err
    }
  }, [projectId])

  const update = useCallback(async (id, patch) => {
    setError(null)
    let snapshot
    setPieces(prev => {
      snapshot = prev
      return prev.map(p => (p.id === id ? { ...p, ...patch } : p))
    })
    try {
      const { data } = await api.patch(`/contenido/projects/${projectId}/pieces/${id}`, patch)
      // La respuesta del servidor es autoritativa: trae statusLabel, scheduledDate
      // derivada y las marcas de tiempo que el optimismo local no puede calcular.
      setPieces(prev => prev.map(p => (p.id === id ? data : p)))
      return data
    } catch (err) {
      if (snapshot) setPieces(snapshot)
      setError(err.response?.data?.error || 'No se pudo guardar el cambio')
      throw err
    }
  }, [projectId])

  // Drag&drop de Kanban/Calendario: mueve a `status` en la posición `order`
  // (índice dentro de esa columna, sin contar la pieza movida). El optimismo
  // local solo aproxima el estado — el `order` real de TODA la columna lo
  // recalcula el backend, así que tras la respuesta se recarga la lista
  // completa para no quedar con posiciones stale en las piezas vecinas.
  const move = useCallback(async (id, { status, order }) => {
    setError(null)
    let snapshot
    setPieces(prev => {
      snapshot = prev
      return prev.map(p => (p.id === id ? { ...p, status } : p))
    })
    try {
      await api.patch(`/contenido/projects/${projectId}/pieces/${id}/position`, { status, order })
      reload()
    } catch (err) {
      if (snapshot) setPieces(snapshot)
      setError(err.response?.data?.error || 'No se pudo mover la pieza')
      throw err
    }
  }, [projectId, reload])

  const remove = useCallback(async (id) => {
    setError(null)
    let snapshot
    setPieces(prev => {
      snapshot = prev
      return prev.filter(p => p.id !== id)
    })
    setTotal(t => Math.max(t - 1, 0))
    try {
      await api.delete(`/contenido/projects/${projectId}/pieces/${id}`)
    } catch (err) {
      if (snapshot) setPieces(snapshot)
      setTotal(t => t + 1)
      setError(err.response?.data?.error || 'No se pudo eliminar la pieza')
      throw err
    }
  }, [projectId])

  return { pieces, members, total, loading, error, setError, reload, create, update, move, remove }
}

/**
 * Historial (ContentStatusEvent) de una pieza puntual. Se carga bajo demanda
 * cuando se abre el tab "Historial" del modal de detalle — no vale la pena
 * traerlo junto con la lista general.
 */
export function useContentHistory(projectId, pieceId) {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const reload = useCallback(() => {
    if (!projectId || !pieceId) { setEvents([]); return }
    setLoading(true)
    setError(null)
    api.get(`/contenido/projects/${projectId}/pieces/${pieceId}/history`)
      .then(r => setEvents(r.data.events ?? []))
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el historial'))
      .finally(() => setLoading(false))
  }, [projectId, pieceId])

  useEffect(() => { reload() }, [reload])

  return { events, loading, error, reload }
}

export default useContentPieces
