/**
 * Único lugar donde se arman las URLs públicas del producto.
 *
 * Después de separar el sitio público de la app hay TRES bases distintas, y confundirlas
 * manda a la gente a un lugar que no existe:
 *
 *   siteUrl()       el sitio público: `https://blisstracker.app`. Landing, precios,
 *                   soluciones, blog y legales. Es el dominio CANÓNICO. No tiene login
 *                   ni ninguna ruta de la app.
 *   appUrl()        la app: `https://app.blisstracker.app`. Login central, registro,
 *                   /join de las invitaciones, bajas de mailing, /oauth-result.
 *   workspaceUrl()  el workspace de una agencia: `https://<slug>.blisstracker.app`.
 *                   Todo lo que ya tiene contexto de workspace (dashboard, informes de
 *                   cliente, propuestas, archivos compartidos).
 *
 * Antes de la separación, `appUrl` y `siteUrl` eran la misma cosa (el dominio raíz
 * servía la landing y la app con el mismo bundle), así que el código las mezclaba: hay
 * links de invitación y de baja de mailing armados sobre el raíz. El raíz ahora los
 * redirige con 301, pero los nuevos tienen que salir derecho al host correcto.
 */
// Todo se lee de process.env en cada llamada, no al cargar el módulo: así un script o
// un test puede cambiar el entorno sin tener que reimportar, y no hay dos variables con
// momentos de lectura distintos (que es justo el tipo de detalle que después sorprende).
const appDomain = () => process.env.APP_DOMAIN || 'blisstracker.app'

const strip = (url) => String(url || '').replace(/\/$/, '')
const join  = (base, path) => `${base}${!path || path === '/' ? '/' : (path.startsWith('/') ? path : `/${path}`)}`

/** Base del sitio público. `SITE_URL` la puede sobrescribir (ej: un dominio de prueba). */
function siteBase() {
  return strip(process.env.SITE_URL) || `https://${appDomain()}`
}

/**
 * Base de la app. `APP_URL` manda; si no está, se deriva `app.<APP_DOMAIN>`.
 * `FRONTEND_URL` queda como último recurso para entornos sin APP_DOMAIN (el
 * `.env.example` la trae en `http://localhost:5173`).
 */
function appBase() {
  if (process.env.APP_URL) return strip(process.env.APP_URL)
  if (process.env.APP_DOMAIN) return `https://app.${appDomain()}`
  return strip(process.env.FRONTEND_URL) || 'http://localhost:5173'
}

/** Base del subdominio de un workspace. */
function workspaceBase(slug) {
  return `https://${slug}.${appDomain()}`
}

/** URL en el sitio público. */
function siteUrl(path = '/') {
  return join(siteBase(), path)
}

/** URL en la app. */
function appUrl(path = '/') {
  return join(appBase(), path)
}

/** URL dentro del workspace `slug`. Sin slug cae a la app (login central). */
function workspaceUrl(slug, path = '/') {
  return slug ? join(workspaceBase(slug), path) : appUrl(path)
}

/**
 * Base a la que volver después de un flujo de OAuth o de Stripe.
 *
 * Conserva la regla que ya tenía el código: en desarrollo, el frontend local
 * (`FRONTEND_URL`); en producción, el subdominio del workspace cuando se lo conoce. Lo
 * que cambia es el caso sin slug en producción —un error de OAuth antes de poder leer
 * el state—, que antes caía en el dominio raíz y ahí ya no hay `/oauth-result`.
 */
function oauthReturnBase(slug = null) {
  if (process.env.NODE_ENV !== 'production') {
    return strip(process.env.FRONTEND_URL) || 'http://localhost:5173'
  }
  return slug ? workspaceBase(slug) : appBase()
}

module.exports = { appDomain, siteUrl, appUrl, workspaceUrl, oauthReturnBase, siteBase, appBase, workspaceBase }
