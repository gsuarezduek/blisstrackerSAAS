jest.mock('../../src/lib/prisma', () => ({
  workspace:            { findUnique: jest.fn() },
  workspaceMember:      { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  game:                 { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), aggregate: jest.fn() },
  gameVote:             { findMany: jest.fn(), upsert: jest.fn(), count: jest.fn() },
  gameScore:            { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  gameQuestion:         { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn(), groupBy: jest.fn() },
  gameQuizSubmission:   { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
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

beforeEach(() => {
  jest.clearAllMocks()
  prisma.game.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } })
})

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

describe('PUT /api/gamification/games/reorder', () => {
  it('asigna sortOrder según el orden recibido, solo a juegos del workspace', async () => {
    mockWorkspace('admin')
    // El juego 99 es de otro workspace: no está en owned → se ignora.
    prisma.game.findMany.mockResolvedValue([{ id: 3 }, { id: 1 }])

    const res = await request(app)
      .put('/api/gamification/games/reorder')
      .set('Authorization', authHeader(1, 'admin')).set('X-Workspace', SLUG)
      .send({ orderedIds: [3, 1, 99] })

    expect(res.status).toBe(200)
    // Se actualiza 3 → sortOrder 0 y 1 → sortOrder 1 (99 se descarta).
    expect(prisma.game.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { sortOrder: 0 } })
    expect(prisma.game.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { sortOrder: 1 } })
    expect(prisma.game.update).toHaveBeenCalledTimes(2)
  })

  it('rechaza body sin orderedIds', async () => {
    mockWorkspace('admin')
    const res = await request(app)
      .put('/api/gamification/games/reorder')
      .set('Authorization', authHeader(1, 'admin')).set('X-Workspace', SLUG)
      .send({})
    expect(res.status).toBe(400)
  })

  it('un miembro no-admin no puede reordenar', async () => {
    mockWorkspace('member')
    const res = await request(app)
      .put('/api/gamification/games/reorder')
      .set('Authorization', authHeader(1, 'member')).set('X-Workspace', SLUG)
      .send({ orderedIds: [1, 2] })
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

  it('un finalizado reciente (con finishedAt) se sigue mostrando', async () => {
    mockWorkspace('member')
    prisma.game.findMany.mockResolvedValue([voteGame({
      status: 'finished', winnerSubject: { subjectId: '2', label: 'Ana', score: 3 },
      finishedAt: new Date(), // recién finalizado
    })])
    prisma.gameVote.findMany.mockResolvedValue([])
    prisma.workspaceMember.findMany.mockResolvedValue([{ userId: 2, active: true, user: { id: 2, name: 'Ana', avatar: null } }])

    const res = await request(app)
      .get('/api/gamification/active')
      .set('Authorization', authHeader(1, 'member')).set('X-Workspace', SLUG)
    expect(res.body.games).toHaveLength(1)
    expect(res.body.games[0].finished).toBe(true)
  })

  it('un finalizado sin finishedAt (o reordenado) NO se muestra', async () => {
    mockWorkspace('member')
    prisma.game.findMany.mockResolvedValue([voteGame({
      status: 'finished', winnerSubject: { subjectId: '2', label: 'Ana', score: 3 },
      finishedAt: null, updatedAt: new Date(), // updatedAt reciente no debe revivirlo
    })])
    prisma.gameVote.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/gamification/active')
      .set('Authorization', authHeader(1, 'member')).set('X-Workspace', SLUG)
    expect(res.body.games).toHaveLength(0)
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

// ─── Detalle de votación (admin) ──────────────────────────────────────────────

describe('GET /api/gamification/games/:id (admin) — detalle de votación', () => {
  it('devuelve participación + ranking, pero NO quién votó a quién (voto secreto)', async () => {
    mockWorkspace('admin')
    prisma.game.findFirst.mockResolvedValue(voteGame())
    prisma.gameVote.count.mockResolvedValue(2)
    prisma.gameVote.findMany.mockResolvedValue([{ targetUserId: 2 }, { targetUserId: 2 }]) // para el ranking
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 2, active: true, user: { id: 2, name: 'Ana' } },
      { userId: 3, active: true, user: { id: 3, name: 'Beto' } },
    ])
    prisma.workspaceMember.count.mockResolvedValue(3)

    const res = await request(app)
      .get('/api/gamification/games/5')
      .set('Authorization', authHeader(1, 'admin')).set('X-Workspace', SLUG)

    expect(res.status).toBe(200)
    expect(res.body.participation).toEqual({ voted: 2, eligible: 3 })
    expect(res.body.votes).toBeUndefined()
    // El ranking (no enmascarado para el admin) sí trae el conteo por candidato.
    expect(res.body.leaderboard.subjects[0]).toMatchObject({ label: 'Ana', score: 2 })
  })
})

// ─── Cuestionario ─────────────────────────────────────────────────────────────

describe('PUT /api/gamification/games/:id/questions (admin)', () => {
  function quizGame() { return { id: 7, workspaceId: WS, scoring: 'quiz', subjectType: 'person', config: {}, status: 'draft' } }

  it('rechaza una pregunta sin opción correcta marcada', async () => {
    mockWorkspace('admin')
    prisma.game.findFirst.mockResolvedValue(quizGame())
    const res = await request(app)
      .put('/api/gamification/games/7/questions')
      .set('Authorization', authHeader(1, 'admin')).set('X-Workspace', SLUG)
      .send({ questions: [{ text: '¿2+2?', options: [{ id: 'a', text: '4' }, { id: 'b', text: '5' }], correctOptionId: 'zzz', points: 1 }] })
    expect(res.status).toBe(400)
  })

  it('guarda preguntas válidas', async () => {
    mockWorkspace('admin')
    prisma.game.findFirst.mockResolvedValue(quizGame())
    prisma.gameQuestion.deleteMany.mockResolvedValue({ count: 0 })
    prisma.gameQuestion.createMany.mockResolvedValue({ count: 1 })
    const res = await request(app)
      .put('/api/gamification/games/7/questions')
      .set('Authorization', authHeader(1, 'admin')).set('X-Workspace', SLUG)
      .send({ questions: [{ text: '¿2+2?', options: [{ id: 'a', text: '4' }, { id: 'b', text: '5' }], correctOptionId: 'a', points: 2 }] })
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(1)
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('guarda una pregunta abierta (sin opciones, no puntúa)', async () => {
    mockWorkspace('admin')
    prisma.game.findFirst.mockResolvedValue(quizGame())
    prisma.gameQuestion.deleteMany.mockResolvedValue({ count: 0 })
    prisma.gameQuestion.createMany.mockResolvedValue({ count: 1 })
    const res = await request(app)
      .put('/api/gamification/games/7/questions')
      .set('Authorization', authHeader(1, 'admin')).set('X-Workspace', SLUG)
      .send({ questions: [{ kind: 'open', text: '¿Qué opinás del equipo?' }] })
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(1)
    // La fila persistida es abierta, sin opciones/correcta y con 0 puntos.
    const created = prisma.gameQuestion.createMany.mock.calls[0][0].data[0]
    expect(created).toMatchObject({ kind: 'open', options: [], correctOptionId: null, points: 0 })
  })
})

describe('POST /api/gamification/games/:id/quiz/submit', () => {
  function quizGame() { return { id: 7, workspaceId: WS, scoring: 'quiz', subjectType: 'person', config: {}, status: 'active', visibilityRule: { mode: 'always' } } }

  it('calcula el puntaje y registra la entrega', async () => {
    mockWorkspace('member')
    prisma.game.findFirst.mockResolvedValue(quizGame())
    prisma.gameQuizSubmission.findUnique.mockResolvedValue(null)
    prisma.gameQuestion.findMany.mockResolvedValue([
      { id: 'q1', correctOptionId: 'a', points: 2 },
      { id: 'q2', correctOptionId: 'x', points: 3 },
    ])
    prisma.gameQuizSubmission.create.mockResolvedValue({})

    const res = await request(app)
      .post('/api/gamification/games/7/quiz/submit')
      .set('Authorization', authHeader(1, 'member')).set('X-Workspace', SLUG)
      .send({ answers: [{ questionId: 'q1', optionId: 'a' }, { questionId: 'q2', optionId: 'y' }] })

    expect(res.status).toBe(200)
    expect(res.body.score).toBe(2)      // q1 correcta (2), q2 incorrecta
    expect(res.body.maxScore).toBe(5)
    expect(prisma.gameQuizSubmission.create).toHaveBeenCalled()
  })

  it('rechaza una segunda entrega', async () => {
    mockWorkspace('member')
    prisma.game.findFirst.mockResolvedValue(quizGame())
    prisma.gameQuizSubmission.findUnique.mockResolvedValue({ id: 'sub1', score: 2 })
    const res = await request(app)
      .post('/api/gamification/games/7/quiz/submit')
      .set('Authorization', authHeader(1, 'member')).set('X-Workspace', SLUG)
      .send({ answers: [] })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/ya respondiste/i)
  })

  it('guarda el texto de una pregunta abierta sin sumar puntos', async () => {
    mockWorkspace('member')
    prisma.game.findFirst.mockResolvedValue(quizGame())
    prisma.gameQuizSubmission.findUnique.mockResolvedValue(null)
    prisma.gameQuestion.findMany.mockResolvedValue([
      { id: 'q1', kind: 'multiple_choice', correctOptionId: 'a', points: 2 },
      { id: 'q2', kind: 'open', correctOptionId: null, points: 0 },
    ])
    prisma.gameQuizSubmission.create.mockResolvedValue({})

    const res = await request(app)
      .post('/api/gamification/games/7/quiz/submit')
      .set('Authorization', authHeader(1, 'member')).set('X-Workspace', SLUG)
      .send({ answers: [{ questionId: 'q1', optionId: 'a' }, { questionId: 'q2', text: 'Me gusta mucho' }] })

    expect(res.status).toBe(200)
    expect(res.body.score).toBe(2)   // solo la de opción múltiple puntúa
    expect(res.body.maxScore).toBe(2)
    // El texto abierto se persiste; la abierta figura en results como kind 'open'.
    const savedAnswers = prisma.gameQuizSubmission.create.mock.calls[0][0].data.answers
    expect(savedAnswers).toContainEqual({ questionId: 'q2', text: 'Me gusta mucho' })
    expect(res.body.results.find((r) => r.questionId === 'q2')).toMatchObject({ kind: 'open', text: 'Me gusta mucho', points: 0 })
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
