jest.mock('../../src/lib/prisma', () => ({
  workspace:            { findUnique: jest.fn() },
  workspaceMember:      { findUnique: jest.fn(), findMany: jest.fn() },
  game:                 { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
  gameVote:             { findMany: jest.fn(), upsert: jest.fn() },
  gameScore:            { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  gameTeam:             { findMany: jest.fn() },
  project:              { findMany: jest.fn() },
  user:                 { findMany: jest.fn() },
  instagramFollowerLog: { findMany: jest.fn() },
  $transaction:         jest.fn((ops) => Promise.all(ops)),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET
const SLUG = 'bliss'
const WS = 1

function authHeader(userId = 1, role = 'member') {
  return `Bearer ${jwt.sign({ userId, workspaceId: WS, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' }, SECRET)}`
}

function mockWorkspace(role = 'member') {
  prisma.workspace.findUnique.mockResolvedValue({ id: WS, slug: SLUG, status: 'active', name: 'Bliss', timezone: 'America/Argentina/Buenos_Aires' })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WS, userId: 1, role, active: true })
}

function voteGame(overrides = {}) {
  return {
    id: 5, workspaceId: WS, type: 'employee_of_month_vote', title: 'Compañero del mes',
    description: null, prize: null, subjectType: 'person', scoring: 'vote',
    config: {}, visibilityRule: { mode: 'always' }, startDate: null, endDate: null,
    status: 'active', winnerSubject: null, createdAt: new Date(), updatedAt: new Date(), teams: [],
    ...overrides,
  }
}

beforeEach(() => { jest.clearAllMocks() })

// ─── Crear ────────────────────────────────────────────────────────────────────

describe('POST /api/gamification/games', () => {
  it('crea una votación (admin) con votos ocultos por defecto', async () => {
    mockWorkspace('admin')
    prisma.game.create.mockResolvedValue(voteGame())

    const res = await request(app)
      .post('/api/gamification/games')
      .set('Authorization', authHeader(1, 'admin'))
      .set('X-Workspace', SLUG)
      .send({ type: 'employee_of_month_vote', title: 'Compañero del mes' })

    expect(res.status).toBe(201)
    expect(res.body.game.scoring).toBe('vote')
    // No se persiste hideLiveResults => oculto por defecto.
    expect(res.body.game.config.hideLiveResults).toBeUndefined()
  })

  it('rechaza tipo inválido', async () => {
    mockWorkspace('admin')
    const res = await request(app)
      .post('/api/gamification/games')
      .set('Authorization', authHeader(1, 'admin')).set('X-Workspace', SLUG)
      .send({ type: 'nope', title: 'X' })
    expect(res.status).toBe(400)
  })

  it('un miembro no-admin no puede crear', async () => {
    mockWorkspace('member')
    const res = await request(app)
      .post('/api/gamification/games')
      .set('Authorization', authHeader(1, 'member')).set('X-Workspace', SLUG)
      .send({ type: 'employee_of_month_vote', title: 'X' })
    expect(res.status).toBe(403)
  })
})

// ─── Votación a ciegas ────────────────────────────────────────────────────────

describe('GET /api/gamification/active — votación en curso', () => {
  it('oculta los puntajes y no expone score por candidato', async () => {
    mockWorkspace('member')
    prisma.game.findMany.mockResolvedValue([voteGame()])
    prisma.gameVote.findMany.mockResolvedValue([]) // sin votos del usuario y sin votos totales
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 2, active: true, user: { id: 2, name: 'Ana', avatar: null } },
      { userId: 3, active: true, user: { id: 3, name: 'Beto', avatar: null } },
    ])

    const res = await request(app)
      .get('/api/gamification/active')
      .set('Authorization', authHeader(1, 'member')).set('X-Workspace', SLUG)

    expect(res.status).toBe(200)
    const g = res.body.games[0]
    expect(g.leaderboard.resultsHidden).toBe(true)
    expect(g.leaderboard.subjects).toHaveLength(2)
    expect(g.leaderboard.subjects[0]).not.toHaveProperty('score')
    expect(g.leaderboard.subjects.map((s) => s.label)).toEqual(['Ana', 'Beto']) // orden por nombre
  })
})

describe('GET /api/gamification/games/:id/leaderboard — finalizado revela', () => {
  it('un juego de votación finalizado muestra los puntajes', async () => {
    mockWorkspace('member')
    prisma.game.findFirst.mockResolvedValue(voteGame({ status: 'finished' }))
    prisma.gameVote.findMany.mockResolvedValue([{ targetUserId: 2 }, { targetUserId: 2 }])
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 2, active: true, user: { id: 2, name: 'Ana', avatar: null } },
      { userId: 3, active: true, user: { id: 3, name: 'Beto', avatar: null } },
    ])

    const res = await request(app)
      .get('/api/gamification/games/5/leaderboard')
      .set('Authorization', authHeader(1, 'member')).set('X-Workspace', SLUG)

    expect(res.status).toBe(200)
    expect(res.body.leaderboard.resultsHidden).toBeUndefined()
    expect(res.body.leaderboard.subjects[0]).toMatchObject({ label: 'Ana', score: 2 })
  })
})

