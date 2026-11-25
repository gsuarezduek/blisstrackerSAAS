// Meta Ads con varias cuentas publicitarias en una misma conexión (ej. un cliente
// con dos sucursales, cada una con su cuenta de ads y el mismo Instagram).
jest.mock('axios')
jest.mock('../../src/lib/prisma', () => ({}))
const axios = require('axios')
const { fetchMetaAdsForIntegration, mergeMetaAdsResults } = require('../../src/services/metaAds.service')
const { getMetaAdAccounts, adAccountsOnReconnect } = require('../../src/lib/metaAdAccounts')

beforeEach(() => jest.resetAllMocks())

// ── lib/metaAdAccounts ───────────────────────────────────────────────────────

describe('getMetaAdAccounts', () => {
  test('sin adAccounts: una sola cuenta, la de propertyId (el caso de siempre)', () => {
    expect(getMetaAdAccounts({ propertyId: 'act_1', adAccounts: null }))
      .toEqual([{ id: 'act_1', name: null, currency: null }])
  })

  test('con adAccounts: la lista guardada', () => {
    const adAccounts = JSON.stringify([{ id: 'act_1', name: 'Centro', currency: 'ARS' }, { id: 'act_2', name: 'Norte', currency: 'ARS' }])
    expect(getMetaAdAccounts({ propertyId: 'act_1', adAccounts }).map(a => a.id)).toEqual(['act_1', 'act_2'])
  })

  test('JSON roto o vacío: cae a propertyId', () => {
    expect(getMetaAdAccounts({ propertyId: 'act_9', adAccounts: '{nope' })[0].id).toBe('act_9')
    expect(getMetaAdAccounts({ propertyId: 'act_9', adAccounts: '[]' })[0].id).toBe('act_9')
  })

  test('sin integración o sin cuenta: lista vacía', () => {
    expect(getMetaAdAccounts(null)).toEqual([])
    expect(getMetaAdAccounts({ propertyId: null, adAccounts: null })).toEqual([])
  })
})

describe('adAccountsOnReconnect', () => {
  const two = { propertyId: 'act_1', adAccounts: JSON.stringify([{ id: 'act_1', name: 'A' }, { id: 'act_2', name: 'B' }]) }

  test('reconectar eligiendo una cuenta que ya era parte de la lista la conserva entera', () => {
    const out = adAccountsOnReconnect(two, 'act_2')
    expect(out.propertyId).toBe('act_2')
    expect(JSON.parse(out.adAccounts).map(a => a.id)).toEqual(['act_2', 'act_1'])
  })

  test('elegir una cuenta nueva vuelve al caso de una sola cuenta', () => {
    expect(adAccountsOnReconnect(two, 'act_7')).toEqual({ propertyId: 'act_7', adAccounts: null })
  })

  test('primera conexión (no había integración)', () => {
    expect(adAccountsOnReconnect(null, 'act_1')).toEqual({ propertyId: 'act_1', adAccounts: null })
  })
})

// ── mergeMetaAdsResults ──────────────────────────────────────────────────────

const accountData = (over = {}) => ({
  spend: 100, reach: 1000, impressions: 10000, clicks: 200, ctr: 2, cpm: 10, cpc: 0.5,
  conversions: 10, costPerConversion: 10, resultsBreakdown: [{ actionType: 'lead', value: 10 }],
  websitePurchases: null, campaigns: [], ads: [], topAds: [], datePreset: 'this_month',
  ...over,
})

describe('mergeMetaAdsResults', () => {
  const A = { id: 'act_1', name: 'Centro', currency: 'ARS' }
  const B = { id: 'act_2', name: 'Norte',  currency: 'ARS' }

  test('suma los totales y recalcula los ratios desde los totales (no promedia)', () => {
    const out = mergeMetaAdsResults([
      { account: A, data: accountData() },
      { account: B, data: accountData({ spend: 300, reach: 500, impressions: 30000, clicks: 100, conversions: 0, resultsBreakdown: [{ actionType: 'lead', value: 0 }, { actionType: 'link_click', value: 100 }] }) },
    ])
    expect(out).toMatchObject({
      spend: 400, reach: 1500, reachIsSum: true, impressions: 40000, clicks: 300,
      ctr: 0.75,        // 300 / 40000 — promediar 2% y 0.33% daría 1.17%
      cpm: 10,          // 400 / 40000 * 1000
      cpc: 1.33,        // 400 / 300
      conversions: 10, costPerConversion: 40,
      mixedCurrencies: false,
    })
    expect(out.resultsBreakdown).toEqual([{ actionType: 'lead', value: 10 }, { actionType: 'link_click', value: 100 }])
  })

  test('campañas y anuncios de las dos cuentas, marcados con su cuenta y ordenados', () => {
    const out = mergeMetaAdsResults([
      { account: A, data: accountData({ campaigns: [{ id: 'c1', spend: 50 }], ads: [{ id: 'a1', reach: 10 }] }) },
      { account: B, data: accountData({ campaigns: [{ id: 'c2', spend: 80 }], ads: [{ id: 'a2', reach: 90 }] }) },
    ])
    expect(out.campaigns.map(c => [c.id, c.accountName])).toEqual([['c2', 'Norte'], ['c1', 'Centro']])
    expect(out.ads.map(a => [a.id, a.accountId])).toEqual([['a2', 'act_2'], ['a1', 'act_1']])
    expect(out.topAds.map(a => a.id)).toEqual(['a2', 'a1'])
  })

  test('compras en el sitio: solo de las cuentas donde aplica, con el gasto de ESAS cuentas', () => {
    const out = mergeMetaAdsResults([
      { account: A, data: accountData({ spend: 100, websitePurchases: { purchases: 4, value: 800, pixel: { id: 'px' } } }) },
      { account: B, data: accountData({ spend: 300, websitePurchases: null }) },
    ])
    expect(out.websitePurchases).toEqual({ purchases: 4, value: 800, costPerPurchase: 25, roas: 8, pixel: { id: 'px' } })
  })

  test('sin compras en ninguna cuenta: null (no aplica), no 0', () => {
    const out = mergeMetaAdsResults([{ account: A, data: accountData() }, { account: B, data: accountData() }])
    expect(out.websitePurchases).toBeNull()
  })

  test('desglose por cuenta, con las que fallaron marcadas', () => {
    const out = mergeMetaAdsResults([{ account: A, data: accountData() }], [{ account: B, error: 'sin permiso' }])
    expect(out.accounts).toEqual([
      expect.objectContaining({ id: 'act_1', name: 'Centro', spend: 100, error: null }),
      expect.objectContaining({ id: 'act_2', name: 'Norte', error: 'sin permiso' }),
    ])
  })

  test('avisa si las monedas no coinciden', () => {
    const out = mergeMetaAdsResults([
      { account: A, data: accountData() },
      { account: { ...B, currency: 'USD' }, data: accountData() },
    ])
    expect(out.mixedCurrencies).toBe(true)
  })
})

