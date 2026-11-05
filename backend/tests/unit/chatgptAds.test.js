jest.mock('axios')
jest.mock('../../src/lib/prisma', () => ({}))
jest.mock('../../src/lib/encryption', () => ({ decrypt: v => `clear:${v}` }))

const axios = require('axios')
const { fetchChatGptAdsData, resolveRange } = require('../../src/services/chatgptAds.service')

const TZ = 'America/Argentina/Buenos_Aires'
const integration = { accessToken: 'enc-key', propertyId: 'acct_1' }

// Respuestas por defecto de la API de anuncios de ChatGPT. Cada test sobreescribe
// sólo lo que le interesa.
function mockAds({ account, totals, campaigns, ads, campaignList, conversions } = {}) {
  axios.get.mockImplementation((url, opts = {}) => {
    if (url.endsWith('/ad_account')) {
      return Promise.resolve({ data: account ?? {
        id: 'acct_1', account_name: 'Cuenta Demo', status: 'active',
        currency_code: 'USD', timezone: TZ,
      } })
    }
    if (url.endsWith('/ad_account/insights')) {
      const level = opts.params?.aggregation_level
      if (level === 'ad_account') return Promise.resolve({ data: { data: totals ?? [] } })
      if (level === 'campaign')   return Promise.resolve({ data: { data: campaigns ?? [] } })
      return Promise.resolve({ data: { data: ads ?? [] } })
    }
    if (url.endsWith('/campaigns')) return Promise.resolve({ data: { data: campaignList ?? [] } })
    if (url.endsWith('/ads')) {
      const group = opts.params?.ad_group_id
      return Promise.resolve({ data: { data: (conversions?.creativesByGroup ?? {})[group] ?? [] } })
    }
    return Promise.reject(new Error(`URL inesperada: ${url}`))
  })
  axios.post.mockImplementation((url, body = {}) => {
    if (url.endsWith('/conversions/insights')) {
      const rows = conversions?.[body.group_by_entity ? body.aggregation_level : 'total'] ?? []
      return Promise.resolve({ data: { data: rows } })
    }
    return Promise.reject(new Error(`URL inesperada: ${url}`))
  })
}

beforeEach(() => jest.resetAllMocks())

describe('resolveRange', () => {
  // La API no tiene presets: cada botón de la pestaña se traduce a un rango.
  test('las ventanas de N días terminan ayer y las de mes/semana llegan hasta hoy', () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    expect(resolveRange('today', TZ)).toEqual({ since: today, until: today })
    expect(resolveRange('this_month', TZ).until).toBe(today)
    expect(resolveRange('this_month', TZ).since).toBe(`${today.slice(0, 7)}-01`)
    expect(resolveRange('last_7d', TZ).until).not.toBe(today)
    expect(resolveRange('yesterday', TZ).since).toBe(resolveRange('yesterday', TZ).until)
  })

  test('last_month es el mes anterior completo', () => {
    const { since, until } = resolveRange('last_month', TZ)
    expect(since).toMatch(/^\d{4}-\d{2}-01$/)
    expect(until.slice(0, 7)).toBe(since.slice(0, 7))
    // Último día del mes: agregarle un día cambia de mes.
    const [y, m, d] = until.split('-').map(Number)
    expect(new Date(Date.UTC(y, m - 1, d + 1)).getUTCMonth()).not.toBe(m - 1)
  })

  test('un preset desconocido cae en el mes en curso en vez de fallar', () => {
    expect(resolveRange('vaya_a_saber', TZ)).toEqual(resolveRange('this_month', TZ))
  })
})

