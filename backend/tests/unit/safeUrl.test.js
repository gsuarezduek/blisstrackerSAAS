/**
 * fetchPublicUrl — GET sobre una URL de usuario que revalida CADA salto de un
 * redirect. Con `maxRedirects` nativo de axios solo se validaba la URL original:
 * un host público podía responder 302 hacia la red interna (metadata de la nube)
 * y axios lo seguía. Las URLs usan IPs literales para no depender del DNS.
 */
jest.mock('axios')
const axios = require('axios')
const { fetchPublicUrl, assertPublicUrl } = require('../../src/lib/safeUrl')

const PUBLIC = 'http://93.184.216.34/cal.ics'

beforeEach(() => axios.get.mockReset())

describe('fetchPublicUrl', () => {
  it('no sigue un redirect hacia la red interna', async () => {
    axios.get.mockResolvedValueOnce({ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })
    await expect(fetchPublicUrl(PUBLIC)).rejects.toThrow(/privada/i)
    // El salto prohibido nunca se pide.
    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('sigue un redirect público y nunca delega los redirects en axios', async () => {
    axios.get
      .mockResolvedValueOnce({ status: 301, headers: { location: '/otro.ics' } })
      .mockResolvedValueOnce({ status: 200, headers: {}, data: 'BEGIN:VCALENDAR' })
    const res = await fetchPublicUrl(PUBLIC, { maxRedirects: 3 })
    expect(res.data).toBe('BEGIN:VCALENDAR')
    expect(axios.get).toHaveBeenNthCalledWith(2, 'http://93.184.216.34/otro.ics', expect.objectContaining({ maxRedirects: 0 }))
    expect(axios.get.mock.calls.every(([, opts]) => opts.maxRedirects === 0)).toBe(true)
  })

  it('corta después de maxRedirects saltos', async () => {
    axios.get.mockResolvedValue({ status: 302, headers: { location: PUBLIC } })
    await expect(fetchPublicUrl(PUBLIC, { maxRedirects: 2 })).rejects.toThrow(/redirects/i)
    expect(axios.get).toHaveBeenCalledTimes(3)
  })

  it('aplica validateStatus solo a la respuesta final', async () => {
    axios.get.mockResolvedValueOnce({ status: 404, headers: {} })
    await expect(fetchPublicUrl(PUBLIC, { validateStatus: s => s < 300 })).rejects.toThrow(/404/)
  })
})

describe('assertPublicUrl', () => {
  it.each([
    'http://127.0.0.1/', 'http://10.0.0.5/', 'http://169.254.169.254/', 'http://localhost/', 'file:///etc/passwd',
  ])('rechaza %s', async url => {
    await expect(assertPublicUrl(url)).rejects.toThrow()
  })
})
