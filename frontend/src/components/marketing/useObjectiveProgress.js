import { useState, useEffect } from 'react'
import api from '../../api/client'

/**
 * Trae el progreso calculado de los objetivos de un proyecto (mes en curso).
 * Devuelve la lista completa; cada pestaña filtra las métricas que le competen.
 * Carga independiente: no bloquea el resto de la vista.
 */
export default function useObjectiveProgress(projectId) {
  const [objectives, setObjectives] = useState([])
  useEffect(() => {
    if (!projectId) { setObjectives([]); return }
    let alive = true
    api.get(`/marketing/projects/${projectId}/objectives/progress`)
      .then(r => { if (alive) setObjectives(r.data.objectives ?? []) })
      .catch(() => { if (alive) setObjectives([]) })
    return () => { alive = false }
  }, [projectId])
  return objectives
}
