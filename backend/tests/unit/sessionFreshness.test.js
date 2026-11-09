const { sessionIsStale } = require('../../src/lib/sessionFreshness')

describe('sessionIsStale', () => {
  const now = Math.floor(Date.now() / 1000)

  it('un usuario sin corte conserva cualquier token', () => {
    expect(sessionIsStale(now - 3600, null)).toBe(false)
  })

  it('un token emitido antes del cambio de contraseña queda revocado', () => {
    expect(sessionIsStale(now - 60, new Date())).toBe(true)
  })

  it('un token emitido en el mismo segundo del cambio sigue vigente', () => {
    const cut = new Date()
    expect(sessionIsStale(Math.floor(cut.getTime() / 1000), cut)).toBe(false)
  })
})
