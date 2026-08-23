const { normalizePhone } = require('../../src/lib/phone')

describe('normalizePhone', () => {
  it('deja solo dígitos con un + adelante', () => {
    expect(normalizePhone('+54 9 11 2345-6789')).toBe('+5491123456789')
    expect(normalizePhone('(011) 4444-5555')).toBe('+01144445555')
  })
  it('devuelve null si no queda ningún dígito', () => {
    expect(normalizePhone('N/A')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
  })
  it('es idempotente sobre un valor ya normalizado', () => {
    expect(normalizePhone('+5491123456789')).toBe('+5491123456789')
  })
})
