// Endpoints para elegir varias cuentas publicitarias de Meta en un proyecto
// (GET/PUT .../integrations/meta-ads/accounts) y que reconectar no pierda las cuentas.
jest.mock('axios')
jest.mock('../../src/lib/prisma', () => ({
  project:            { findFirst: jest.fn() },
  projectIntegration: { findUnique: jest.fn(), update: jest.fn(), upsert: jest.fn() },
}))
jest.mock('../../src/lib/encryption', () => ({ encrypt: v => `enc(${v})`, decrypt: v => v }))

const axios  = require('axios')
const prisma = require('../../src/lib/prisma')
const {
  getMetaAdsAccounts, setMetaAdsAccounts, connectMetaAdsToken,
} = require('../../src/controllers/integrations.meta.controller')

function mockRes() {
  const res = {}
  res.status = jest.fn(() => res)
  res.json   = jest.fn(() => res)
  return res
}
const req = (body = {}) => ({ params: { id: '5' }, body, workspace: { id: 1 }, user: { userId: 9 } })

// Lo que devuelve /me/adaccounts para el token conectado
function mockAdAccounts(list) {
  axios.get.mockResolvedValue({ data: { data: list } })
}

const integration = (over = {}) => ({
  id: 77, projectId: 5, type: 'meta_ads', propertyId: 'act_1', adAccounts: null,
  accessToken: 'tok', expiresAt: null, ...over,
})

beforeEach(() => {
  jest.resetAllMocks()
  prisma.project.findFirst.mockResolvedValue({ id: 5 })
  prisma.projectIntegration.update.mockImplementation(({ data }) => Promise.resolve(data))
})

describe('GET .../meta-ads/accounts', () => {
  test('lista las cuentas del token marcando las elegidas', async () => {
    prisma.projectIntegration.findUnique.mockResolvedValue(integration())
    mockAdAccounts([
      { id: 'act_2', name: 'Norte', currency: 'ARS', account_status: 1 },
      { id: 'act_1', name: 'Centro', currency: 'ARS', account_status: 1 },
    ])
    const res = mockRes()
    await getMetaAdsAccounts(req(), res, jest.fn())
    const { accounts } = res.json.mock.calls[0][0]
    expect(accounts.map(a => [a.id, a.selected])).toEqual([['act_1', true], ['act_2', false]])
  })

  test('una elegida que el token ya no ve igual aparece (para poder sacarla)', async () => {
    prisma.projectIntegration.findUnique.mockResolvedValue(integration({
      adAccounts: JSON.stringify([{ id: 'act_1', name: 'Centro' }, { id: 'act_3', name: 'Vieja' }]),
    }))
    mockAdAccounts([{ id: 'act_1', name: 'Centro' }])
    const res = mockRes()
    await getMetaAdsAccounts(req(), res, jest.fn())
    expect(res.json.mock.calls[0][0].accounts.find(a => a.id === 'act_3')).toMatchObject({ selected: true, available: false })
  })

  test('sin integración: 404 NOT_CONNECTED', async () => {
    prisma.projectIntegration.findUnique.mockResolvedValue(null)
    const res = mockRes()
    await getMetaAdsAccounts(req(), res, jest.fn())
    expect(res.status).toHaveBeenCalledWith(404)
  })
})

describe('PUT .../meta-ads/accounts', () => {
  beforeEach(() => {
    prisma.projectIntegration.findUnique.mockResolvedValue(integration())
    mockAdAccounts([
      { id: 'act_1', name: 'Centro', currency: 'ARS' },
      { id: 'act_2', name: 'Norte',  currency: 'ARS' },
      { id: 'act_3', name: 'Dólar',  currency: 'USD' },
    ])
  })

  test('guarda la lista; la primera queda como principal', async () => {
    const res = mockRes()
    await setMetaAdsAccounts(req({ accountIds: ['act_2', 'act_1'] }), res, jest.fn())
    const { data } = prisma.projectIntegration.update.mock.calls[0][0]
    expect(data.propertyId).toBe('act_2')
    expect(JSON.parse(data.adAccounts)).toEqual([
      { id: 'act_2', name: 'Norte', currency: 'ARS' },
      { id: 'act_1', name: 'Centro', currency: 'ARS' },
    ])
  })

  test('una sola cuenta vuelve a adAccounts null (el caso de siempre)', async () => {
    const res = mockRes()
    await setMetaAdsAccounts(req({ accountIds: ['act_2'] }), res, jest.fn())
    expect(prisma.projectIntegration.update.mock.calls[0][0].data).toEqual({ propertyId: 'act_2', adAccounts: null })
  })

  test('una cuenta que el token no ve: 400, no se guarda nada', async () => {
    const res = mockRes()
    await setMetaAdsAccounts(req({ accountIds: ['act_1', 'act_999'] }), res, jest.fn())
    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.projectIntegration.update).not.toHaveBeenCalled()
  })

  test('monedas distintas: 400 (los montos no se pueden sumar)', async () => {
    const res = mockRes()
    await setMetaAdsAccounts(req({ accountIds: ['act_1', 'act_3'] }), res, jest.fn())
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json.mock.calls[0][0].error).toMatch(/monedas distintas/)
    expect(prisma.projectIntegration.update).not.toHaveBeenCalled()
  })

  test('lista vacía: 400', async () => {
    const res = mockRes()
    await setMetaAdsAccounts(req({ accountIds: [] }), res, jest.fn())
    expect(res.status).toHaveBeenCalledWith(400)
  })
})

describe('reconectar con token conserva las cuentas', () => {
  test('eligiendo una de las cuentas que ya estaban, quedan todas', async () => {
    prisma.projectIntegration.findUnique.mockResolvedValue({
      propertyId: 'act_1',
      adAccounts: JSON.stringify([{ id: 'act_1', name: 'Centro' }, { id: 'act_2', name: 'Norte' }]),
    })
    mockAdAccounts([{ id: 'act_1', name: 'Centro' }, { id: 'act_2', name: 'Norte' }])
    const res = mockRes()
    await connectMetaAdsToken(req({ accessToken: 'nuevo', adAccountId: 'act_1' }), res, jest.fn())
    const { update } = prisma.projectIntegration.upsert.mock.calls[0][0]
    expect(update.propertyId).toBe('act_1')
    expect(JSON.parse(update.adAccounts).map(a => a.id)).toEqual(['act_1', 'act_2'])
  })
})
