import { useState, useEffect } from 'react'
import api from '../api/client'

// Module-level cache — null until resolved, Promise while in-flight
let cache = null
let cachePromise = null

export default function useRoles() {
  const [roles, setRoles] = useState(cache || [])

  useEffect(() => {
    if (cache) return
    if (!cachePromise) {
      cachePromise = api.get('/roles').then(r => {
        cache = r.data
        return r.data
      }).catch(() => { cachePromise = null })
    }
    cachePromise.then(data => { if (data) setRoles(data) }).catch(() => {})
  }, [])

  function labelFor(name) {
    return roles.find(r => r.name === name)?.label ?? name
  }

  return { roles, labelFor }
}
