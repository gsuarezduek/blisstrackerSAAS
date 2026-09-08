import axios from 'axios'
import { getToken, getWorkspaceSlug, clearSession } from './session'

// Mismo criterio que frontend/src/api/client.js, adaptado a mobile: no hay
// subdominio para resolver el workspace, así que el slug elegido en el login
// (ver AuthContext) se guarda en SecureStore y viaja en X-Workspace en cada
// request. Sin slug guardado (primer login) el header simplemente no se manda
// — el backend responde con la lista de workspaces del usuario en ese caso.
const api = axios.create({
  baseURL: `${process.env.EXPO_PUBLIC_API_URL}/api`,
})

api.interceptors.request.use(async config => {
  const [token, slug] = await Promise.all([getToken(), getWorkspaceSlug()])
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (slug) config.headers['X-Workspace'] = slug
  return config
})

// El listener de sesión vencida se registra desde AuthContext (necesita poder
// resetear el estado de React, no solo el storage).
let onUnauthorized = null
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401) {
      await clearSession()
      onUnauthorized?.()
    }
    return Promise.reject(err)
  }
)

export default api
