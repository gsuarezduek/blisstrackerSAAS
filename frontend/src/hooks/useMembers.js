import { useState, useEffect } from 'react'
import api from '../api/client'

// Mapa userId → miembro del workspace (incluye `role` = teamRole).
// Permite resolver el rol de equipo de cualquier persona a partir de su userId,
// sin que cada endpoint tenga que devolver el teamRole.
// Mismo patrón de caché a nivel módulo que useRoles.

let cache = null          // array de miembros, null hasta resolver
let cachePromise = null   // Promise mientras está en vuelo

function buildById(members) {
  const byId = new Map()
  for (const m of members) byId.set(m.id, m)
  return byId
}

export default function useMembers() {
  const [members, setMembers] = useState(cache || [])

  useEffect(() => {
    if (cache) return
    if (!cachePromise) {
      cachePromise = api.get('/workspaces/current/members')
        .then(r => { cache = r.data; return r.data })
        .catch(() => { cachePromise = null })
    }
    cachePromise.then(data => { if (data) setMembers(data) }).catch(() => {})
  }, [])

  return { members, byId: buildById(members) }
}

// Invalida la caché (p. ej. tras editar roles del equipo).
export function clearMembersCache() {
  cache = null
  cachePromise = null
}
