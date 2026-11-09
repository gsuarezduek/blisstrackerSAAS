import axios from 'axios'

// Cruza al subdominio con un código de un solo uso. El JWT de sesión queda en
// el body de estos dos requests, nunca en la URL (Analytics, historial, Referer).
function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')
}

export async function handoffUrl(slug, token) {
  const { data } = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/handoff`, { token })
  const code = encodeURIComponent(data.code)
  const ws = encodeURIComponent(slug)
  // En local el workspace es <slug>.localhost, igual que el subdominio en
  // producción. localhost pelado es la landing y el login central.
  if (isLocalHost(window.location.hostname)) {
    const port = window.location.port ? `:${window.location.port}` : ''
    return `http://${slug}.localhost${port}/auth?code=${code}&ws=${ws}`
  }
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  return `https://${slug}.${appDomain}/auth?code=${code}`
}
