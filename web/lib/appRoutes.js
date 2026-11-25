/**
 * Rutas que ya NO viven en el sitio público: son de la app (la SPA en
 * app.blisstracker.app) y en el apex se responden con un 301 hacia allá.
 *
 * Es una lista explícita y no un catch-all a propósito: si cualquier ruta desconocida
 * se redirigiera a la app, las URLs que no existen dejarían de dar 404 — y el soft 404
 * es uno de los problemas que esta separación viene a arreglar. Lo que no está acá y no
 * es una página pública, es un 404 de verdad.
 *
 * La lista sale de las rutas de frontend/src/App.jsx. Tres grupos:
 *
 *  1. Autenticación y alta. El login central vivía en el dominio raíz
 *     (`https://blisstracker.app/login?from=<slug>`, ver Login2.jsx) y las invitaciones
 *     se mandan por mail como `https://blisstracker.app/join?token=…`
 *     (invitations.controller.js). Esos links ya están en casillas de gente: el 301 los
 *     mantiene vivos.
 *
 *  2. Páginas públicas con token que el backend arma sobre el dominio raíz: la baja de
 *     mailing y la confirmación de suscripción (services/mailing/config.js). Un link de
 *     baja viaja en cada campaña enviada, así que romperlo sería grave.
 *     Se suman /report, /proposal y /shared-* por si quedó alguno viejo: hoy se generan
 *     sobre el subdominio del workspace, no sobre el apex.
 *
 *  3. Rutas privadas de la app. Quien tenga un marcador viejo apuntando al apex (donde
 *     la SPA las servía y derivaba al login) sigue llegando a destino.
 */
export const APP_ROUTE_PREFIXES = [
  // 1. Autenticación y alta
  '/login',
  '/register',
  '/join',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/verify-email-change',
  '/oauth',
  '/oauth-result',
  '/auth',

  // 2. Páginas públicas con token
  '/baja',
  '/suscripcion',
  '/confirmar-suscripcion',
  '/report',
  '/report-print',
  '/proposal',
  '/shared-folder',
  '/shared-file',

  // 3. Rutas privadas
  '/dashboard',
  '/proyectos',
  '/my-projects',
  '/reportes',
  '/my-reports',
  '/reports',
  '/marketing',
  '/contenido',
  '/calendario',
  '/chat',
  '/ventas',
  '/finanzas',
  '/billing',
  '/admin',
  '/superadmin',
  '/profile',
  '/preferences',
  '/docs',
  '/realtime',
  '/juegos',
  '/agentes',
  '/users',
]

/**
 * True si `pathname` es una ruta de la app. Matchea el prefijo exacto o un
 * sub-path (`/admin` y `/admin/rrhh` sí; `/administracion` no — si no, un día una
 * página pública que empiece igual que una ruta privada se iría redirigida sin que
 * nadie se dé cuenta).
 */
export function isAppRoute(pathname) {
  return APP_ROUTE_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}
