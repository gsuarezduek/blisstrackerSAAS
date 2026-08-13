// Chequeo de origen compartido entre el CORS de Express (app.js) y el de Socket.IO
// (lib/socket.js) — acepta cualquier subdominio de APP_DOMAIN + localhost en dev.
const APP_DOMAIN = process.env.APP_DOMAIN || 'blisstracker.app'
const SUBDOMAIN_REGEX = new RegExp(`^https://[a-z0-9-]+\\.${APP_DOMAIN.replace('.', '\\.')}$`)

function isAllowedOrigin(origin) {
  if (!origin) return true // server-to-server / curl
  return (
    SUBDOMAIN_REGEX.test(origin) ||
    origin === `https://${APP_DOMAIN}` ||
    origin === 'http://localhost:5173' ||
    origin === 'http://localhost:4173'
  )
}

module.exports = { isAllowedOrigin, APP_DOMAIN }
