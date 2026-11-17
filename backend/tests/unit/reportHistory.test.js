jest.mock('../../src/lib/prisma', () => ({
  analyticsSnapshot:     { findMany: jest.fn() },
  searchConsoleSnapshot: { findMany: jest.fn() },
  instagramSnapshot:     { findMany: jest.fn() },
  tikTokSnapshot:        { findMany: jest.fn() },
  youTubeSnapshot:       { findMany: jest.fn() },
  linkedinSnapshot:      { findMany: jest.fn() },
  facebookSnapshot:      { findMany: jest.fn() },
  adsSnapshot:           { findMany: jest.fn() },
  backlinkSnapshot:      { findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { loadReportHistory, buildSourceHistory, SOURCES } = require('../../src/services/monthlyReport/history')

beforeEach(() => {
  Object.values(prisma).forEach(model => {
    model.findMany.mockReset()
    model.findMany.mockResolvedValue([])
  })
})

const MONTHS = ['2026-04', '2026-05', '2026-06']
const metric = (h, key) => h.metrics.find(m => m.key === key)

describe('buildSourceHistory', () => {
  it('ordena los valores según la ventana y deja null los meses sin snapshot', () => {
    const h = buildSourceHistory(SOURCES.analytics, [
      { month: '2026-06', sessions: 300, newUsers: 30, pageviews: 900, conversions: 3 },
      { month: '2026-04', sessions: 100, newUsers: 10, pageviews: 400, conversions: 1 },
    ], MONTHS)
    expect(metric(h, 'sessions').values).toEqual([100, null, 300])
    expect(metric(h, 'sessions')).toMatchObject({ format: 'number', chart: 'bar', invert: false })
  })

  it('"seguidores nuevos" es la diferencia contra el mes anterior (puede ser negativa) y usa el mes previo a la ventana', () => {
    const h = buildSourceHistory(SOURCES.instagram, [
      { month: '2026-03', followersCount: 1000 },
      { month: '2026-04', followersCount: 1100 },
      { month: '2026-05', followersCount: 1080 },
      { month: '2026-06', followersCount: 1200 },
    ], MONTHS)
    expect(metric(h, 'newFollowers').values).toEqual([100, -20, 120])
  })

  it('sin el mes anterior no inventa "nuevos"', () => {
    const h = buildSourceHistory(SOURCES.instagram, [
      { month: '2026-04', followersCount: 1100, reach: 500 },
      { month: '2026-06', followersCount: 1200, reach: 700 },
    ], MONTHS)
    expect(metric(h, 'newFollowers')).toBeUndefined()
    expect(metric(h, 'reach').values).toEqual([500, null, 700])
  })

  it('CTR de Search Console pasa a porcentaje y la posición media es línea invertida (0 = sin dato)', () => {
    const h = buildSourceHistory(SOURCES.seo, [
      { month: '2026-04', clicks: 10, impressions: 100, ctr: 0.1,  avgPosition: 12.345 },
      { month: '2026-05', clicks: 20, impressions: 200, ctr: 0.05, avgPosition: 0 },
      { month: '2026-06', clicks: 30, impressions: 300, ctr: 0.1,  avgPosition: 9.5 },
    ], MONTHS)
    expect(metric(h, 'ctr').values).toEqual([10, 5, 10])
    expect(metric(h, 'avgPosition')).toMatchObject({ values: [12.35, null, 9.5], chart: 'line', invert: true })
  })

  it('descarta métricas con menos de 2 meses de dato y devuelve null si no queda ninguna', () => {
    expect(buildSourceHistory(SOURCES.analytics, [{ month: '2026-06', sessions: 1 }], MONTHS)).toBeNull()
  })
})

describe('loadReportHistory', () => {
  const base = {
    projectId: 7, workspaceId: 1, dataMonth: '2026-06',
    period: { start: '2026-06-01', end: '2026-06-30' }, multiMonth: false, monthsCovered: ['2026-06'],
  }

  it('solo consulta las secciones presentes en el informe', async () => {
    prisma.analyticsSnapshot.findMany.mockResolvedValue([
      { month: '2026-05', sessions: 10, newUsers: 1, pageviews: 1, conversions: 0 },
      { month: '2026-06', sessions: 20, newUsers: 2, pageviews: 2, conversions: 1 },
    ])
    const h = await loadReportHistory({ ...base, sections: { analytics: {}, instagram: null } })
    expect(prisma.instagramSnapshot.findMany).not.toHaveBeenCalled()
    expect(h.months).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'])
    expect(h.highlight).toEqual(['2026-06'])
    expect(h.partialMonth).toBeNull()
    expect(Object.keys(h.sections)).toEqual(['analytics'])
    // Pide también el mes anterior a la ventana (para los "nuevos" del primer mes)
    expect(prisma.analyticsSnapshot.findMany.mock.calls[0][0].where.month.in[0]).toBe('2025-12')
  })

  it('devuelve null si ninguna sección tiene historia suficiente', async () => {
    expect(await loadReportHistory({ ...base, sections: { analytics: {} } })).toBeNull()
    expect(await loadReportHistory({ ...base, sections: {} })).toBeNull()
  })

  it('marca el mes como parcial si el período termina antes de fin de mes', async () => {
    prisma.analyticsSnapshot.findMany.mockResolvedValue([
      { month: '2026-05', sessions: 10 }, { month: '2026-06', sessions: 5 },
    ])
    const h = await loadReportHistory({ ...base, period: { start: '2026-06-01', end: '2026-06-15' }, sections: { analytics: {} } })
    expect(h.partialMonth).toBe('2026-06')
  })

  it('Ads: el mes del informe sale de la sección (dato en vivo) y no del snapshot', async () => {
    prisma.adsSnapshot.findMany.mockResolvedValue([
      { month: '2026-05', spend: 100, clicks: 50, conversions: 2, ctr: 1 },
      { month: '2026-06', spend: 999, clicks: 999, conversions: 99, ctr: 9 },
    ])
    const h = await loadReportHistory({ ...base, sections: { googleAds: { cost: 200, clicks: 80, conversions: 4, ctr: 2 } } })
    expect(prisma.adsSnapshot.findMany.mock.calls[0][0].where.type).toBe('google_ads')
    const spend = metric(h.sections.googleAds, 'spend')
    expect(spend.values.slice(-2)).toEqual([100, 200])
    expect(spend.format).toBe('money')
  })

  it('un error de una fuente no rompe el resto', async () => {
    prisma.searchConsoleSnapshot.findMany.mockRejectedValue(new Error('boom'))
    prisma.analyticsSnapshot.findMany.mockResolvedValue([
      { month: '2026-05', sessions: 10 }, { month: '2026-06', sessions: 20 },
    ])
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const h = await loadReportHistory({ ...base, sections: { analytics: {}, seo: {} } })
    expect(Object.keys(h.sections)).toEqual(['analytics'])
    warn.mockRestore()
  })
})

describe('historial de autoridad y enlaces', () => {
  it('los dominios de referencia van como línea: son un acumulado, no un volumen del mes', () => {
    // Pintados como barras se leerían "en abril conseguimos 30 dominios, en mayo 34",
    // cuando 34 ES el total, no lo nuevo del mes.
    const h = buildSourceHistory(SOURCES.authority, [
      { month: '2026-04', referringDomains: 30, newLinks: 4, lostLinks: 0, domainRating: 40 },
      { month: '2026-05', referringDomains: 34, newLinks: 5, lostLinks: 1, domainRating: 41 },
      { month: '2026-06', referringDomains: 38, newLinks: 6, lostLinks: 2, domainRating: 44 },
    ], MONTHS)
    expect(metric(h, 'referringDomains')).toMatchObject({ chart: 'line', values: [30, 34, 38] })
    expect(metric(h, 'newLinks')).toMatchObject({ chart: 'bar', values: [4, 5, 6] })
  })

  it('los enlaces conseguidos y perdidos van como barras, que es lo que pasó en el mes', () => {
    const h = buildSourceHistory(SOURCES.authority, [
      { month: '2026-04', newLinks: 4, lostLinks: 0 },
      { month: '2026-06', newLinks: 6, lostLinks: 2 },
    ], MONTHS)
    expect(metric(h, 'lostLinks').values).toEqual([0, null, 2])
  })

  it('un mes sin snapshot queda en null y no en cero', () => {
    const h = buildSourceHistory(SOURCES.authority, [
      { month: '2026-04', referringDomains: 30 },
      { month: '2026-06', referringDomains: 38 },
    ], MONTHS)
    expect(metric(h, 'referringDomains').values).toEqual([30, null, 38])
  })

  it('con un solo mes de datos no hay serie que comparar', () => {
    const h = buildSourceHistory(SOURCES.authority, [{ month: '2026-06', referringDomains: 38 }], MONTHS)
    expect(h).toBeNull()
  })

  it('la serie se pide al snapshot mensual de enlaces, scopeada al proyecto', async () => {
    prisma.backlinkSnapshot.findMany.mockResolvedValue([
      { month: '2026-05', referringDomains: 34, newLinks: 5, lostLinks: 1, domainRating: 41 },
      { month: '2026-06', referringDomains: 38, newLinks: 6, lostLinks: 2, domainRating: 44 },
    ])
    const out = await loadReportHistory({
      projectId: 7, workspaceId: 1, dataMonth: '2026-06',
      period: { end: '2026-06-30' }, multiMonth: false, monthsCovered: ['2026-06'],
      sections: { authority: {} },
    })
    expect(prisma.backlinkSnapshot.findMany).toHaveBeenCalled()
    const where = prisma.backlinkSnapshot.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ projectId: 7, workspaceId: 1 })
    expect(out.sections.authority).toBeTruthy()
    expect(metric(out.sections.authority, 'referringDomains').values.slice(-2)).toEqual([34, 38])
  })

  it('sin la sección en el informe no se consulta el snapshot', async () => {
    // El historial no puede filtrar datos de una sección que el informe no incluye.
    await loadReportHistory({
      projectId: 7, workspaceId: 1, dataMonth: '2026-06',
      period: { end: '2026-06-30' }, multiMonth: false, monthsCovered: ['2026-06'],
      sections: { analytics: {} },
    })
    expect(prisma.backlinkSnapshot.findMany).not.toHaveBeenCalled()
  })
})
