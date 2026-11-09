const prisma = require('./prisma')

// `iat` es segundos. sessionValidAfter tiene milisegundos: el token firmado en
// el mismo segundo del cambio sigue valiendo, los anteriores no.
function sessionIsStale(iat, sessionValidAfter) {
  if (sessionValidAfter == null || iat == null) return false
  const validFrom = Math.floor(new Date(sessionValidAfter).getTime() / 1000)
  return Number(iat) < validFrom
}

// true si este JWT ya no es una sesión vigente. Si la lectura no está disponible
// (un mock de test que no stubbea User) no revoca: en producción findUnique
// devuelve la fila o null.
async function sessionRevoked(decoded) {
  if (!decoded?.userId || typeof prisma.user?.findUnique !== 'function') return false
  let user
  try {
    user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { sessionValidAfter: true },
    })
  } catch {
    return false
  }
  if (user === undefined) return false
  if (user === null) return true
  return sessionIsStale(decoded.iat, user.sessionValidAfter)
}

module.exports = { sessionIsStale, sessionRevoked }
