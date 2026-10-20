jest.mock('axios')
jest.mock('../../src/lib/prisma', () => ({}))
const axios = require('axios')
const { fetchMetaAdsData } = require('../../src/services/metaAds.service')

const adRow = (id, extra = {}) => ({
  ad_id: id, ad_name: `Ad ${id}`, campaign_id: 'c1', campaign_name: 'Camp',
  spend: '10', reach: '100', impressions: '200', clicks: '5', ctr: '2.5',
  inline_post_engagement: '7', video_play_actions: [{ action_type: 'video_view', value: '30' }],
  ...extra,
})

function mockGraph({ pages }) {
  axios.get.mockImplementation((url, opts = {}) => {
    if (url.endsWith('/act_1/campaigns')) return Promise.resolve({ data: { data: [] } })
    if (url.endsWith('/act_1/insights') && opts.params?.level !== 'ad') return Promise.resolve({ data: { data: [{ spend: '0' }] } })
    if (url.endsWith('/act_1/insights')) return Promise.resolve({ data: pages[0] })
    if (url.startsWith('NEXT')) return Promise.resolve({ data: pages[Number(url.slice(4))] })
    // Lote de creativos (?ids=)
    const ids = opts.params.ids.split(',')
    return Promise.resolve({ data: Object.fromEntries(ids.map(id => [id, { effective_status: 'ACTIVE', creative: { thumbnail_url: `t-${id}` } }])) })
  })
}

beforeEach(() => jest.resetAllMocks())

test('allAds pagina todas las páginas y completa estado + miniatura', async () => {
  mockGraph({ pages: [
    { data: [adRow('a1'), adRow('a2', { reach: '900' })], paging: { next: 'NEXT1' } },
    { data: [adRow('a3', { spend: '0', impressions: '0' })] },
  ] })
  const res = await fetchMetaAdsData('act_1', 'tok', 'this_month', null, { allAds: true })
  // a3 sin actividad se descarta; orden por alcance desc
  expect(res.ads.map(a => a.id)).toEqual(['a2', 'a1'])
  expect(res.ads[0]).toMatchObject({ status: 'ACTIVE', thumbnailUrl: 't-a2', engagement: 7, videoViews: 30, campaignName: 'Camp' })
  expect(res.topAds).toHaveLength(2)
})

test('sin allAds corta en 25 y no sigue paginando', async () => {
  const page0 = Array.from({ length: 30 }, (_, i) => adRow(`a${i}`))
  mockGraph({ pages: [{ data: page0, paging: { next: 'NEXT1' } }, { data: [adRow('extra')] }] })
  const res = await fetchMetaAdsData('act_1', 'tok', 'this_month')
  expect(res.ads).toHaveLength(25)
  expect(res.topAds).toHaveLength(10)
  expect(axios.get.mock.calls.some(([url]) => url.startsWith('NEXT'))).toBe(false)
})

test('si falla el insights por anuncio, devuelve el resto sin anuncios', async () => {
  axios.get.mockImplementation((url, opts = {}) => {
    if (opts.params?.level === 'ad') return Promise.reject(new Error('rate limit'))
    if (url.endsWith('/campaigns')) return Promise.resolve({ data: { data: [] } })
    return Promise.resolve({ data: { data: [{ spend: '5' }] } })
  })
  const res = await fetchMetaAdsData('act_1', 'tok')
  expect(res.spend).toBe(5)
  expect(res.ads).toEqual([])
})
