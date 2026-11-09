const { isAllowedOrigin } = require('../../src/lib/corsOrigins')

describe('isAllowedOrigin', () => {
  it('acepta el login central y el subdominio local del workspace', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedOrigin('http://bliss.localhost:5173')).toBe(true)
    expect(isAllowedOrigin('http://mi-agencia.localhost:4173')).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true)
  })

  it('rechaza otro puerto y otro host', () => {
    expect(isAllowedOrigin('http://bliss.localhost:3001')).toBe(false)
    expect(isAllowedOrigin('http://evil.com')).toBe(false)
    expect(isAllowedOrigin('https://bliss.localhost:5173')).toBe(false)
  })
})
