const RESERVED_SLUGS = ['www', 'app', 'api', 'mail', 'static', 'cdn']

/**
 * Devuelve true si el hostname actual es un subdominio real de workspace
 * (ej: bliss.blisstracker.app). Excluye slugs reservados.
 * Devuelve false para el dominio raíz (blisstracker.app) y localhost.
 */
export function isWorkspaceSubdomain(hostname = window.location.hostname) {
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  const match = hostname.match(
    new RegExp(`^([a-z0-9-]+)\\.${appDomain.replace(/\./g, '\\.')}$`)
  )
  return !!(match && !RESERVED_SLUGS.includes(match[1]))
}
