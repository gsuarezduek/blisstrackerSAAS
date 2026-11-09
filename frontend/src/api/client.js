import axios from 'axios'
import { isWorkspaceSubdomain, workspaceSlugFromHostname } from '../utils/domain'

// Rutas que no requieren sesión (espejo de las rutas públicas de App.jsx). Un 401
// disparado en una de estas páginas (ej: AuthContext validando un JWT viejo/vencido
// que quedó en localStorage de una sesión anterior) no debe expulsar al visitante al
// login — la página en sí nunca pidió autenticación.
const PUBLIC_PATH_PREFIXES = [
  '/report/', '/report-print/', '/login', '/register', '/pricing', '/join', '/oauth', '/auth',
  '/oauth-result', '/condiciones', '/privacidad', '/forgot-password',
  '/reset-password', '/verify-email-change', '/soluciones/', '/blog',
]

function isPublicPagePath(pathname = window.location.pathname) {
  return PUBLIC_PATH_PREFIXES.some(prefix => pathname.startsWith(prefix))
}

// Extrae el slug del workspace desde el hostname.
// En producción: 'bliss.blisstracker.app' → 'bliss'
// En local: 'bliss.localhost' → 'bliss'
// Sin subdominio (localhost pelado): el último login, o VITE_WORKSPACE_SLUG.
function getWorkspaceSlug() {
  return workspaceSlugFromHostname()
    || localStorage.getItem('workspaceSlug')
    || import.meta.env.VITE_WORKSPACE_SLUG
    || ''
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
