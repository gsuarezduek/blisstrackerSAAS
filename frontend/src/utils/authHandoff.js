import axios from 'axios'
import { isPreviewHost, workspaceHostLabel } from './domain'

// Cruza al subdominio con un código de un solo uso. El JWT de sesión queda en
// el body de estos dos requests, nunca en la URL (Analytics, historial, Referer).
function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')
}

// `preview`: cruzar a la dirección de prueba del workspace (`<slug>--preview…`).
// Por default se queda en la misma variante en la que ya estamos, así cambiar de
// workspace desde la de prueba no te devuelve a producción; el login central
// (dominio raíz) lo pasa explícito, porque ahí el host actual no dice nada.
export async function handoffUrl(slug, token, { preview = isPreviewHost() } = {}) {
  const { data } = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/handoff`, { token })
  const code = encodeURIComponent(data.code)
  const ws = encodeURIComponent(slug)
  const label = workspaceHostLabel(slug, preview)
  // En local el workspace es <slug>.localhost, igual que el subdominio en
  // producción. localhost pelado es la landing y el login central.
  if (isLocalHost(window.location.hostname)) {
    const port = window.location.port ? `:${window.location.port}` : ''
    return `http://${label}.localhost${port}/auth?code=${code}&ws=${ws}`
  }
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  return `https://${label}.${appDomain}/auth?code=${code}`
}
