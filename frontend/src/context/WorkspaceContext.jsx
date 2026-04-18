import { createContext, useContext, useState, useEffect } from 'react'
import api, { getWorkspaceSlug } from '../api/client'

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children }) {
  const [workspace, setWorkspace]       = useState(null)
  const [loading, setLoading]           = useState(true)
  const [notFound, setNotFound]         = useState(false)
  const [suspended, setSuspended]       = useState(false)

  const slug = getWorkspaceSlug()

  useEffect(() => {
    // Sin slug = dominio raíz (www.blisstracker.app o blisstracker.app)
    // No hay workspace que resolver; redirigir a /register
    if (!slug) {
      // Dominio raíz (blisstracker.app) o subdominio reservado (www) — sin workspace que resolver
      setLoading(false)
      return
    }

    api.get('/workspaces/info')
      .then(r => setWorkspace(r.data))
      .catch(err => {
        if (err.response?.status === 404) setNotFound(true)
        else if (err.response?.status === 402) setSuspended(true)
      })
      .finally(() => setLoading(false))
  }, [])

  function refreshWorkspace() {
    return api.get('/workspaces/current')
      .then(r => setWorkspace(r.data))
      .catch(() => {})
  }

  return (
    <WorkspaceContext.Provider value={{ workspace, loading, notFound, suspended, slug, refreshWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export const useWorkspace = () => useContext(WorkspaceContext)
