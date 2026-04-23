import { createContext, useContext, useState, useEffect, useMemo } from 'react'
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

  // Derivados de billing — disponibles globalmente para TrialBanner y otros
  const trialDaysLeft = useMemo(() => {
    if (!workspace?.trialEndsAt || workspace.status !== 'trialing') return null
    const msLeft = new Date(workspace.trialEndsAt) - new Date()
    return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)))
  }, [workspace?.trialEndsAt, workspace?.status])

  const isSubscriptionActive = workspace?.status === 'active'

  // Enriquecer el objeto workspace con los derivados (para que TrialBanner pueda usarlos directamente)
  const enrichedWorkspace = workspace
    ? { ...workspace, trialDaysLeft, isSubscriptionActive }
    : null

  return (
    <WorkspaceContext.Provider value={{
      workspace: enrichedWorkspace,
      loading, notFound, suspended, slug,
      refreshWorkspace,
      trialDaysLeft,
      isSubscriptionActive,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export const useWorkspace = () => useContext(WorkspaceContext)
