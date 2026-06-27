jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  projectMember:   { findMany: jest.fn() },
  vacationRequest: { findFirst: jest.fn() },
  task:            { findMany: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const REQUESTER      = 1
const TARGET         = 2

function authHeader(userId = REQUESTER) {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function mockMembers() {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    timezone: 'America/Argentina/Buenos_Aires',
  })
  prisma.workspaceMember.findUnique.mockImplementation(({ where }) => {
    const uid = where.workspaceId_userId.userId
    if (uid === REQUESTER) return Promise.resolve({ workspaceId: WORKSPACE_ID, userId: REQUESTER, role: 'member', active: true })
    if (uid === TARGET) return Promise.resolve({
      workspaceId: WORKSPACE_ID, userId: TARGET, role: 'member', teamRole: 'DESIGNER', active: true,
      joinedAt: new Date('2025-01-01T00:00:00Z'),
      user: { id: TARGET, name: 'Ana', email: 'ana@t.com', avatar: 'bee.png' },
    })
    return Promise.resolve(null)
  })
}

function makeTask(overrides = {}) {
  return {
    id: 100, userId: TARGET, status: 'PENDING', description: 'Tarea',
    createdAt: new Date('2026-06-01T12:00:00Z'),
    project: { id: 5, name: 'Proyecto Test' },
    createdBy: null, user: null, _count: { comments: 0 },
    ...overrides,
  }
}

describe('GET /api/users/:id/profile', () => {
  beforeEach(() => { jest.clearAllMocks(); mockMembers() })

  it('arma el perfil con tareas agrupadas por estado y delegadas en ambos sentidos', async () => {
    prisma.projectMember.findMany.mockResolvedValue([{ project: { id: 5, name: 'Proyecto Test' } }])
    prisma.vacationRequest.findFirst.mockResolvedValue(null)

    const completedRow = { completedAt: new Date(), minutesOverride: 30, startedAt: null, pausedMinutes: 0 }
    const activeRows = [
      makeTask({ id: 1, status: 'IN_PROGRESS' }),
      makeTask({ id: 2, status: 'PENDING' }),
      makeTask({ id: 3, status: 'BLOCKED' }),
    ]
    const delegatedByThemRow = makeTask({ id: 4, userId: 9, createdById: TARGET, user: { id: 9, name: 'Beto', avatar: 'b.png' } })
    const delegatedToThemRow = makeTask({ id: 5, createdById: 7, createdBy: { id: 7, name: 'Carla', avatar: 'c.png' } })

    prisma.task.findMany.mockImplementation(({ where }) => {
      if (where.status === 'COMPLETED') return Promise.resolve([completedRow])
      if (where.scheduledFor?.gt) return Promise.resolve([])               // future
      if (where.createdById === TARGET) return Promise.resolve([delegatedByThemRow])
      if (where.AND) return Promise.resolve([delegatedToThemRow])          // delegatedToThem
      return Promise.resolve(activeRows)                                   // active
    })

    const res = await request(app)
      .get(`/api/users/${TARGET}/profile`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ id: TARGET, name: 'Ana', email: 'ana@t.com', teamRole: 'DESIGNER' })
    expect(res.body.projects).toEqual([{ id: 5, name: 'Proyecto Test' }])
    expect(res.body.active.IN_PROGRESS).toHaveLength(1)
    expect(res.body.active.PENDING).toHaveLength(1)
    expect(res.body.active.BLOCKED).toHaveLength(1)
    expect(res.body.active.PAUSED).toHaveLength(0)
    expect(res.body.delegatedByThem).toHaveLength(1)
    expect(res.body.delegatedByThem[0].user.name).toBe('Beto')
    expect(res.body.delegatedToThem).toHaveLength(1)
    expect(res.body.delegatedToThem[0].createdBy.name).toBe('Carla')
    expect(res.body.summary.month.count).toBe(1)
    expect(res.body.summary.month.minutes).toBe(30)
  })

  it('devuelve 404 si la persona no es miembro del workspace', async () => {
    const res = await request(app)
      .get('/api/users/999/profile')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(404)
  })
})

describe('GET /api/users/:id/completed', () => {
  beforeEach(() => { jest.clearAllMocks(); mockMembers() })

  it('devuelve las completadas del período con totales y duración', async () => {
    prisma.task.findMany.mockResolvedValue([
      makeTask({ id: 1, status: 'COMPLETED', minutesOverride: 45, completedAt: new Date('2026-06-10T15:00:00Z'), createdAt: new Date('2026-06-09T10:00:00Z') }),
      makeTask({ id: 2, status: 'COMPLETED', minutesOverride: 15, completedAt: new Date('2026-06-11T15:00:00Z'), createdAt: new Date('2026-06-10T10:00:00Z') }),
    ])

    const res = await request(app)
      .get(`/api/users/${TARGET}/completed`)
      .query({ period: 'month', date: '2026-06-15' })
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.period).toBe('month')
    expect(res.body.items).toHaveLength(2)
    expect(res.body.total).toEqual({ count: 2, minutes: 60 })
    expect(res.body.items[0]).toHaveProperty('createdAt')
    expect(res.body.items[0]).toHaveProperty('completedAt')
    expect(res.body.items[0]).toHaveProperty('minutes')
  })
})
