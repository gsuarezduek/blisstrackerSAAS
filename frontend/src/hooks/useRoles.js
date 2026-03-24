import { useState, useEffect } from 'react'
import api from '../api/client'

// Module-level cache so we only fetch once per session
let cache = null

export default function useRoles() {
  const [roles, setRoles] = useState(cache || [])

  useEffect(() => {
    if (cache) return
    api.get('/roles').then(r => {
      cache = r.data
      setRoles(r.data)
    }).catch(() => {})
  }, [])

  function labelFor(name) {
    return roles.find(r => r.name === name)?.label ?? name
  }

  return { roles, labelFor }
}
