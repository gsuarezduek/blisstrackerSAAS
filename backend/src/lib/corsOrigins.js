// Chequeo de origen compartido entre el CORS de Express (app.js) y el de Socket.IO
// (lib/socket.js) — acepta cualquier subdominio de APP_DOMAIN + localhost en dev.
const APP_DOMAIN = process.env.APP_DOMAIN || 'blisstracker.app'
const SUBDOMAIN_REGEX = new RegExp(`^https://[a-z0-9-]+\\.${APP_DOMAIN.replace('.', '\\.')}$`)

// En local el workspace es http://<slug>.localhost:5173 (Vite). Mismos puertos
// que el login central: el dev server y el preview.
const LOCAL_ORIGIN = /^http:\/\/(?:[a-z0-9-]+\.)?(?:localhost|127\.0\.0\.1):(5173|4173)$/

function isAllowedOrigin(origin) {
  if (!origin) return true // server-to-server / curl
  return (
    SUBDOMAIN_REGEX.test(origin) ||
    origin === `https://${APP_DOMAIN}` ||
    LOCAL_ORIGIN.test(origin)
  )
}

module.exports = { isAllowedOrigin, APP_DOMAIN }
