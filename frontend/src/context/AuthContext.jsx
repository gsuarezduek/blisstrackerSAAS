import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      api.get('/auth/me')
        .then(r => setUser(r.data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    // Fetch /auth/me para obtener el perfil completo (incl. isSuperAdmin)
    const meRes = await api.get('/auth/me').catch(() => ({ data: data.user }))
    setUser(meRes.data)
    return meRes.data
  }

  async function loginWithGoogle(credential) {
    const { data } = await api.post('/auth/google', { credential })
    localStorage.setItem('token', data.token)
    const meRes = await api.get('/auth/me').catch(() => ({ data: data.user }))
    setUser(meRes.data)
    return meRes.data
  }

  // Recibe un JWT ya obtenido (ej: desde AuthCallback o popup de OAuth)
  async function loginWithToken(token, userData) {
    localStorage.setItem('token', token)
    // Fetch /auth/me para obtener el perfil completo (incl. isSuperAdmin)
    const meRes = await api.get('/auth/me').catch(() => ({ data: userData }))
    setUser(meRes.data)
  }

  // Cambia al usuario a otro workspace: obtiene un nuevo JWT y redirige al subdominio
  async function switchWorkspace(targetSlug) {
    const { data } = await api.post('/auth/switch-workspace', { targetSlug })
    const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
    window.location.href = `https://${targetSlug}.${appDomain}/auth?token=${data.token}`
  }

  function logout() {
    api.post('/auth/logout').catch(() => {})
    localStorage.removeItem('token')
    localStorage.removeItem('workspaceSlug')
    setUser(null)
  }

  function updateUser(updates) {
    setUser(prev => ({ ...prev, ...updates }))
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, loginWithToken, switchWorkspace, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
