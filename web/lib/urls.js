// Única fuente de los hosts del proyecto. Después de separar el sitio público de la
// app hay DOS dominios en juego y mezclarlos rompe cosas distintas:
//
//   SITE_URL  el sitio público (apex) — es el CANÓNICO: canonicals, OG, sitemap.
//   APP_URL   la app (SPA en app.blisstracker.app) — login, registro, todo lo privado.
//
// Los workspaces de agencias siguen en `<slug>.blisstracker.app` y los sirve la SPA;
// el sitio público nunca les arma links (no los conoce).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://blisstracker.app').replace(/\/$/, '')
export const APP_URL  = (process.env.NEXT_PUBLIC_APP_URL  || 'https://app.blisstracker.app').replace(/\/$/, '')

/** URL absoluta dentro del sitio público. Para canonicals y OG hace falta absoluta. */
export function siteUrl(path = '/') {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/** URL absoluta dentro de la app. Todo CTA de "Ingresar"/"Probar gratis" sale de acá. */
export function appUrl(path = '/') {
  return `${APP_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export const LOGIN_URL    = appUrl('/login')
export const REGISTER_URL = appUrl('/register')