// ── fetchMetaAdsForIntegration ───────────────────────────────────────────────

// Graph API simulada: cada cuenta gasta lo que diga `spendBy`; `failing` responde error.
function mockGraph({ spendBy, failing = [] }) {
  axios.get.mockImplementation((url) => {
    const act = url.match(/\/(act_\d+)\//)?.[1]
    if (act && failing.includes(act)) {
      return Promise.reject(Object.assign(new Error('fail'), { response: { data: { error: { message: `sin acceso a ${act}` } } } }))
    }
    if (url.endsWith('/campaigns')) return Promise.resolve({ data: { data: [] } })
    if (url.endsWith('/adspixels')) return Promise.resolve({ data: { data: [] } })
    if (url.endsWith('/insights')) {
      return Promise.resolve({ data: { data: [{ spend: String(spendBy[act] ?? 0), impressions: '1000', clicks: '10', reach: '500' }] } })
    }
    return Promise.resolve({ data: {} })
  })
}

const twoAccounts = {
  propertyId: 'act_1',
  adAccounts: JSON.stringify([{ id: 'act_1', name: 'Centro', currency: 'ARS' }, { id: 'act_2', name: 'Norte', currency: 'ARS' }]),
}

describe('fetchMetaAdsForIntegration', () => {
  test('una sola cuenta: mismo shape de siempre (sin desglose)', async () => {
    mockGraph({ spendBy: { act_1: 50 } })
    const out = await fetchMetaAdsForIntegration({ propertyId: 'act_1', adAccounts: null }, 'tok')
    expect(out.spend).toBe(50)
    expect(out.accounts).toBeUndefined()
    expect(out.reachIsSum).toBeUndefined()
  })

  test('dos cuentas: las pide a las dos y las suma', async () => {
    mockGraph({ spendBy: { act_1: 50, act_2: 70 } })
    const out = await fetchMetaAdsForIntegration(twoAccounts, 'tok')
    expect(out.spend).toBe(120)
    expect(out.reach).toBe(1000)
    expect(out.accounts.map(a => [a.id, a.spend])).toEqual([['act_1', 50], ['act_2', 70]])
  })

  test('accountId filtra a una sola de las cuentas', async () => {
    mockGraph({ spendBy: { act_1: 50, act_2: 70 } })
    const out = await fetchMetaAdsForIntegration(twoAccounts, 'tok', 'this_month', null, { accountId: 'act_2' })
    expect(out.spend).toBe(70)
    expect(axios.get.mock.calls.some(([url]) => url.includes('act_1'))).toBe(false)
  })

  test('accountId que no es de la integración: 400 (no se consulta una cuenta ajena)', async () => {
    mockGraph({ spendBy: {} })
    await expect(fetchMetaAdsForIntegration(twoAccounts, 'tok', 'this_month', null, { accountId: 'act_99' }))
      .rejects.toMatchObject({ status: 400 })
    expect(axios.get).not.toHaveBeenCalled()
  })

  test('una cuenta que falla no tumba la otra', async () => {
    mockGraph({ spendBy: { act_1: 50 }, failing: ['act_2'] })
    const out = await fetchMetaAdsForIntegration(twoAccounts, 'tok')
    expect(out.spend).toBe(50)
    expect(out.accounts.find(a => a.id === 'act_2').error).toBe('sin acceso a act_2')
  })

  test('si fallan todas, tira el error (como con una sola cuenta)', async () => {
    mockGraph({ spendBy: {}, failing: ['act_1', 'act_2'] })
    await expect(fetchMetaAdsForIntegration(twoAccounts, 'tok')).rejects.toThrow('fail')
  })
})
