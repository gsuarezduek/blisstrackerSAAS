// Traducción de un fallo del proveedor a algo que el usuario pueda accionar.
// Las dos fuentes de SEO fallan de formas que se veían iguales desde la app:
// Ahrefs devolvía 403 (API key faltante) y "Actualizar DR" no hacía nada porque
// el valor cacheado tapaba el error; SerpAPI devolvía 429 (cuota del plan
// agotada) y llegaba al navegador como el 502 genérico "un servicio externo no
// está disponible". Acá se fija QUÉ motivo sale de cada falla.

jest.mock('axios')
jest.mock('../../src/lib/prisma')

const axios  = require('axios')
const prisma = require('../../src/lib/prisma')
const { fetchDomainRatingResult, isAhrefsConfigured } = require('../../src/services/ahrefs.service')
const { fetchSerpData } = require('../../src/services/serpApi.service')

function axiosFail(status) {
  const err = new Error(`Request failed with status code ${status}`)
  err.isAxiosError = true
  err.response = { status }
  return err
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.AHREFS_API_KEY
  delete process.env.SERP_API_KEY
})

describe('Ahrefs — Domain Rating', () => {
  it('sin API key no llama a Ahrefs: el motivo es NOT_CONFIGURED', async () => {
    expect(isAhrefsConfigured()).toBe(false)
    const r = await fetchDomainRatingResult('https://ejemplo.com')
    expect(r).toMatchObject({ domainRating: null, error: 'NOT_CONFIGURED' })
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('manda la API key como Bearer (el endpoint "free" también la exige)', async () => {
    process.env.AHREFS_API_KEY = 'key-123'
    axios.get.mockResolvedValue({ data: { domain_rating: { domain_rating: 42 } } })

    const r = await fetchDomainRatingResult('https://www.ejemplo.com/una/pagina')

    expect(r).toMatchObject({ domainRating: 42, error: null, domain: 'ejemplo.com' })
    const [, opts] = axios.get.mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer key-123')
    expect(opts.params.target).toBe('ejemplo.com')
  })

  it.each([
    [403, 'UNAUTHORIZED'],
    [401, 'UNAUTHORIZED'],
    [429, 'RATE_LIMITED'],
    [500, 'UPSTREAM'],
  ])('HTTP %i → %s', async (status, error) => {
    process.env.AHREFS_API_KEY = 'key-123'
    axios.get.mockRejectedValue(axiosFail(status))
    await expect(fetchDomainRatingResult('ejemplo.com')).resolves.toMatchObject({ domainRating: null, error })
  })

  it('URL inválida no gasta una consulta', async () => {
    process.env.AHREFS_API_KEY = 'key-123'
    await expect(fetchDomainRatingResult('')).resolves.toMatchObject({ error: 'INVALID_URL' })
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('un fallo con DR cacheado devuelve el valor viejo PERO también el motivo', async () => {
    process.env.AHREFS_API_KEY = 'key-123'
    axios.get.mockRejectedValue(axiosFail(403))
    const { refreshProjectDomainRating } = require('../../src/services/ahrefs.service')

    const r = await refreshProjectDomainRating({ id: 1, websiteUrl: 'ejemplo.com', domainRating: 30, domainRatingAt: new Date('2026-01-01') })

    expect(r.domainRating).toBe(30)        // no se pierde lo que había
    expect(r.error).toBe('UNAUTHORIZED')   // pero el refresh no fue un éxito
    expect(prisma.project.update).not.toHaveBeenCalled()
  })
})

describe('SerpAPI', () => {
  it('sin API key: 503 declarado, sin llamar afuera', async () => {
    await expect(fetchSerpData('zapatos')).rejects.toMatchObject({
      status: 503, code: 'SERP_NOT_CONFIGURED', isOperational: true,
    })
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('429 = el plan se quedó sin búsquedas, no un rate limit por minuto', async () => {
    process.env.SERP_API_KEY = 'k'
    axios.get.mockRejectedValue(axiosFail(429))

    // 503 y no 429: un 429 lo lee el panel de SERP como el cooldown de 15 min
    // propio del refresh y mostraría "probá en 15 min", que no es lo que pasa.
    await expect(fetchSerpData('zapatos')).rejects.toMatchObject({
      status: 503, code: 'SERP_QUOTA_EXCEEDED', isOperational: true,
    })
    await expect(fetchSerpData('zapatos')).rejects.toThrow(/cuota mensual/i)
  })

  it('200 con el error de cuota en el body se trata igual que el 429', async () => {
    process.env.SERP_API_KEY = 'k'
    axios.get.mockResolvedValue({ data: { error: 'Your account has run out of searches.' } })
    await expect(fetchSerpData('zapatos')).rejects.toMatchObject({ code: 'SERP_QUOTA_EXCEEDED' })
  })

  it('401 se distingue de la cuota: la key es el problema', async () => {
    process.env.SERP_API_KEY = 'k'
    axios.get.mockRejectedValue(axiosFail(401))
    await expect(fetchSerpData('zapatos')).rejects.toMatchObject({ code: 'SERP_UNAUTHORIZED', status: 502 })
  })

  it('un error de red cualquiera sigue siendo del proveedor (502 genérico)', async () => {
    process.env.SERP_API_KEY = 'k'
    const netErr = Object.assign(new Error('socket hang up'), { isAxiosError: true })
    axios.get.mockRejectedValue(netErr)
    await expect(fetchSerpData('zapatos')).rejects.toBe(netErr)
  })
})
