const RESERVED_SLUGS = ['www', 'app', 'api', 'mail', 'static', 'cdn']

// Dirección de PRUEBA de un workspace: `<slug>--preview.blisstracker.app` (o
// `<slug>--preview.localhost` en local). Es el mismo workspace y le habla al mismo
// backend que producción — lo único distinto es qué versión del frontend la sirve
// (en Vercel ese dominio se asigna a una rama, no a `main`). Se eligió esta forma
// y no `bliss.preview.blisstracker.app` porque el backend ya acepta cualquier
// subdominio de UNA sola parte (lib/corsOrigins.js): no hizo falta tocar el CORS.
// Para que no choque con un workspace real, el backend rechaza slugs con `--`.
export const PREVIEW_SUFFIX = '--preview'

function parseHost(hostname) {
  let label = null
  const local = hostname.match(/^([a-z0-9-]+)\.localhost$/)
  if (local) {
    label = local[1]
  } else {
    const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
    const match = hostname.match(
      new RegExp(`^([a-z0-9-]+)\\.${appDomain.replace(/\./g, '\\.')}$`)
    )
    if (match) label = match[1]
  }
  if (!label) return { slug: null, preview: false }

  const preview = label.endsWith(PREVIEW_SUFFIX)
  const slug = preview ? label.slice(0, -PREVIEW_SUFFIX.length) : label
  if (!slug || RESERVED_SLUGS.includes(slug)) return { slug: null, preview: false }
  return { slug, preview }
}

/**
 * Slug del workspace según el host, o null si este host no es un workspace
 * (dominio raíz, localhost pelado, slug reservado).
 * En local el workspace vive en `<slug>.localhost`, el mismo criterio que
 * `<slug>.blisstracker.app` en producción. La dirección de prueba
 * (`<slug>--preview…`) devuelve el slug real, sin el sufijo.
 */
export function workspaceSlugFromHostname(hostname = window.location.hostname) {
  return parseHost(hostname).slug
}

/**
 * Devuelve true si el hostname actual es un subdominio real de workspace
 * (ej: bliss.blisstracker.app, o bliss.localhost en desarrollo).
 * Devuelve false para el dominio raíz (blisstracker.app) y localhost.
 */
export function isWorkspaceSubdomain(hostname = window.location.hostname) {
  return workspaceSlugFromHostname(hostname) != null
}

/** True si estamos en la dirección de prueba de un workspace (`<slug>--preview…`). */
export function isPreviewHost(hostname = window.location.hostname) {
  return parseHost(hostname).preview
}

/** La etiqueta de subdominio de un workspace: `bliss` o `bliss--preview`. */
export function workspaceHostLabel(slug, preview = false) {
  return preview ? `${slug}${PREVIEW_SUFFIX}` : slug
}

/**
 * Host de la app: donde viven el login central, el registro y el selector de workspace.
 *
 * Antes era el dominio raíz (`blisstracker.app`), que servía la landing Y la app con el
 * mismo bundle. Ahora el raíz es el sitio público —otro proyecto, renderizado en el
 * servidor— y la app vive en `app.blisstracker.app`. Único lugar donde se arma ese host:
 * lo usa el login de un subdominio al rebotar al login central (Login2.jsx), y también
 * sirve para cualquier link de la app hacia sí misma en otro host.
 *
 * En local no cambia nada: la app sigue en `localhost` pelado (el sitio público corre en
 * otro puerto), y `<slug>.localhost` sigue siendo un workspace.
 */
export function appHost() {
  const explicit = import.meta.env.VITE_APP_HOST
  if (explicit) return explicit
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'
  return `app.${appDomain}`
}
