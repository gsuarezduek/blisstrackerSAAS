jest.mock('../../src/lib/prisma', () => ({
  workspace:            { findUnique: jest.fn() },
  workspaceMember:      { findMany: jest.fn() },
  project:              { findMany: jest.fn() },
  user:                 { findMany: jest.fn() },
  gameTeam:             { findMany: jest.fn() },
  gameVote:             { findMany: jest.fn() },
  gameScore:            { findMany: jest.fn() },
  gameQuizSubmission:   { findMany: jest.fn() },
  instagramFollowerLog: { findMany: jest.fn(), findFirst: jest.fn() },
  tikTokFollowerLog:    { findMany: jest.fn(), findFirst: jest.fn() },
  linkedinFollowerLog:  { findMany: jest.fn(), findFirst: jest.fn() },
  facebookFollowerLog:  { findMany: jest.fn(), findFirst: jest.fn() },
  instagramSnapshot:    { findMany: jest.fn() },
  tikTokSnapshot:       { findMany: jest.fn() },
  linkedinSnapshot:     { findMany: jest.fn() },
  facebookSnapshot:     { findMany: jest.fn() },
  analyticsSnapshot:    { findMany: jest.fn() },
  adsSnapshot:          { findMany: jest.fn() },
  geoAudit:             { findFirst: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const {
  isGameVisible, isInRecurringWindow, ymdString, daysInMonth,
  computeLeaderboard, resolveWinner,
} = require('../../src/services/gamification.service')

const TZ = 'America/Argentina/Buenos_Aires'

beforeEach(() => {
  Object.values(prisma).forEach((m) => Object.values(m).forEach((fn) => fn.mockReset?.()))
  prisma.workspace.findUnique.mockResolvedValue({ timezone: TZ })
})

// ─── Visibilidad ──────────────────────────────────────────────────────────────

describe('isGameVisible', () => {
  test('solo juegos activos pueden estar visibles', () => {
    expect(isGameVisible({ status: 'draft', visibilityRule: { mode: 'always' } })).toBe(false)
    expect(isGameVisible({ status: 'finished', visibilityRule: { mode: 'always' } })).toBe(false)
    expect(isGameVisible({ status: 'active', visibilityRule: { mode: 'always' } })).toBe(true)
  })

  test('mode always = siempre visible mientras activo', () => {
    expect(isGameVisible({ status: 'active', visibilityRule: {} })).toBe(true)
  })

  test('date_range respeta inicio y fin (fin inclusive todo el día)', () => {
    const g = { status: 'active', visibilityRule: { mode: 'date_range' }, startDate: '2026-06-10T00:00:00Z', endDate: '2026-06-20T00:00:00Z' }
    expect(isGameVisible(g, new Date('2026-06-09T12:00:00Z'), TZ)).toBe(false)
    expect(isGameVisible(g, new Date('2026-06-15T12:00:00Z'), TZ)).toBe(true)
    expect(isGameVisible(g, new Date('2026-06-20T23:00:00Z'), TZ)).toBe(true) // fin inclusive
    expect(isGameVisible(g, new Date('2026-06-21T12:00:00Z'), TZ)).toBe(false)
  })
})

describe('isInRecurringWindow — last_n_days_of_month', () => {
  // Junio 2026 tiene 30 días. Última semana (n=7) = días 24..30.
  const rule = { kind: 'last_n_days_of_month', n: 7 }
  test('dentro de la última semana', () => {
    expect(isInRecurringWindow(rule, new Date('2026-06-25T15:00:00Z'), TZ)).toBe(true)
    expect(isInRecurringWindow(rule, new Date('2026-06-30T15:00:00Z'), TZ)).toBe(true)
  })
  test('fuera de la última semana', () => {
    // Junio 30 días: ventana = día >= 24 (30-7+1). El 23 queda afuera.
    expect(isInRecurringWindow(rule, new Date('2026-06-23T15:00:00Z'), TZ)).toBe(false)
    expect(isInRecurringWindow(rule, new Date('2026-06-24T15:00:00Z'), TZ)).toBe(true)
    expect(isInRecurringWindow(rule, new Date('2026-06-10T15:00:00Z'), TZ)).toBe(false)
  })
})

describe('isInRecurringWindow — otros tipos', () => {
  test('first_n_days_of_month', () => {
    expect(isInRecurringWindow({ kind: 'first_n_days_of_month', n: 5 }, new Date('2026-06-03T15:00:00Z'), TZ)).toBe(true)
    expect(isInRecurringWindow({ kind: 'first_n_days_of_month', n: 5 }, new Date('2026-06-09T15:00:00Z'), TZ)).toBe(false)
  })
  test('day_range_of_month', () => {
    const rule = { kind: 'day_range_of_month', fromDay: 10, toDay: 12 }
    expect(isInRecurringWindow(rule, new Date('2026-06-11T15:00:00Z'), TZ)).toBe(true)
    expect(isInRecurringWindow(rule, new Date('2026-06-13T15:00:00Z'), TZ)).toBe(false)
  })
  test('weekdays (0=Dom..6=Sáb)', () => {
    // 2026-06-15 es lunes (weekday 1) en ART.
    expect(isInRecurringWindow({ kind: 'weekdays', weekdays: [1] }, new Date('2026-06-15T15:00:00Z'), TZ)).toBe(true)
    expect(isInRecurringWindow({ kind: 'weekdays', weekdays: [2, 3] }, new Date('2026-06-15T15:00:00Z'), TZ)).toBe(false)
  })
})

describe('helpers de fecha', () => {
  test('daysInMonth', () => {
    expect(daysInMonth(2026, 6)).toBe(30)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
  })
  test('ymdString respeta la TZ (UTC-3)', () => {
    // 2026-06-01T02:00Z = 2026-05-31 23:00 en ART
    expect(ymdString(new Date('2026-06-01T02:00:00Z'), TZ)).toBe('2026-05-31')
  })
})

// ─── Leaderboards ─────────────────────────────────────────────────────────────

describe('computeLeaderboard — vote', () => {
  test('cuenta votos por candidato y ordena desc', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, active: true, user: { id: 1, name: 'Ana', avatar: null } },
      { userId: 2, active: true, user: { id: 2, name: 'Beto', avatar: null } },
      { userId: 3, active: true, user: { id: 3, name: 'Caro', avatar: null } },
    ])
    prisma.gameVote.findMany.mockResolvedValue([
      { targetUserId: 2 }, { targetUserId: 2 }, { targetUserId: 1 },
    ])
    const lb = await computeLeaderboard({ id: 9, workspaceId: 1, scoring: 'vote', config: {} })
    expect(lb.subjects.map((s) => [s.label, s.score])).toEqual([['Beto', 2], ['Ana', 1], ['Caro', 0]])
    expect(lb.totalVotes).toBe(3)
  })

  test('respeta candidateIds acotados', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, active: true, user: { id: 1, name: 'Ana' } },
      { userId: 2, active: true, user: { id: 2, name: 'Beto' } },
    ])
    prisma.gameVote.findMany.mockResolvedValue([{ targetUserId: 1 }])
    const lb = await computeLeaderboard({ id: 9, workspaceId: 1, scoring: 'vote', config: { candidateIds: [1] } })
    expect(lb.subjects).toHaveLength(1)
    expect(lb.subjects[0].label).toBe('Ana')
  })
})

