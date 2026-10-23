jest.mock('axios')
jest.mock('../../src/lib/prisma', () => ({}))
const axios = require('axios')
const { fetchMetaAdsData, buildWebsitePurchases } = require('../../src/services/metaAds.service')

const PIXEL = { id: 'px1', name: 'Tienda', last_fired_time: '2026-10-20T10:00:00+0000' }
const purchaseActions = n => [
  { action_type: 'offsite_conversion.fb_pixel_purchase', value: String(n) },
  { action_type: 'purchase', value: String(n) },
  { action_type: 'omni_purchase', value: String(n) },
]

describe('buildWebsitePurchases', () => {
  test('cuenta solo el evento del píxel (no repite purchase/omni_purchase) y calcula costo y ROAS', () => {
    const wp = buildWebsitePurchases({
      pixels:    [PIXEL],
      summary:   { actions: purchaseActions(8), action_values: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '1200.5' }] },
      campaigns: [],
      spend:     400,
    })
    expect(wp).toEqual({
      purchases: 8, value: 1200.5, costPerPurchase: 50, roas: 3,
      pixel: { id: 'px1', name: 'Tienda', lastFiredTime: PIXEL.last_fired_time },
    })
  })

  test('sin píxel en la cuenta → null aunque haya compras de otro canal', () => {
    expect(buildWebsitePurchases({ pixels: [], summary: { actions: purchaseActions(3) }, campaigns: [], spend: 10 })).toBeNull()
  })

  test('con píxel pero sin compras ni campañas de ventas → null (mide otra cosa)', () => {
    const summary = { actions: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: '4' }] }
    expect(buildWebsitePurchases({ pixels: [PIXEL], summary, campaigns: [{ objective: 'OUTCOME_LEADS' }], spend: 10 })).toBeNull()
  })

  test('con campaña de ventas y 0 compras → 0 (es un dato)', () => {
    const wp = buildWebsitePurchases({ pixels: [PIXEL], summary: {}, campaigns: [{ objective: 'OUTCOME_SALES' }], spend: 10 })
    expect(wp).toMatchObject({ purchases: 0, costPerPurchase: null, value: null, roas: null })
  })

  test('si no se pudieron leer los píxeles, se apoya en los eventos del píxel', () => {
    expect(buildWebsitePurchases({ pixels: null, summary: { actions: purchaseActions(2) }, campaigns: [], spend: 10 }))
      .toMatchObject({ purchases: 2, pixel: null })
    expect(buildWebsitePurchases({ pixels: null, summary: {}, campaigns: [{ objective: 'OUTCOME_SALES' }], spend: 10 })).toBeNull()
  })
})

test('fetchMetaAdsData pide action_values con atribución unificada y devuelve websitePurchases', async () => {
  axios.get.mockImplementation((url, opts = {}) => {
    if (url.endsWith('/act_1/adspixels')) return Promise.resolve({ data: { data: [PIXEL] } })
    if (url.endsWith('/act_1/campaigns')) return Promise.resolve({ data: { data: [] } })
    if (url.endsWith('/act_1/insights') && opts.params?.level === 'ad') return Promise.resolve({ data: { data: [] } })
    return Promise.resolve({ data: { data: [{ spend: '100', actions: purchaseActions(4) }] } })
  })
  const res = await fetchMetaAdsData('act_1', 'tok')
  const summaryCall = axios.get.mock.calls.find(([url, o]) => url.endsWith('/act_1/insights') && o.params.level !== 'ad')
  expect(summaryCall[1].params.fields).toContain('action_values')
  expect(summaryCall[1].params.use_unified_attribution_setting).toBe(true)
  expect(res.websitePurchases).toMatchObject({ purchases: 4, costPerPurchase: 25 })
})

test('si falla la lectura de píxeles, el resto sigue', async () => {
  axios.get.mockImplementation((url, opts = {}) => {
    if (url.endsWith('/adspixels')) return Promise.reject(new Error('permiso'))
    if (url.endsWith('/campaigns')) return Promise.resolve({ data: { data: [] } })
    if (opts.params?.level === 'ad') return Promise.resolve({ data: { data: [] } })
    return Promise.resolve({ data: { data: [{ spend: '5' }] } })
  })
  const res = await fetchMetaAdsData('act_1', 'tok')
  expect(res.spend).toBe(5)
  expect(res.websitePurchases).toBeNull()
})
