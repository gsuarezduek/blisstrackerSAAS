jest.mock('../../src/lib/prisma', () => ({
  onPageAudit:  { update: jest.fn().mockResolvedValue({}) },
  projectBrief: { findUnique: jest.fn().mockResolvedValue(null) },
  project:      { findUnique: jest.fn().mockResolvedValue({ name: 'Sitio' }) },
}))
jest.mock('../../src/lib/safeUrl', () => ({
  assertPublicUrl: jest.fn().mockResolvedValue(undefined),
  fetchPublicUrl:  jest.fn(),
}))
jest.mock('../../src/lib/tokenBudget', () => ({ hasTokenBudget: jest.fn().mockResolvedValue(false) }))
jest.mock('../../src/lib/claude', () => ({ anthropic: { messages: { create: jest.fn() } } }))
jest.mock('../../src/lib/logTokens', () => ({ logTokens: jest.fn() }))

const prisma = require('../../src/lib/prisma')
const { fetchPublicUrl } = require('../../src/lib/safeUrl')
const { runOnPageAnalysis } = require('../../src/services/onPageAudit.service')

const SEED = 'https://sitio.test/'
const page = (links) => `<html><head><title>Un titulo de prueba suficientemente largo</title></head>
  <body><h1>Hola</h1>${links.map(l => `<a href="${l}">x</a>`).join('')}</body></html>`

function lastUpdateData() {
  const { calls } = prisma.onPageAudit.update.mock
  return calls[calls.length - 1][0].data
}

describe('runOnPageAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('completa la auditoría y no vuelve a chequear como rotas las páginas ya rastreadas', async () => {
    fetchPublicUrl.mockResolvedValue({ status: 200, data: page(['/a']) })

    await runOnPageAnalysis(1, 10, 20, SEED, 30)

    const data = lastUpdateData()
    expect(data.errorMsg).toBeNull()
    expect(data.status).toBe('completed')
    expect(data.pagesCrawled).toBe(2)
    // Una vez por página del crawl: ninguna repetida por el chequeo de enlaces rotos.
    expect(fetchPublicUrl).toHaveBeenCalledTimes(2)
  })
})
