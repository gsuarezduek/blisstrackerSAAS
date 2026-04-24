import axios from 'axios'
import { isWorkspaceSubdomain } from '../utils/domain'

// Extrae el slug del workspace desde el hostname.
// En producción: 'bliss.blisstracker.app' → 'bliss'
// En desarrollo: usa VITE_WORKSPACE_SLUG o 'bliss' como fallback
// Slugs reservados que no corresponden a ningún workspace
const RESERVED_SLUGS = ['www', 'app', 'api', 'mail', 'static', 'cdn']

function getWorkspaceSlug() {
  const hostname = window.location.hostname
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  const escapedDomain = appDomain.replace(/\./g, '\\.')
  const match = hostname.match(new RegExp(`^([a-z0-9-]+)\\.${escapedDomain}$`))
  if (match && !RESERVED_SLUGS.includes(match[1])) return match[1]
  // En desarrollo: workspace elegido en el último login tiene prioridad sobre el env var
  return localStorage.getItem('workspaceSlug') || import.meta.env.VITE_WORKSPACE_SLUG || ''
}

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.headers['X-Workspace'] = getWorkspaceSlug()
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      // Solo redirigir al login desde subdominios de workspace.
      // En el dominio raíz (blisstracker.app) dejamos que la app muestre Landing.
      if (isWorkspaceSubdomain()) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export { getWorkspaceSlug }
export default api