describe('fetchChatGptAdsData', () => {
  test('normaliza el CTR a porcentaje, los estados a mayúscula y usa el total de la cuenta', async () => {
    mockAds({
      totals: [{ impressions: 1000, clicks: 40, spend: 25.5, ctr: 0.04, cpc: 0.6375, cpm: 25.5 }],
      campaigns: [{ campaign_id: 'cmpn_1', campaign_name: 'Lanzamiento', impressions: 600, clicks: 30, spend: 18, ctr: 0.05, cpc: 0.6 }],
      campaignList: [{ id: 'cmpn_1', name: 'Lanzamiento', status: 'active', objective: 'traffic' }],
    })
    const res = await fetchChatGptAdsData(integration, 'this_month')

    expect(res.ctr).toBe(4)                    // 0.04 ratio → 4%
    expect(res.cost).toBe(25.5)
    expect(res.impressions).toBe(1000)
    expect(res.campaigns[0]).toMatchObject({ id: 'cmpn_1', name: 'Lanzamiento', status: 'ACTIVE', ctr: 5, cost: 18 })
    expect(res.accountName).toBe('Cuenta Demo')
    expect(res.currency).toBe('USD')
    // La key va como Bearer, descifrada.
    expect(axios.get.mock.calls[0][1].headers.Authorization).toBe('Bearer clear:enc-key')
  })

  test('sin fila de nivel cuenta, los totales se suman de las campañas', async () => {
    mockAds({
      totals: [],
      campaigns: [
        { campaign_id: 'c1', campaign_name: 'A', impressions: 100, clicks: 10, spend: 5, ctr: 0.1 },
        { campaign_id: 'c2', campaign_name: 'B', impressions: 100, clicks: 5,  spend: 5, ctr: 0.05 },
      ],
    })
    const res = await fetchChatGptAdsData(integration, 'this_month')
    expect(res.impressions).toBe(200)
    expect(res.clicks).toBe(15)
    expect(res.cost).toBe(10)
    expect(res.ctr).toBe(7.5)
    expect(res.avgCpc).toBe(0.67)
  })

  test('las conversiones son best-effort: si su endpoint falla, el resto carga igual', async () => {
    mockAds({
      totals: [{ impressions: 10, clicks: 1, spend: 1, ctr: 0.1 }],
      campaigns: [{ campaign_id: 'c1', campaign_name: 'A', impressions: 10, clicks: 1, spend: 1, ctr: 0.1 }],
    })
    axios.post.mockRejectedValue({ response: { status: 500, data: { error: { message: 'boom' } } } })

    const res = await fetchChatGptAdsData(integration, 'this_month')
    expect(res.impressions).toBe(10)
    // null, no 0: "sin eventos configurados" no es "cero conversiones".
    expect(res.conversions).toBeNull()
    expect(res.websitePurchaseValue).toBeNull()
    expect(res.roas).toBeNull()
  })

  test('mezcla conversiones y ventas atribuidas por campaña y total', async () => {
    mockAds({
      totals: [{ impressions: 1000, clicks: 50, spend: 100, ctr: 0.05 }],
      campaigns: [{ campaign_id: 'c1', campaign_name: 'A', impressions: 1000, clicks: 50, spend: 100, ctr: 0.05 }],
      conversions: {
        total:    [{ conversions: 12, order_created_attributed_sales: '450.00', attributed_events: [{ event_name: 'order_created', attributed_event_count: 9 }] }],
        campaign: [{ entity_id: 'c1', conversions: 12, order_created_attributed_sales: '450.00' }],
      },
    })
    const res = await fetchChatGptAdsData(integration, 'this_month')
    expect(res.conversions).toBe(12)
    expect(res.websitePurchases).toBe(9)
    expect(res.websitePurchaseValue).toBe(450)
    expect(res.roas).toBe(4.5)
    expect(res.campaigns[0].conversions).toBe(12)
  })

  test('los anuncios traen el creativo del grupo y descartan los que no tuvieron actividad', async () => {
    mockAds({
      totals: [{ impressions: 300, clicks: 12, spend: 9, ctr: 0.04 }],
      ads: [
        { ad_id: 'ad_1', ad_name: 'Card 1', ad_group_id: 'ag_1', campaign_id: 'c1', campaign_name: 'A', impressions: 300, clicks: 12, spend: 9, ctr: 0.04 },
        { ad_id: 'ad_2', ad_name: 'Card 2', ad_group_id: 'ag_1', campaign_id: 'c1', campaign_name: 'A', impressions: 0, clicks: 0, spend: 0, ctr: 0 },
      ],
      conversions: { creativesByGroup: { ag_1: [
        { id: 'ad_1', name: 'Card 1', status: 'paused', review_status: 'approved',
          creative: { type: 'chat_card', title: 'Probá el planner', body: 'Organizá tu semana', image_url: 'https://img/1.png', target_url: 'https://ej.com' } },
      ] } },
    })
    const res = await fetchChatGptAdsData(integration, 'this_month')
    expect(res.ads).toHaveLength(1)
    expect(res.ads[0]).toMatchObject({
      id: 'ad_1', headline: 'Probá el planner', description: 'Organizá tu semana',
      thumbnailUrl: 'https://img/1.png', status: 'PAUSED', type: 'chat_card',
      // El click ES la interacción en un anuncio de ChatGPT.
      engagement: 12,
    })
    expect(res.topAds).toHaveLength(1)
  })

  test('si los insights de nivel anuncio fallan, igual se muestran totales y campañas', async () => {
    mockAds({
      totals: [{ impressions: 500, clicks: 20, spend: 12, ctr: 0.04 }],
      campaigns: [{ campaign_id: 'c1', campaign_name: 'A', impressions: 500, clicks: 20, spend: 12, ctr: 0.04 }],
    })
    const okGet = axios.get.getMockImplementation()
    axios.get.mockImplementation((url, opts = {}) => (
      url.endsWith('/ad_account/insights') && opts.params?.aggregation_level === 'ad'
        ? Promise.reject({ response: { status: 400, data: { error: { message: 'Unknown field: ad_group_id' } } } })
        : okGet(url, opts)
    ))

    const res = await fetchChatGptAdsData(integration, 'this_month')
    expect(res.impressions).toBe(500)
    expect(res.campaigns).toHaveLength(1)
    expect(res.ads).toEqual([])
    expect(res.topAds).toEqual([])
  })

  test('sin allAds pide 25 anuncios; con allAds, el tope de 500', async () => {
    mockAds({ totals: [{ impressions: 1, clicks: 0, spend: 0, ctr: 0 }] })
    await fetchChatGptAdsData(integration, 'this_month')
    const adCall = axios.get.mock.calls.find(([u, o]) => u.endsWith('/ad_account/insights') && o.params?.aggregation_level === 'ad')
    expect(adCall[1].params.limit).toBe(25)

    jest.resetAllMocks()
    mockAds({ totals: [{ impressions: 1, clicks: 0, spend: 0, ctr: 0 }] })
    await fetchChatGptAdsData(integration, 'this_month', null, { allAds: true })
    const allCall = axios.get.mock.calls.find(([u, o]) => u.endsWith('/ad_account/insights') && o.params?.aggregation_level === 'ad')
    expect(allCall[1].params.limit).toBe(500)
  })

  test('un 401 se reporta como TOKEN_EXPIRED y un 403 como PERMISSION_DENIED', async () => {
    axios.get.mockRejectedValue({ response: { status: 401, data: { error: { message: 'Invalid API key' } } } })
    await expect(fetchChatGptAdsData(integration, 'this_month')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED', status: 400 })

    axios.get.mockRejectedValue({ response: { status: 403, data: { error: { message: 'No access' } } } })
    await expect(fetchChatGptAdsData(integration, 'this_month')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })

    axios.get.mockRejectedValue({ response: { status: 429, data: { error: { message: 'Slow down' } } } })
    await expect(fetchChatGptAdsData(integration, 'this_month')).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 })
  })

  test('sin API key guardada no se llama a la API', async () => {
    await expect(fetchChatGptAdsData({ propertyId: 'acct_1' }, 'this_month')).rejects.toMatchObject({ code: 'NO_API_KEY' })
    expect(axios.get).not.toHaveBeenCalled()
  })

  // Esta es la regresión de un bug real que llegó a producción: los tests miraban el
  // OBJETO `params` (donde la clave 'fields[]' está bien escrita) y no la URL que
  // axios termina armando. Con `paramsSerializer: { indexes: null }`, axios le saca
  // los corchetes a las claves de valor array y manda `fields=a&fields=b`, que la API
  // rechaza con "Duplicate parameter: 'fields'". Se verifica con el axios REAL.
  test('los arrays viajan como fields[]=…, no como fields=… repetido', async () => {
    mockAds({ totals: [{ impressions: 1, clicks: 0, spend: 0, ctr: 0 }] })
    await fetchChatGptAdsData(integration, 'this_month')

    const realAxios = jest.requireActual('axios')
    const insightsCalls = axios.get.mock.calls.filter(([u]) => u.endsWith('/ad_account/insights'))
    expect(insightsCalls.length).toBeGreaterThan(0)

    for (const [, opts] of insightsCalls) {
      const url = decodeURIComponent(realAxios.getUri({
        url: '/insights', params: opts.params, paramsSerializer: opts.paramsSerializer,
      }))
      expect(url).toContain('fields[]=impressions')
      expect(url).toContain('fields[]=clicks')
      // Sin corchetes la API responde "Duplicate parameter".
      expect(url).not.toMatch(/[?&]fields=/)
      // Los objetos JSON van en una sola clave con corchetes.
      expect(url).toMatch(/time_ranges\[\]=\{"type":"date_range"/)
    }
  })

  test('un rango explícito gana sobre el preset (lo usan el snapshot y el informe)', async () => {
    mockAds({ totals: [{ impressions: 1, clicks: 0, spend: 0, ctr: 0 }] })
    await fetchChatGptAdsData(integration, 'this_month', { startDate: '2026-09-01', endDate: '2026-09-30' })
    const call = axios.get.mock.calls.find(([u, o]) => u.endsWith('/ad_account/insights') && o.params?.aggregation_level === 'campaign')
    expect(JSON.parse(call[1].params['time_ranges[]'])).toEqual({
      type: 'date_range', since: '2026-09-01', until: '2026-09-30', timezone: TZ,
    })
  })
})
