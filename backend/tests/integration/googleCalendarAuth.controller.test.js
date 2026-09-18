jest.mock('../../src/lib/prisma', () => {
  const prisma = {
    workspace:                { findUnique: jest.fn() },
    featureFlag:               { findUnique: jest.fn() },
    workspaceMember:           { findUnique: jest.fn() },
    googleCalendarConnection:  { findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  }
  return prisma
})

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function makeToken(userId = 1, role = 'member') {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test User', email: 'test@bliss.ar' },
    SECRET,
  )}`
}

function mockWorkspace() {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', timezone: 'America/Argentina/Buenos_Aires',
    disabledFeatureKeys: '[]', moduleAccess: null,
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'calendario', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockWorkspace()
})

describe('GET /api/calendar/google/auth-url', () => {
  it('devuelve una URL de consentimiento de Google con el scope calendar.events', async () => {
    const res = await request(app)
      .get('/api/calendar/google/auth-url')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.url).toContain('calendar.events')
  })
})

describe('GET /api/calendar/google/status', () => {
  it('connected:false cuando no hay conexión guardada', async () => {
    prisma.googleCalendarConnection.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .get('/api/calendar/google/status')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
    expect(res.body).toEqual({ connected: false, accountEmail: null, status: null })
  })

  it('connected:true con el email de la cuenta conectada', async () => {
    prisma.googleCalendarConnection.findUnique.mockResolvedValue({
      accountEmail: 'yo@gmail.com', status: 'active', connectedAt: new Date(),
    })
    const res = await request(app)
      .get('/api/calendar/google/status')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
    expect(res.body).toEqual({ connected: true, accountEmail: 'yo@gmail.com', status: 'active' })
  })

  it('un status expired no cuenta como conectado', async () => {
    prisma.googleCalendarConnection.findUnique.mockResolvedValue({
      accountEmail: 'yo@gmail.com', status: 'expired', connectedAt: new Date(),
    })
    const res = await request(app)
      .get('/api/calendar/google/status')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
    expect(res.body.connected).toBe(false)
  })
})

describe('DELETE /api/calendar/google', () => {
  it('borra la conexión del usuario actual en este workspace', async () => {
    prisma.googleCalendarConnection.deleteMany.mockResolvedValue({ count: 1 })
    const res = await request(app)
      .delete('/api/calendar/google')
      .set('Authorization', makeToken())
      .set('X-Workspace', WORKSPACE_SLUG)
    expect(res.status).toBe(200)
    expect(prisma.googleCalendarConnection.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1, workspaceId: WORKSPACE_ID },
    })
  })
})
