const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')

// Verifica el JWT de propósito acotado emitido tras validar el código OTP.
// Adjunta req.clientPortal (fila de ProjectClientPortal) — nunca req.user.
//
// req.clientPortalContact identifica QUIÉN de los contactos autorizados inició
// sesión — puede ser null: los tokens emitidos antes de la migración a
// multi-contacto no llevan `contactId` y siguen siendo válidos por su ventana
// de 30 días (no se pueden invalidar sin cortarle "Datos en vivo" a todo
// cliente activo). Los endpoints que necesitan identidad (aprobar, comentar —
// F7) chequean req.clientPortalContact ellos mismos y devuelven 403
// CONTACT_REQUIRED si es null, forzando un re-login silencioso una sola vez.
async function clientPortalAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  try {
    const token = header.slice(7)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    if (decoded.purpose !== 'client-portal-live') {
      return res.status(401).json({ error: 'Invalid token' })
    }
    const portal = await prisma.projectClientPortal.findUnique({ where: { id: decoded.portalId } })
    if (!portal || !portal.active || portal.slug !== req.params.slug) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    req.clientPortal = portal
    req.clientPortalContact = null
    if (decoded.contactId) {
      const contact = await prisma.clientPortalContact.findUnique({ where: { id: decoded.contactId } })
      // Contacto desactivado o movido a otro portal ⇒ token inválido — la
      // revocación es inmediata pese al JWT de 30 días.
      if (!contact || !contact.active || contact.portalId !== portal.id) {
        return res.status(401).json({ error: 'Invalid token' })
      }
      req.clientPortalContact = contact
    }

    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

module.exports = { clientPortalAuth }
