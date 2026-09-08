import axios from 'axios'
import { getToken, getWorkspaceSlug, clearSession } from './session'

// Mismo criterio que frontend/src/api/client.js, adaptado a mobile: no hay
// subdominio para resolver el workspace, así que el slug elegido en el login
// (ver AuthContext) se guarda en SecureStore y viaja en X-Workspace en cada
// request. Sin slug guardado (primer login) el header simplemente no se manda
// — el backend responde con la lista de workspaces del usuario en ese caso.
const api = axios.create({
  baseURL: `${process.env.EXPO_PUBLIC_API_URL}/api`,
  timeout: 15000,
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
    // Sin `response` = nunca llegó al servidor (sin conexión, DNS, timeout).
    // Todas las pantallas ya leen `err.response?.data?.error || '<fallback
    // propio>'` — sintetizar esto acá, en un solo lugar, hace que las 15+
    // pantallas muestren "sin conexión" en vez de su fallback genérico
    // ("no pudimos cargar tus tareas"), sin tener que tocar cada una.
    if (!err.response) {
      const timedOut = err.code === 'ECONNABORTED'
      err.response = {
        data: {
          error: timedOut
            ? 'La conexión tardó demasiado. Probá de nuevo.'
            : 'Sin conexión. Revisá tu internet e intentá de nuevo.',
        },
      }
    }
    return Promise.reject(err)
  }
)

export default api