describe('computeLeaderboard — manual', () => {
  test('ordena por puntos desc y usa label del row', async () => {
    prisma.gameScore.findMany.mockResolvedValue([
      { subjectId: 'a', label: 'Equipo A', points: 3, detail: {} },
      { subjectId: 'b', label: 'Equipo B', points: 7, detail: {} },
    ])
    prisma.gameTeam.findMany.mockResolvedValue([])
    const lb = await computeLeaderboard({ id: 9, workspaceId: 1, scoring: 'manual', subjectType: 'team' })
    expect(lb.subjects.map((s) => s.label)).toEqual(['Equipo B', 'Equipo A'])
  })
})

describe('computeLeaderboard — competencia de marketing (followers_instagram)', () => {
  const game = {
    id: 9, workspaceId: 1, scoring: 'auto_metric', type: 'marketing_project_competition',
    config: { metric: 'followers_instagram' }, startDate: '2026-06-01T00:00:00Z', endDate: '2026-06-30T00:00:00Z',
  }

  test('calcula el delta de seguidores por proyecto (baseline = cierre del período previo) y ordena; incluye meta', async () => {
    prisma.project.findMany.mockResolvedValue([
      { id: 10, name: 'Proyecto X' },
      { id: 11, name: 'Proyecto Y' },
    ])
    // Logs dentro del período (junio): el último es el "end".
    prisma.instagramFollowerLog.findMany.mockImplementation(({ where }) => {
      if (where.projectId === 10) return Promise.resolve([
        { followersCount: 1020, date: '2026-06-01' }, { followersCount: 1150, date: '2026-06-30' },
      ])
      return Promise.resolve([
        { followersCount: 505, date: '2026-06-01' }, { followersCount: 540, date: '2026-06-29' },
      ])
    })
    // Baseline: cierre del período previo (último log anterior al 1 de junio).
    prisma.instagramFollowerLog.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(where.projectId === 10 ? { followersCount: 1000 } : { followersCount: 500 }))
    const lb = await computeLeaderboard(game)
    expect(lb.subjects.map((s) => [s.label, s.score])).toEqual([['Proyecto X', 150], ['Proyecto Y', 40]])
    expect(lb.metric).toMatchObject({ key: 'followers_instagram', growth: true })
  })

  test('sin log previo al período, ancla en el primer log del rango (fallback)', async () => {
    prisma.project.findMany.mockResolvedValue([{ id: 10, name: 'Proyecto X' }])
    prisma.instagramFollowerLog.findMany.mockResolvedValue([
      { followersCount: 1000, date: '2026-06-01' }, { followersCount: 1150, date: '2026-06-30' },
    ])
    prisma.instagramFollowerLog.findFirst.mockResolvedValue(null)
    const lb = await computeLeaderboard(game)
    expect(lb.subjects[0].score).toBe(150)
  })

  test('proyecto sin datos suficientes queda en 0 con warning', async () => {
    prisma.project.findMany.mockResolvedValue([{ id: 12, name: 'Proyecto Z' }])
    prisma.instagramFollowerLog.findMany.mockResolvedValue([{ followersCount: 800, date: '2026-06-10' }])
    prisma.instagramFollowerLog.findFirst.mockResolvedValue(null)
    const lb = await computeLeaderboard(game)
    expect(lb.subjects[0].score).toBe(0)
    expect(lb.warnings.length).toBeGreaterThan(0)
  })

  test('métrica no configurada → warning y sin subjects', async () => {
    const lb = await computeLeaderboard({ ...game, config: {} })
    expect(lb.subjects).toHaveLength(0)
    expect(lb.warnings.length).toBeGreaterThan(0)
  })
})

