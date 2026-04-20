jest.mock('../../src/lib/prisma', () => ({
  user:             { findUnique: jest.fn() },
  workspace:        { findUnique: jest.fn() },
  workspaceMember:  { findUnique: jest.fn(), findMany: jest.fn() },
  userLogin:        { create: jest.fn() },
}))
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash:    jest.fn(),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const bcrypt  = require('bcryptjs')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

const mockUser = {
  id:           1,
  name:         'Ana García',
  email:        'ana@test.com',
  password:     '$2a$10$hashedpassword',
  isSuperAdmin: false,
  active:       true,
  avatar:       'bee.png',
}

const mockWorkspace = { id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss Marketing' }
const mockMember    = { workspaceId: WORKSPACE_ID, userId: 1, role: 'member', teamRole: 'DESIGNER', active: true, dailyInsightEnabled: true }

// ── POST /api/auth/login ───────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks())

  it('devuelve 200 + token con credenciales válidas (con X-Workspace)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser)
    bcrypt.compare.mockResolvedValue(true)
    prisma.workspace.findUnique.mockResolvedValue(mockWorkspace)
    prisma.workspaceMember.findUnique.mockResolvedValue(mockMember)
    prisma.userLogin.create.mockResolvedValue({})

    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ email: 'ana@test.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
    expect(res.body.user.email).toBe('ana@test.com')
    expect(res.body.user.password).toBeUndefined()
  })

  it('devuelve lista de workspaces cuando no hay X-Workspace', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser)
    bcrypt.compare.mockResolvedValue(true)
    prisma.workspaceMember.findMany.mockResolvedValue([
      { ...mockMember, workspace: mockWorkspace },
    ])

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@test.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.workspaces).toBeDefined()
    expect(res.body.workspaces).toHaveLength(1)
    expect(res.body.workspaces[0].slug).toBe(WORKSPACE_SLUG)
  })

  it('devuelve 401 si la contraseña es incorrecta', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser)
    bcrypt.compare.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@test.com', password: 'wrongpassword' })

    expect(res.status).toBe(401)
  })

  it('devuelve 401 si el email no existe', async () => {
    prisma.user.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@test.com', password: 'password123' })

    expect(res.status).toBe(401)
  })

  it('devuelve 400 si faltan campos', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ana@test.com' })

    expect(res.status).toBe(400)
  })
})

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  beforeEach(() => jest.clearAllMocks())

  it('devuelve 200 con datos del usuario con token válido', async () => {
    const token = jwt.sign(
      { userId: 1, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Ana García', email: 'ana@test.com' },
      SECRET,
    )
    prisma.workspace.findUnique.mockResolvedValue(mockWorkspace)
    prisma.workspaceMember.findUnique.mockResolvedValue(mockMember)
    prisma.user.findUnique.mockResolvedValue({ ...mockUser, isSuperAdmin: false })

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.email).toBe('ana@test.com')
  })

  it('devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('devuelve 401 con token inválido', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer token.falso.xyz')

    expect(res.status).toBe(401)
  })
})
