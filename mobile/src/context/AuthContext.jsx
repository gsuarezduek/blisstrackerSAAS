import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { Platform, Alert } from 'react-native'
import api, { setUnauthorizedHandler } from '../api/client'
import {
  getToken, getWorkspaceSlug, setSession, clearSession,
  getBiometricEnabled, setBiometricEnabled, getBiometricPrompted, setBiometricPrompted,
} from '../api/session'
import { registerForPushNotificationsAsync } from '../lib/push'
import { registerDevice, unregisterDevice } from '../api/devices'
import { connectSocket, disconnectSocket } from '../lib/socket'
import { isBiometricAvailable, authenticateAsync } from '../lib/biometrics'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // true mientras hay una sesión guardada pendiente de gate biométrico —
  // RootNavigator muestra LockScreen en vez de Dashboard mientras esto es true.
  const [locked, setLocked] = useState(false)
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

  // Termina de "entrar": trae el perfil, activa push y socket. Se llama tanto
  // al restaurar una sesión guardada (sin gate biométrico, o ya pasado) como
  // tras un login/selección de workspace fresco.
  const finishEnter = useCallback(async () => {
    const { data } = await api.get('/auth/me')
    setUser(data)
    syncPushToken()
    connectSocket()
  }, [syncPushToken])

  // Ofrece activar Face ID/huella justo después de un login fresco — nunca al
  // restaurar una sesión ya guardada (ahí ya se pasó por el gate si estaba
  // activo). Solo pregunta una vez por dispositivo (ver BIOMETRIC_PROMPTED_KEY).
  const maybePromptBiometric = useCallback(async () => {
    try {
      if (await getBiometricPrompted()) return
      if (!(await isBiometricAvailable())) return
      await setBiometricPrompted()
      Alert.alert(
        'Entrar más rápido',
        '¿Querés usar Face ID / huella para entrar la próxima vez, en vez de escribir tu contraseña?',
        [
          { text: 'No, gracias', style: 'cancel' },
          {
            text: 'Activar',
            onPress: async () => {
              const ok = await authenticateAsync()
              if (ok) await setBiometricEnabled(true)
            },
          },
        ]
      )
    } catch (err) {
      console.warn('[Biometric] No se pudo ofrecer la activación:', err.message)
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
    setLocked(false)
  }, [])

  // Salida para cuando la biometría dejó de funcionar (dedo/cara distinta,
  // hardware roto, etc.) — el gate por diseño no tiene "reintentar N veces y
  // listo", así que hace falta una forma de volver al login normal sin quedar
  // trabado en LockScreen para siempre. Apaga la preferencia y cierra sesión;
  // el próximo login pide contraseña de nuevo, como corresponde tras no poder
  // demostrar identidad biométrica.
  const forgetBiometricAndLogout = useCallback(async () => {
    await setBiometricEnabled(false)
    await logout()
  }, [logout])

  // Sesión vencida (401 en cualquier request): mismo criterio que la web,
  // volver a Login sin intentar distinguir causas.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null)
      setPendingWorkspaces(null)
      setLocked(false)
    })
  }, [])

  useEffect(() => {
    (async () => {
      const [token, slug] = await Promise.all([getToken(), getWorkspaceSlug()])
      if (token && slug) {
        try {
          if (await getBiometricEnabled()) {
            // No se llama a finishEnter todavía: queda "bloqueado" hasta que
            // unlock() confirme la biometría — ver RootNavigator/LockScreen.
            setLocked(true)
          } else {
            await finishEnter()
          }
        } catch {
          await clearSession()
        }
      }
      setLoading(false)
    })()
  }, [finishEnter])

  // Reintento desde LockScreen. Devuelve false sin tocar el estado si la
  // autenticación falla o se cancela, para que la pantalla pueda ofrecer
  // reintentar sin perder el gate.
  async function unlock() {
    const ok = await authenticateAsync()
    if (!ok) return false
    setLocked(false)
    await finishEnter()
    return true
  }

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
    setPendingWorkspaces(null)
    await finishEnter()
    maybePromptBiometric()
  }

  async function selectWorkspace(ws) {
    await enterWorkspace(ws)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, locked, pendingWorkspaces,
      login, selectWorkspace, logout, unlock, forgetBiometricAndLogout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