describe('computeLeaderboard — otras métricas de marketing', () => {
  const base = { id: 9, workspaceId: 1, scoring: 'auto_metric', type: 'marketing_project_competition', startDate: '2026-06-01T00:00:00Z', endDate: '2026-06-30T00:00:00Z' }

  test('web_visits suma sesiones del período', async () => {
    prisma.project.findMany.mockResolvedValue([{ id: 10, name: 'X' }, { id: 11, name: 'Y' }])
    prisma.analyticsSnapshot.findMany.mockImplementation(({ where }) =>
      Promise.resolve(where.projectId === 10 ? [{ sessions: 300 }] : [{ sessions: 120 }]))
    const lb = await computeLeaderboard({ ...base, config: { metric: 'web_visits' } })
    expect(lb.subjects.map((s) => [s.label, s.score])).toEqual([['X', 300], ['Y', 120]])
  })

  test('domain_rating usa el DR cacheado del proyecto', async () => {
    prisma.project.findMany.mockResolvedValue([{ id: 10, name: 'X', domainRating: 42 }, { id: 11, name: 'Y', domainRating: 67 }])
    const lb = await computeLeaderboard({ ...base, config: { metric: 'domain_rating' } })
    expect(lb.subjects.map((s) => [s.label, s.score])).toEqual([['Y', 67], ['X', 42]])
  })

  test('ads_spend suma inversión de la plataforma elegida', async () => {
    prisma.project.findMany.mockResolvedValue([{ id: 10, name: 'X' }])
    prisma.adsSnapshot.findMany.mockResolvedValue([{ spend: 100.5, clicks: 10, impressions: 1000, ctr: 1 }, { spend: 49.5, clicks: 5, impressions: 500, ctr: 1 }])
    const lb = await computeLeaderboard({ ...base, config: { metric: 'ads_spend', adsPlatform: 'meta_ads' } })
    expect(lb.subjects[0].score).toBe(150)
  })
})

describe('computeLeaderboard — quiz', () => {
  test('ordena por puntaje desc; a igualdad gana quien entregó antes', async () => {
    prisma.gameQuizSubmission.findMany.mockResolvedValue([
      { userId: 2, score: 5, submittedAt: '2026-06-10T10:00:00Z' },
      { userId: 3, score: 8, submittedAt: '2026-06-10T11:00:00Z' },
      { userId: 4, score: 5, submittedAt: '2026-06-10T09:00:00Z' },
    ])
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 2, user: { id: 2, name: 'Ana' } },
      { userId: 3, user: { id: 3, name: 'Beto' } },
      { userId: 4, user: { id: 4, name: 'Caro' } },
    ])
    const lb = await computeLeaderboard({ id: 9, workspaceId: 1, scoring: 'quiz' })
    expect(lb.subjects.map((s) => [s.label, s.score])).toEqual([['Beto', 8], ['Caro', 5], ['Ana', 5]])
  })

  test('sin entregas → ranking vacío', async () => {
    prisma.gameQuizSubmission.findMany.mockResolvedValue([])
    const lb = await computeLeaderboard({ id: 9, workspaceId: 1, scoring: 'quiz' })
    expect(lb.subjects).toHaveLength(0)
  })
})

describe('resolveWinner', () => {
  test('devuelve el top si tiene puntaje > 0', async () => {
    prisma.gameScore.findMany.mockResolvedValue([{ subjectId: 'b', label: 'B', points: 5, detail: {} }])
    prisma.gameTeam.findMany.mockResolvedValue([])
    const w = await resolveWinner({ id: 9, workspaceId: 1, scoring: 'manual', subjectType: 'team' })
    expect(w).toEqual({ subjectId: 'b', label: 'B', score: 5 })
  })

  test('null si nadie tiene puntaje', async () => {
    prisma.gameScore.findMany.mockResolvedValue([{ subjectId: 'b', label: 'B', points: 0, detail: {} }])
    prisma.gameTeam.findMany.mockResolvedValue([])
    const w = await resolveWinner({ id: 9, workspaceId: 1, scoring: 'manual', subjectType: 'team' })
    expect(w).toBeNull()
  })
})
