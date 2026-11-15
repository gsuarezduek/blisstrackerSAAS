import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { clearOAuthResult, waitForOAuthResult } from '../lib/oauthResultBridge'

const POPUP_NAME = 'google_oauth'

/**
 * Hook compartido para gestionar integraciones Google (GA4 / GSC / Ads) de un proyecto.
 *
 * Expone:
 *  - integrations: lista cruda devuelta por GET /marketing/projects/:id/integrations
 *  - loading[type]: boolean por tipo
 *  - getIntegration(type)
 *  - reload(): refetch
 *  - connect(type, { forceOAuth }): abre OAuth popup o reusa tokens existentes
 *  - disconnect(type)
 *  - savePropertyId(type, value): PATCH propertyId
 *  - saveCustomerId(type, value): PATCH customerId
 */
export function useGoogleIntegration(projectId, { enabled = true } = {}) {
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState({})
  const [propSaving, setPropSaving] = useState({})
  const waiting = useRef(null)

  const setOne = useCallback((type, val) => {
    setLoading(prev => ({ ...prev, [type]: val }))
  }, [])

  const reload = useCallback(async () => {
    if (!projectId) return
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/integrations`)
      setIntegrations(data)
      return data
    } catch {
      return null
    }
  }, [projectId])

  useEffect(() => {
    if (!enabled) return
    reload()
  }, [enabled, reload])

  useEffect(() => () => {
    if (waiting.current) waiting.current.cancel()
  }, [])

  const getIntegration = useCallback(
    type => integrations.find(i => i.type === type),
    [integrations],
  )

  const connect = useCallback(async (type, { forceOAuth = false } = {}) => {
    if (!projectId) return { ok: false }
    setOne(type, true)
    try {
      const { data } = await api.get(
        `/marketing/integrations/google/auth-url?projectId=${projectId}&type=${type}`,
      )

      if (data.hasExistingTokens && !forceOAuth) {
        try {
          const r = await api.post(
            `/marketing/projects/${projectId}/integrations/connect-existing?type=${type}`,
          )
          setIntegrations(prev => {
            const others = prev.filter(i => i.type !== type)
            return [...others, r.data]
          })
          setOne(type, false)
          return { ok: true, reused: true }
        } catch {
          // fallback a OAuth completo
        }
      }

      clearOAuthResult()
      const popup = window.open(data.url, POPUP_NAME, 'width=520,height=660,left=200,top=80')

      if (waiting.current) waiting.current.cancel()
      const wait = waitForOAuthResult({ popup })
      waiting.current = wait
      const { status, result } = await wait.promise
      if (waiting.current === wait) waiting.current = null
      if (status === 'cancelled') return { ok: false, error: 'cancelled' }

      setOne(type, false)
      if (status !== 'result')  return { ok: false, error: status }
      if (!result.success)      return { ok: false, error: result.error }
      await reload()
      return { ok: true, reused: false }
    } catch (err) {
      setOne(type, false)
      return { ok: false, error: err.message }
    }
  }, [projectId, reload, setOne])

  const disconnect = useCallback(async type => {
    if (!projectId) return
    setOne(type, true)
    try {
      await api.delete(`/marketing/projects/${projectId}/integrations/${type}`)
      setIntegrations(prev => prev.filter(i => i.type !== type))
    } finally {
      setOne(type, false)
    }
  }, [projectId, setOne])

  const savePropertyId = useCallback(async (type, value) => {
    if (!projectId) return { ok: false }
    setPropSaving(prev => ({ ...prev, [type]: true }))
    try {
      const { data } = await api.patch(
        `/marketing/projects/${projectId}/integrations/${type}`,
        { propertyId: value || null },
      )
      setIntegrations(prev => prev.map(i => i.type === type ? { ...i, ...data } : i))
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.response?.data?.error || err.message }
    } finally {
      setPropSaving(prev => ({ ...prev, [type]: false }))
    }
  }, [projectId])

  const saveCustomerId = useCallback(async (type, value) => {
    if (!projectId) return { ok: false }
    setPropSaving(prev => ({ ...prev, [type]: true }))
    try {
      const { data } = await api.patch(
        `/marketing/projects/${projectId}/integrations/${type}`,
        { customerId: value || null },
      )
      setIntegrations(prev => prev.map(i => i.type === type ? { ...i, ...data } : i))
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err.response?.data?.error || err.message }
    } finally {
      setPropSaving(prev => ({ ...prev, [type]: false }))
    }
  }, [projectId])

  return {
    integrations,
    setIntegrations,
    loading,
    propSaving,
    getIntegration,
    reload,
    connect,
    disconnect,
    savePropertyId,
    saveCustomerId,
  }
}
