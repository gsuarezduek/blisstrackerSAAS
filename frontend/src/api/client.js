import axios from 'axios'
import { isWorkspaceSubdomain } from '../utils/domain'

// Rutas que no requieren sesión (espejo de las rutas públicas de App.jsx). Un 401
// disparado en una de estas páginas (ej: AuthContext validando un JWT viejo/vencido
// que quedó en localStorage de una sesión anterior) no debe expulsar al visitante al
// login — la página en sí nunca pidió autenticación.
const PUBLIC_PATH_PREFIXES = [
  '/report/', '/login', '/register', '/pricing', '/join', '/oauth', '/auth',
  '/oauth-result', '/condiciones', '/privacidad', '/forgot-password',
  '/reset-password', '/verify-email-change', '/soluciones/',
]

function isPublicPagePath(pathname = window.location.pathname) {
  return PUBLIC_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

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
      // Solo redirigir al login desde subdominios de workspace, y nunca desde una
      // página explícitamente pública (ej. el link de informe del cliente): ese 401
      // puede venir de un JWT viejo/vencido que quedó en el navegador de una sesión
      // anterior — no significa que la página actual requiera login.
      if (isWorkspaceSubdomain() && !isPublicPagePath()) {
        window.location.href = '/login'
      }
    }
    // Pago vencido: el backend bloquea toda escritura. Empujamos a Facturación
    // para forzar la activación del plan (salvo que ya estemos ahí).
    if (err.response?.status === 402 && err.response?.data?.code === 'BILLING_PAST_DUE') {
      if (!window.location.pathname.startsWith('/billing')) {
        window.location.href = '/billing'
      }
    }
    // Workspace suspendido/cancelado: no es una sesión inválida (no tocar el token).
    // Avisamos a AuthContext, que ya está montado y puede no haberlo detectado si
    // la suspensión ocurrió después del chequeo inicial de /auth/me.
    if (err.response?.status === 402 && err.response?.data?.code === 'WORKSPACE_SUSPENDED') {
      window.dispatchEvent(new CustomEvent('bliss:workspace-suspended'))
    }
    return Promise.reject(err)
  }
)

export { getWorkspaceSlug }
export default api
