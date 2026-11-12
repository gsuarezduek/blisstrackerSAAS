jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  user:            { findUnique: jest.fn() },
  game:            { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

// El histórico de juegos terminados (el muro de ganadores de la página /juegos).
// `GET /active` solo muestra los finalizados de los últimos 7 días: después desaparecen
// y con ellos quién ganó.

function authHeader(role = 'member') {
  return `Bearer ${jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

function mockWorkspace({ role = 'member', flagOn = true } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]', moduleAccess: null, timezone: 'America/Argentina/Buenos_Aires',
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({
    workspaceId: WORKSPACE_ID, userId: 1, role, active: true,
  })
  prisma.featureFlag.findUnique.mockResolvedValue({
    key: 'gamification', enabledGlobally: flagOn, enabledWorkspaceIds: '[]',
  })
  prisma.user.findUnique.mockResolvedValue({ sessionValidAfter: null })
}

const finishedGame = (over = {}) => ({
  id: 5, workspaceId: WORKSPACE_ID, type: 'competencia', title: 'Mejor compañero',
  description: null, prize: 'Un día libre', subjectType: 'person', scoring: 'vote',
  config: {}, visibilityRule: {}, startDate: null, endDate: null,
  status: 'finished', sortOrder: 0, finishedAt: new Date('2026-10-01'),
  winnerSubject: { subjectId: '3', label: 'Ana', score: 12 },
  imageMimeType: null, createdById: 1, createdAt: new Date(), updatedAt: new Date(),
  teams: [], ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  prisma.game.findMany.mockResolvedValue([])
  prisma.game.count.mockResolvedValue(0)
})

describe('GET /api/gamification/history', () => {
  function get(qs = '', role = 'member') {
    return request(app)
      .get(`/api/gamification/history${qs}`)
      .set('Authorization', authHeader(role))
      .set('X-Workspace', WORKSPACE_SLUG)
  }

  it('está abierto a cualquier miembro, no solo a admin', async () => {
    mockWorkspace({ role: 'member' })
    prisma.game.findMany.mockResolvedValue([finishedGame()])
    prisma.game.count.mockResolvedValue(1)

    const res = await get()
    expect(res.status).toBe(200)
    expect(res.body.games).toHaveLength(1)
    expect(res.body.total).toBe(1)
  })

  it('devuelve el ganador ya persistido, sin recalcular el ranking', async () => {
    mockWorkspace()
    prisma.game.findMany.mockResolvedValue([finishedGame()])
    const res = await get()

    // `winnerSubject` lo dejó `finishGame`. computeLeaderboard es el cálculo caro (para
    // los juegos de métrica pega contra los snapshots de Marketing) y acá no hace falta:
    // el ranking completo está a un clic en /games/:id/leaderboard.
    expect(res.body.games[0].winnerSubject).toEqual({ subjectId: '3', label: 'Ana', score: 12 })
    expect(res.body.games[0].leaderboard).toBeUndefined()
  })

  it('solo trae juegos terminados, los más recientes primero', async () => {
    mockWorkspace()
    await get()

    const call = prisma.game.findMany.mock.calls[0][0]
    expect(call.where).toEqual({
      workspaceId: WORKSPACE_ID, status: 'finished', finishedAt: { not: null },
    })
    expect(call.orderBy).toEqual({ finishedAt: 'desc' })
  })

  it('pagina, con un tope para que nadie se traiga el historial entero', async () => {
    mockWorkspace()
    await get('?take=500&skip=10')

    const call = prisma.game.findMany.mock.calls[0][0]
    expect(call.take).toBe(50)
    expect(call.skip).toBe(10)
  })

  it('un skip negativo no rompe la query', async () => {
    mockWorkspace()
    await get('?skip=-5')
    expect(prisma.game.findMany.mock.calls[0][0].skip).toBe(0)
  })

  it('sin el feature flag responde 403', async () => {
    mockWorkspace({ flagOn: false })
    const res = await get()
    expect(res.status).toBe(403)
  })
})

describe('GET /api/gamification/games/:id/leaderboard', () => {
  it('no deja pedir el ranking de un borrador ni de un archivado', async () => {
    // Antes el where solo filtraba por workspaceId, así que cualquier miembro podía
    // pedir el ranking de un juego que para el equipo todavía no existe.
    mockWorkspace()
    prisma.game.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/gamification/games/9/leaderboard')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(404)
    expect(prisma.game.findFirst.mock.calls[0][0].where.status).toEqual({ in: ['active', 'finished'] })
  })
})
