const MIN_PASSWORD_LENGTH = 8

// Política única de contraseña, compartida por registro, invitación/alta de
// miembro, cambio de contraseña y reset — antes cada endpoint tenía su propio
// mínimo (o ninguno), inconsistente entre sí y con el `minLength` del frontend.
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`
  }
  return null
}

module.exports = { MIN_PASSWORD_LENGTH, validatePassword }
