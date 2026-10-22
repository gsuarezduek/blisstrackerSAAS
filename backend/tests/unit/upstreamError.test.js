const { AuthenticationError, RateLimitError } = require('@anthropic-ai/sdk')
const { isUpstreamError, httpStatusFor } = require('../../src/lib/upstreamError')

const headers = new Headers({ 'request-id': 'req_test' })

describe('httpStatusFor', () => {
  it('un 401 de Anthropic (API key inválida) no se reenvía como 401', () => {
    const err = new AuthenticationError(401, { type: 'authentication_error', message: 'invalid x-api-key' }, undefined, headers)
    expect(isUpstreamError(err)).toBe(true)
    expect(httpStatusFor(err)).toBe(502)
  })

  it('otros errores de Anthropic también son 502', () => {
    const err = new RateLimitError(429, { type: 'rate_limit_error' }, undefined, headers)
    expect(httpStatusFor(err)).toBe(502)
  })

  it('un error de axios contra un tercero es 502', () => {
    const err = Object.assign(new Error('Request failed with status code 401'), { isAxiosError: true, status: 401 })
    expect(httpStatusFor(err)).toBe(502)
  })

  it('cualquier 401 que llegue al handler global se degrada a 502', () => {
    expect(httpStatusFor(Object.assign(new Error('x'), { status: 401 }))).toBe(502)
  })

  it('respeta los status propios de la app', () => {
    expect(httpStatusFor(Object.assign(new Error('x'), { status: 403 }))).toBe(403)
    expect(httpStatusFor(Object.assign(new Error('x'), { status: 429, code: 'TOKEN_BUDGET_EXCEEDED' }))).toBe(429)
    expect(httpStatusFor(new Error('x'))).toBe(500)
  })
})
