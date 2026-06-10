jest.mock('../../src/lib/prisma', () => ({
  marketingObjective: { findMany: jest.fn() },
  analyticsSnapshot:  { findMany: jest.fn() },
  pageSpeedResult:    { findFirst: jest.fn() },
  keywordRanking:     { findFirst: jest.fn() },
  instagramSnapshot:  { findMany: jest.fn() },
  tikTokSnapshot:     { findMany: jest.fn() },
  linkedinSnapshot:   { findMany: jest.fn() },
  competitorSnapshot: { findMany: jest.fn() },
  adsSnapshot:        { findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { computeObjectives } = require('../../src/services/marketingObjectives.service')

function resetAll() {
  Object.values(prisma).forEach(model => Object.values(model).forEach(fn => fn.mockReset?.()))
  // defaults: vacío
  prisma.analyticsSnapshot.findMany.mockResolvedValue([])
  prisma.instagramSnapshot.findMany.mockResolvedValue([])
  prisma.tikTokSnapshot.findMany.mockResolvedValue([])
  prisma.linkedinSnapshot.findMany.mockResolvedValue([])
  prisma.competitorSnapshot.findMany.mockResolvedValue([])
  prisma.adsSnapshot.findMany.mockResolvedValue([])
  prisma.pageSpeedResult.findFirst.mockResolvedValue(null)
  prisma.keywordRanking.findFirst.mockResolvedValue(null)
}

const CTX = { projectId: 1, workspaceId: 1, dataMonth: '2026-05' }

beforeEach(resetAll)

it('visitas trimestral suma las sesiones de los meses del trimestre', async () => {
  prisma.marketingObjective.findMany.mockResolvedValue([
    { id: 1, projectId: 1, workspaceId: 1, category: 'web', metric: 'visitas', periodicity: 'quarterly', target: 1000 },
  ])
  prisma.analyticsSnapshot.findMany.mockResolvedValue([
    { month: '2026-04', sessions: 300, conversions: 5 },
    { month: '2026-05', sessions: 450, conversions: 8 },
  ])

  const [r] = await computeObjectives(CTX)
  expect(r.actual).toBe(750)
  expect(r.pct).toBe(75)
  expect(r.status).toBe('partial')
  expect(r.periodLabel).toBe('Q2 2026')
  expect(r.detail).toMatchObject({ monthsWithData: 2, monthsExpected: 2 })
})

it('leads usa conversions y marca ok al superar el target', async () => {
  prisma.marketingObjective.findMany.mockResolvedValue([
    { id: 2, projectId: 1, workspaceId: 1, category: 'web', metric: 'leads', periodicity: 'monthly', target: 5 },
  ])
  prisma.analyticsSnapshot.findMany.mockResolvedValue([{ month: '2026-05', sessions: 1, conversions: 9 }])
  const [r] = await computeObjectives(CTX)
  expect(r.actual).toBe(9)
  expect(r.pct).toBe(180)
  expect(r.status).toBe('ok')
})

it('posicionamiento es "menor es mejor" (pct invertido)', async () => {
  prisma.marketingObjective.findMany.mockResolvedValue([
    { id: 3, projectId: 1, workspaceId: 1, category: 'seo', metric: 'posicionamiento', periodicity: 'monthly', target: 5, trackedKeywordId: 10, trackedKeyword: { id: 10, query: 'diseño web' } },
  ])
  prisma.keywordRanking.findFirst.mockResolvedValue({ position: 3, month: '2026-05' })
  const [r] = await computeObjectives(CTX)
  expect(r.actual).toBe(3)
  expect(r.pct).toBe(167)         // target/actual = 5/3
  expect(r.status).toBe('ok')
  expect(r.label).toContain('diseño web')
})

it('objetivo huérfano (keyword borrada) → status orphaned', async () => {
  prisma.marketingObjective.findMany.mockResolvedValue([
    { id: 4, projectId: 1, workspaceId: 1, category: 'seo', metric: 'posicionamiento', periodicity: 'monthly', target: 5, trackedKeywordId: null, trackedKeyword: null },
  ])
  const [r] = await computeObjectives(CTX)
  expect(r.status).toBe('orphaned')
  expect(r.actual).toBeNull()
})

it('seguidores nuevos suma el delta de todas las redes', async () => {
  prisma.marketingObjective.findMany.mockResolvedValue([
    { id: 5, projectId: 1, workspaceId: 1, category: 'rrss', metric: 'seguidores', periodicity: 'monthly', target: 100 },
  ])
  // base = 2026-04 (mes anterior al inicio del período mensual)
  prisma.instagramSnapshot.findMany.mockResolvedValue([{ month: '2026-04', followersCount: 1000 }, { month: '2026-05', followersCount: 1050 }])
  prisma.tikTokSnapshot.findMany.mockResolvedValue([{ month: '2026-04', followersCount: 500 }, { month: '2026-05', followersCount: 530 }])
  prisma.linkedinSnapshot.findMany.mockResolvedValue([])
  const [r] = await computeObjectives(CTX)
  expect(r.actual).toBe(80)   // +50 IG, +30 TikTok
  expect(r.detail.breakdown).toHaveLength(3)
})

it('seguidores con platform=instagram solo cuenta esa red', async () => {
  prisma.marketingObjective.findMany.mockResolvedValue([
    { id: 51, projectId: 1, workspaceId: 1, category: 'rrss', metric: 'seguidores', periodicity: 'monthly', target: 100, platform: 'instagram' },
  ])
  // IG +50; TikTok tiene datos pero NO debe sumarse
  prisma.instagramSnapshot.findMany.mockResolvedValue([{ month: '2026-04', followersCount: 1000 }, { month: '2026-05', followersCount: 1050 }])
  prisma.tikTokSnapshot.findMany.mockResolvedValue([{ month: '2026-04', followersCount: 500 }, { month: '2026-05', followersCount: 530 }])
  const [r] = await computeObjectives(CTX)
  expect(r.actual).toBe(50)                 // solo Instagram
  expect(r.pct).toBe(50)
  expect(r.detail.platform).toBe('instagram')
  expect(r.detail.breakdown).toHaveLength(1)
  expect(r.label).toContain('Instagram')
  // no debió consultar TikTok ni LinkedIn para esta métrica por red
  expect(prisma.tikTokSnapshot.findMany).not.toHaveBeenCalled()
  expect(prisma.linkedinSnapshot.findMany).not.toHaveBeenCalled()
})

it('interaccion con platform=tiktok solo cuenta TikTok', async () => {
  prisma.marketingObjective.findMany.mockResolvedValue([
    { id: 52, projectId: 1, workspaceId: 1, category: 'rrss', metric: 'interaccion', periodicity: 'monthly', target: 1000, platform: 'tiktok' },
  ])
  prisma.tikTokSnapshot.findMany.mockResolvedValue([{ month: '2026-05', avgLikes: 10, avgComments: 2, avgShares: 1, postsThisMonth: 20 }])
  const [r] = await computeObjectives(CTX)
  expect(r.actual).toBe(260)                // (10+2+1)*20
  expect(r.detail.platform).toBe('tiktok')
  expect(r.detail.breakdown).toHaveLength(1)
  expect(r.label).toContain('TikTok')
  expect(prisma.instagramSnapshot.findMany).not.toHaveBeenCalled()
})

it('seguidores sin platform (todas) mantiene detail.platform null', async () => {
  prisma.marketingObjective.findMany.mockResolvedValue([
    { id: 53, projectId: 1, workspaceId: 1, category: 'rrss', metric: 'seguidores', periodicity: 'monthly', target: 100, platform: null },
  ])
  prisma.instagramSnapshot.findMany.mockResolvedValue([{ month: '2026-04', followersCount: 1000 }, { month: '2026-05', followersCount: 1050 }])
  const [r] = await computeObjectives(CTX)
  expect(r.detail.platform).toBeNull()
  expect(r.detail.breakdown).toHaveLength(3)
  expect(r.label).toContain('todas las redes')
})

it('inversion en ads es informativo (status info + delta)', async () => {
  prisma.marketingObjective.findMany.mockResolvedValue([
    { id: 6, projectId: 1, workspaceId: 1, category: 'ads', metric: 'inversion', periodicity: 'monthly', target: 500, platform: 'meta_ads' },
  ])
  prisma.adsSnapshot.findMany.mockResolvedValue([{ month: '2026-05', spend: 620, clicks: 100, ctr: 2, impressions: 5000 }])
  const [r] = await computeObjectives(CTX)
  expect(r.actual).toBe(620)
  expect(r.status).toBe('info')
  expect(r.detail.delta).toBe(120)
})

it('ads sin snapshot ni live → disconnected', async () => {
  prisma.marketingObjective.findMany.mockResolvedValue([
    { id: 7, projectId: 1, workspaceId: 1, category: 'ads', metric: 'clicks', periodicity: 'monthly', target: 100, platform: 'google_ads' },
  ])
  const [r] = await computeObjectives(CTX)
  expect(r.status).toBe('disconnected')
})

it('competidores arma head-to-head aunque vayamos perdiendo', async () => {
  prisma.marketingObjective.findMany.mockResolvedValue([
    { id: 8, projectId: 1, workspaceId: 1, category: 'rrss', metric: 'competidores', periodicity: 'monthly', target: 0, competitorId: 99, competitor: { id: 99, username: 'rival', displayName: 'Rival SA' } },
  ])
  prisma.instagramSnapshot.findMany.mockResolvedValue([{ month: '2026-05', followersCount: 1000, engagementRate: 1.5, avgLikes: 50 }])
  prisma.competitorSnapshot.findMany.mockResolvedValue([{ month: '2026-05', followersCount: 5000, engagementRate: 3.0, avgLikes: 200 }])
  const [r] = await computeObjectives(CTX)
  expect(r.detail.headToHead).toBeDefined()
  expect(r.detail.headToHead.metrics).toHaveLength(3)
  expect(r.status).toBe('fail')   // perdemos en engagement
  expect(r.label).toContain('Rival SA')
})

it('sin objetivos devuelve array vacío', async () => {
  prisma.marketingObjective.findMany.mockResolvedValue([])
  expect(await computeObjectives(CTX)).toEqual([])
})
