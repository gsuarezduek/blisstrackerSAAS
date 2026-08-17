import { useState, useEffect } from 'react'
import api from '../../api/client'

/**
 * Trae el progreso calculado de los objetivos de un proyecto (mes en curso).
 * Devuelve la lista completa; cada pestaña filtra las métricas que le competen.
 * Carga independiente: no bloquea el resto de la vista. `refreshKey` es opcional:
 * cambiarlo (ej. al cerrar el CRUD de objetivos) fuerza un refetch sin esperar a
 * que cambie `projectId`.
 */
export default function useObjectiveProgress(projectId, refreshKey) {
  const [objectives, setObjectives] = useState([])
  useEffect(() => {
    if (!projectId) { setObjectives([]); return }
    let alive = true
    api.get(`/marketing/projects/${projectId}/objectives/progress`)
      .then(r => { if (alive) setObjectives(r.data.objectives ?? []) })
      .catch(() => { if (alive) setObjectives([]) })
    return () => { alive = false }
  }, [projectId, refreshKey])
  return objectives
}
