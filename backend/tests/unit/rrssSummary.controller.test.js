// Las vistas "todos los clientes" de LinkedIn/Facebook/YouTube devuelven los
// mismos campos que Instagram/TikTok (nuevos del mes, interacciones, fecha del
// último dato, objetivos) — el frontend ordena las 5 redes con el mismo panel.

jest.mock('../../src/lib/prisma', () => ({
  linkedinSnapshot:    { findMany: jest.fn() },
  facebookSnapshot:    { findMany: jest.fn() },
  youTubeSnapshot:     { findMany: jest.fn() },
  linkedinFollowerLog: { findMany: jest.fn() },
  facebookFollowerLog: { findMany: jest.fn() },
  youTubeFollowerLog:  { findMany: jest.fn() },
  marketingObjective:  { findMany: jest.fn() },
}))
jest.mock('../../src/services/marketingObjectives.service', () => ({ computeObjectives: jest.fn() }))
jest.mock('../../src/controllers/instagram.controller', () => ({ refreshScrapeForIntegration: jest.fn() }))
jest.mock('../../src/controllers/linkedin.controller',  () => ({ refreshScrapeForIntegration: jest.fn() }))
jest.mock('../../src/controllers/facebook.controller',  () => ({ refreshScrapeForIntegration: jest.fn() }))
jest.mock('../../src/utils/dates', () => ({ todayString: () => '2026-10-15' }))

const prisma = require('../../src/lib/prisma')
const { computeObjectives } = require('../../src/services/marketingObjectives.service')
const { getLinkedinSummary, getFacebookSummary, getYouTubeSummary } = require('../../src/controllers/marketingSummary/rrssSummary.controller')

function run(handler) {
  return new Promise((resolve, reject) => {
    const res = { json: resolve }
    handler({ workspace: { id: 1 } }, res, reject)
  })
}

// Logs: el primer findMany es el del mes en curso, el segundo el del mes anterior.
function mockLogs(model, inMonth, prev) {
  model.findMany.mockResolvedValueOnce(inMonth).mockResolvedValueOnce(prev)
}

beforeEach(() => {
  jest.clearAllMocks()
  prisma.marketingObjective.findMany.mockResolvedValue([])
})

describe('rrssSummary — LinkedIn', () => {
  it('suma interacciones, nuevos del mes (vs cierre del mes anterior) y fecha del último dato', async () => {
    prisma.linkedinSnapshot.findMany.mockResolvedValue([
      { projectId: 5, project: { name: 'Pastiza' }, month: '2026-10', followersCount: 1200, engagementRate: 2.1,
        impressions: 9000, clicks: 80, postsThisMonth: 6, totalLikes: 40, totalComments: 5, totalShares: 3 },
      { projectId: 5, project: { name: 'Pastiza' }, month: '2026-09', followersCount: 1100 },
    ])
    mockLogs(prisma.linkedinFollowerLog,
      [{ projectId: 5, date: '2026-10-02', followersCount: 1180 }, { projectId: 5, date: '2026-10-14', followersCount: 1200 }],
      [{ projectId: 5, followersCount: 1150 }])

    const rows = await run(getLinkedinSummary)
    expect(rows).toHaveLength(1) // solo el snapshot más reciente por proyecto
    expect(rows[0]).toMatchObject({
      projectId: 5, followersCount: 1200, interactions: 48,
      newFollowers: 50, lastDataDate: '2026-10-14',
      objectives: { seguidores: null, interaccion: null },
    })
  })

  it('sin totales de likes/comentarios/compartidos deja interacciones en null', async () => {
    prisma.linkedinSnapshot.findMany.mockResolvedValue([
      { projectId: 7, project: { name: 'X' }, month: '2026-08', followersCount: 10 },
    ])
    mockLogs(prisma.linkedinFollowerLog, [], [])
    const [row] = await run(getLinkedinSummary)
    expect(row.interactions).toBeNull()
    expect(row.newFollowers).toBeNull()
    expect(row.lastDataDate).toBe('2026-08-01')
  })
})

describe('rrssSummary — Facebook', () => {
  it('adjunta el progreso de los objetivos de la red', async () => {
    prisma.facebookSnapshot.findMany.mockResolvedValue([
      { projectId: 9, project: { name: 'Vetta' }, month: '2026-10', followersCount: 500, totalLikes: 10, totalComments: 0, totalShares: 2 },
    ])
    mockLogs(prisma.facebookFollowerLog, [], [])
    prisma.marketingObjective.findMany.mockResolvedValue([{ projectId: 9 }])
    computeObjectives.mockResolvedValue([
      { metric: 'seguidores', detail: { platform: 'facebook' }, target: 100, actual: 40, pct: 40, periodLabel: 'Octubre 2026' },
      { metric: 'seguidores', detail: { platform: 'instagram' }, target: 1, actual: 1, pct: 100, periodLabel: 'Octubre 2026' },
    ])
    const [row] = await run(getFacebookSummary)
    expect(row.interactions).toBe(12)
    expect(row.objectives.seguidores).toEqual({ target: 100, actual: 40, pct: 40, periodLabel: 'Octubre 2026' })
    expect(row.objectives.interaccion).toBeNull()
  })
})

describe('rrssSummary — YouTube', () => {
  it('calcula interacciones a partir de likes + comentarios promedio × videos del mes', async () => {
    prisma.youTubeSnapshot.findMany.mockResolvedValue([
      { projectId: 3, project: { name: 'Canal' }, month: '2026-10', subscriberCount: 900, videosThisMonth: 4, avgLikes: 10.4, avgComments: 1.1 },
    ])
    mockLogs(prisma.youTubeFollowerLog, [], [])
    const [row] = await run(getYouTubeSummary)
    expect(row.followersCount).toBe(900)
    expect(row.interactions).toBe(46)
    expect(row.objectives).toEqual({ seguidores: null, interaccion: null })
  })
})