// ─── Voto ─────────────────────────────────────────────────────────────────────

describe('POST /api/gamification/games/:id/vote', () => {
  it('rechaza auto-voto', async () => {
    mockWorkspace('member')
    prisma.game.findFirst.mockResolvedValue(voteGame())
    const res = await request(app)
      .post('/api/gamification/games/5/vote')
      .set('Authorization', authHeader(1, 'member')).set('X-Workspace', SLUG)
      .send({ targetUserId: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/vos mismo/i)
  })

  it('registra el voto y devuelve el ranking enmascarado', async () => {
    mockWorkspace('member')
    prisma.game.findFirst.mockResolvedValue(voteGame())
    prisma.gameVote.upsert.mockResolvedValue({})
    prisma.gameVote.findMany.mockResolvedValue([{ targetUserId: 2 }])
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 2, active: true, user: { id: 2, name: 'Ana', avatar: null } },
    ])

    const res = await request(app)
      .post('/api/gamification/games/5/vote')
      .set('Authorization', authHeader(1, 'member')).set('X-Workspace', SLUG)
      .send({ targetUserId: 2 })

    expect(res.status).toBe(200)
    expect(prisma.gameVote.upsert).toHaveBeenCalled()
    expect(res.body.myVote).toBe('2')
    expect(res.body.leaderboard.resultsHidden).toBe(true)
    expect(res.body.leaderboard.subjects[0]).not.toHaveProperty('score')
  })
})

// ─── Puntajes manuales ────────────────────────────────────────────────────────

describe('PUT /api/gamification/games/:id/scores', () => {
  it('reemplaza los puntajes y devuelve el ranking', async () => {
    mockWorkspace('admin')
    prisma.game.findFirst.mockResolvedValue({
      id: 7, workspaceId: WS, scoring: 'manual', subjectType: 'team', config: {}, status: 'draft',
    })
    prisma.gameScore.deleteMany.mockResolvedValue({ count: 0 })
    prisma.gameScore.createMany.mockResolvedValue({ count: 2 })
    prisma.gameScore.findMany.mockResolvedValue([
      { subjectId: 'a', label: 'Equipo A', points: 3, detail: {} },
      { subjectId: 'b', label: 'Equipo B', points: 9, detail: {} },
    ])
    prisma.gameTeam.findMany.mockResolvedValue([])

    const res = await request(app)
      .put('/api/gamification/games/7/scores')
      .set('Authorization', authHeader(1, 'admin')).set('X-Workspace', SLUG)
      .send({ scores: [{ subjectId: 'a', label: 'Equipo A', points: 3 }, { subjectId: 'b', label: 'Equipo B', points: 9 }] })

    expect(res.status).toBe(200)
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(res.body.leaderboard.subjects.map((s) => s.label)).toEqual(['Equipo B', 'Equipo A'])
  })
})

// ─── Imagen del juego ─────────────────────────────────────────────────────────

describe('imagen del juego', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

  it('rechaza un archivo que no es imagen (400)', async () => {
    mockWorkspace('admin')
    const res = await request(app)
      .post('/api/gamification/games/5/image')
      .set('Authorization', authHeader(1, 'admin')).set('X-Workspace', SLUG)
      .attach('image', Buffer.from('esto no es una imagen'), 'x.png')
    expect(res.status).toBe(400)
  })

  it('sube una imagen PNG válida', async () => {
    mockWorkspace('admin')
    prisma.game.updateMany.mockResolvedValue({ count: 1 })
    const res = await request(app)
      .post('/api/gamification/games/5/image')
      .set('Authorization', authHeader(1, 'admin')).set('X-Workspace', SLUG)
      .attach('image', PNG, 'x.png')
    expect(res.status).toBe(200)
    expect(prisma.game.updateMany).toHaveBeenCalled()
  })

  it('serve devuelve 404 sin imagen (ruta pública, sin auth)', async () => {
    prisma.game.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/gamification/games/5/image')
    expect(res.status).toBe(404)
  })

  it('serve devuelve los bytes con su content-type', async () => {
    prisma.game.findUnique.mockResolvedValue({ imageData: Buffer.from([1, 2, 3]), imageMimeType: 'image/png' })
    const res = await request(app).get('/api/gamification/games/5/image')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('image/png')
  })
})
