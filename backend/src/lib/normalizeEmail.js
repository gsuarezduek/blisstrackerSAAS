// User.email es case-sensitive en Postgres (String @unique, sin citext) y ningún
// punto de auth normalizaba el valor: el mismo email con distinto casing generaba
// una cuenta nueva en vez de reusar la existente, y el login fallaba con "Credenciales
// inválidas" (mismo mensaje que password incorrecta) si el casing no coincidía exacto.
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email
}

module.exports = { normalizeEmail }
