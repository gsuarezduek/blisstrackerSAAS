// Proveedores de Mailing: qué errores se reintentan, cuáles invalidan la
// configuración, y que el SMTP no pueda apuntar a la red interna (SSRF).
jest.mock('dns', () => ({ promises: { lookup: jest.fn() } }))
const dns = require('dns').promises
const resend = require('../../src/services/mailing/providers/resend')
const smtp = require('../../src/services/mailing/providers/smtp')

describe('resend.classify', () => {
  it('auth/permisos invalidan la configuración entera', () => {
    expect(resend.classify({ statusCode: 401, name: 'missing_api_key' })).toMatchObject({ fatal: true, retryable: false })
    expect(resend.classify({ statusCode: 403, name: 'validation_error' })).toMatchObject({ fatal: true })
  })
  it('rate limit, 5xx y errores de red se reintentan', () => {
    expect(resend.classify({ statusCode: 429, name: 'rate_limit_exceeded' })).toMatchObject({ retryable: true, fatal: false })
    expect(resend.classify({ statusCode: 500, name: 'application_error' })).toMatchObject({ retryable: true })
    expect(resend.classify({ statusCode: null, name: 'application_error' })).toMatchObject({ retryable: true })
  })
  it('un 422 de validación es permanente pero no fatal', () => {
    expect(resend.classify({ statusCode: 422, name: 'validation_error' })).toEqual({ retryable: false, fatal: false })
  })
})

describe('smtp.classify', () => {
  it('4xx temporal, 5xx permanente, EAUTH fatal, conexión caída corta el lote', () => {
    expect(smtp.classify({ responseCode: 451 })).toMatchObject({ retryable: true, fatal: false })
    expect(smtp.classify({ responseCode: 550 })).toEqual({ retryable: false, fatal: false })
    expect(smtp.classify({ code: 'EAUTH', responseCode: 535 })).toMatchObject({ fatal: true })
    expect(smtp.classify({ code: 'ECONNECTION' })).toMatchObject({ retryable: true, abort: true })
  })
})

describe('smtp.assertPublicSmtpHost', () => {
  beforeEach(() => dns.lookup.mockReset())

  it('rechaza puertos fuera de los de SMTP', async () => {
    await expect(smtp.assertPublicSmtpHost('smtp.x.com', 6379)).rejects.toThrow(/Puerto/)
  })
  it('rechaza hosts locales e IPs privadas', async () => {
    await expect(smtp.assertPublicSmtpHost('localhost', 587)).rejects.toThrow()
    await expect(smtp.assertPublicSmtpHost('10.0.0.5', 587)).rejects.toThrow(/privada/)
    await expect(smtp.assertPublicSmtpHost('169.254.169.254', 25)).rejects.toThrow(/privada/)
  })
  it('rechaza un dominio que resuelve a una IP privada', async () => {
    dns.lookup.mockResolvedValue([{ address: '192.168.1.10' }])
    await expect(smtp.assertPublicSmtpHost('mail.trampa.com', 587)).rejects.toThrow(/privada/)
  })
  it('acepta un host público', async () => {
    dns.lookup.mockResolvedValue([{ address: '142.250.0.108' }])
    await expect(smtp.assertPublicSmtpHost('smtp.gmail.com', 587)).resolves.toBeUndefined()
  })
})
