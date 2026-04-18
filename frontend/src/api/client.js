import axios from 'axios'

// Extrae el slug del workspace desde el hostname.
// En producción: 'bliss.blisstracker.app' → 'bliss'
// En desarrollo: usa VITE_WORKSPACE_SLUG o 'bliss' como fallback
function getWorkspaceSlug() {
  const hostname = window.location.hostname
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  const escapedDomain = appDomain.replace(/\./g, '\\.')
  const match = hostname.match(new RegExp(`^([a-z0-9-]+)\\.${escapedDomain}$`))
  if (match) return match[1]
  // Fallback para desarrollo local
  return import.meta.env.VITE_WORKSPACE_SLUG || 'bliss'
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
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export { getWorkspaceSlug }
export default api
