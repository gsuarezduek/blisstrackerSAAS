import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { Platform } from 'react-native'
import api, { setUnauthorizedHandler } from '../api/client'
import { getToken, getWorkspaceSlug, setSession, clearSession } from '../api/session'
import { registerForPushNotificationsAsync } from '../lib/push'
import { registerDevice, unregisterDevice } from '../api/devices'
import { connectSocket, disconnectSocket } from '../lib/socket'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Workspaces devueltos por /auth/login cuando el usuario pertenece a más de
  // uno y todavía no eligió con cuál entrar (ver selectWorkspace).
  const [pendingWorkspaces, setPendingWorkspaces] = useState(null)
  // Token de push del dispositivo actual, para poder desregistrarlo en logout
  // sin tener que volver a pedirlo (registerForPushNotificationsAsync ya
  // maneja permisos/caché a su nivel, esto es solo para el DELETE).
  const pushTokenRef = useRef(null)

  // Best-effort: pedir permiso y registrar el token de push del dispositivo.
  // Nunca bloquea el login ni el arranque de la app si falla (sin proyecto
  // EAS, en un simulador, o con permiso denegado — ver src/lib/push.js).
  const syncPushToken = useCallback(async () => {
    try {
      const token = await registerForPushNotificationsAsync()
      if (!token) return
      pushTokenRef.current = token
      await registerDevice(token, Platform.OS)
    } catch (err) {
      console.warn('[Push] No se pudo registrar el dispositivo:', err.message)
    }
  }, [])

  const logout = useCallback(async () => {
    if (pushTokenRef.current) {
      await unregisterDevice(pushTokenRef.current).catch(() => {})
      pushTokenRef.current = null
    }
    disconnectSocket()
    await clearSession()
    setUser(null)
    setPendingWorkspaces(null)
  }, [])

  // Sesión vencida (401 en cualquier request): mismo criterio que la web,
  // volver a Login sin intentar distinguir causas.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      setPendingWorkspaces(null)
    })
  }, [])

  useEffect(() => {
    (async () => {
      const [token, slug] = await Promise.all([getToken(), getWorkspaceSlug()])
      if (token && slug) {
        try {
          const { data } = await api.get('/auth/me')
          setUser(data)
          syncPushToken()
          connectSocket()
        } catch {
          await clearSession()
        }
      }
      setLoading(false)
    })()
  }, [syncPushToken])

  // POST /auth/login sin X-Workspace (no hay slug guardado aún en el primer
  // login) → el backend devuelve { user, workspaces: [{slug,name,role,token}] }.
  // Con 1 solo workspace entramos directo; con varios, se resuelve con
  // selectWorkspace() desde la pantalla de selección.
  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    if (data.workspaces.length === 1) {
      await enterWorkspace(data.workspaces[0])
      return { done: true }
    }
    setPendingWorkspaces(data.workspaces)
    return { done: false, workspaces: data.workspaces }
  }

  async function enterWorkspace(ws) {
    await setSession(ws.token, ws.slug)
    const { data } = await api.get('/auth/me')
    setUser(data)
    setPendingWorkspaces(null)
    syncPushToken()
    connectSocket()
  }

  async function selectWorkspace(ws) {
    await enterWorkspace(ws)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, pendingWorkspaces,
      login, selectWorkspace, logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
