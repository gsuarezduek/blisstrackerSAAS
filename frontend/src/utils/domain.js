const RESERVED_SLUGS = ['www', 'app', 'api', 'mail', 'static', 'cdn']

/**
 * Slug del workspace según el host, o null si este host no es un workspace
 * (dominio raíz, localhost pelado, slug reservado).
 * En local el workspace vive en `<slug>.localhost`, el mismo criterio que
 * `<slug>.blisstracker.app` en producción.
 */
export function workspaceSlugFromHostname(hostname = window.location.hostname) {
  const local = hostname.match(/^([a-z0-9-]+)\.localhost$/)
  if (local) return RESERVED_SLUGS.includes(local[1]) ? null : local[1]

  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  const match = hostname.match(
    new RegExp(`^([a-z0-9-]+)\\.${appDomain.replace(/\./g, '\\.')}$`)
  )
  if (match && !RESERVED_SLUGS.includes(match[1])) return match[1]
  return null
}

/**
 * Devuelve true si el hostname actual es un subdominio real de workspace
 * (ej: bliss.blisstracker.app, o bliss.localhost en desarrollo).
 * Devuelve false para el dominio raíz (blisstracker.app) y localhost.
 */
export function isWorkspaceSubdomain(hostname = window.location.hostname) {
  return workspaceSlugFromHostname(hostname) != null
}
