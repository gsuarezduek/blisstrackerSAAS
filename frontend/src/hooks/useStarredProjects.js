import { useEffect, useState } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

// Proyectos destacados del usuario (ProjectStar), para el bloque "Destacados" de
// la barra lateral. Navbar se monta de nuevo en cada página, así que la lista vive
// en una caché a nivel de módulo: GET /projects corre varias agregaciones y no
// tiene sentido pedirlo en cada navegación.
//
// Quien destaca o saca un destacado (Mis Proyectos, ficha del proyecto) avisa con
// `notifyProjectStarChanged`, que actualiza la caché sin volver a pedir nada.

const TTL_MS = 5 * 60 * 1000
const EVENT = 'bliss:project-star-changed'

let cache = null        // { userId, at, items: [{ id, name, hasBlocked }] }
let inflight = null

function toItem(p) {
  return { id: p.id, name: p.name, hasBlocked: (p.taskCounts?.BLOCKED ?? 0) > 0 }
}

function fetchStarred(userId) {
  if (inflight) return inflight
  inflight = api.get('/projects')
    .then(({ data }) => {
      const items = (data || [])
        .filter(p => p.starred && !p.locked)
        .map(toItem)
        .sort((a, b) => a.name.localeCompare(b.name))
      cache = { userId, at: Date.now(), items }
      return items
    })
    .finally(() => { inflight = null })
  return inflight
}

// `project` necesita al menos { id, name }; `starred` es el estado nuevo.
export function notifyProjectStarChanged(project, starred) {
  if (cache) {
    const rest = cache.items.filter(p => p.id !== project.id)
    cache = {
      ...cache,
      items: starred
        ? [...rest, toItem(project)].sort((a, b) => a.name.localeCompare(b.name))
        : rest,
    }
  }
  window.dispatchEvent(new CustomEvent(EVENT))
}

export default function useStarredProjects() {
  const { user } = useAuth()
  const userId = user?.id
  const fresh = cache && cache.userId === userId
  const [items, setItems] = useState(fresh ? cache.items : [])

  useEffect(() => {
    if (!userId) return
    let alive = true
    const stale = !cache || cache.userId !== userId || Date.now() - cache.at > TTL_MS
    if (stale) fetchStarred(userId).then(next => { if (alive) setItems(next) }).catch(() => {})
    const onChange = () => { if (cache) setItems(cache.items) }
    window.addEventListener(EVENT, onChange)
    return () => { alive = false; window.removeEventListener(EVENT, onChange) }
  }, [userId])

  return items
}
