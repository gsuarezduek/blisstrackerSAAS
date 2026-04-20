jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  projectMember:   { findUnique: jest.fn() },
  projectLink:     { deleteMany: jest.fn(), createMany: jest.fn() },
  project:         { findUnique: jest.fn() },
  $transaction:    jest.fn(),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function authHeader(userId = 1, role = 'member') {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function mockWorkspace(workspaceRole = 'member') {
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss' })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: workspaceRole, active: true })
}

const mockProject = {
  id: 1, name: 'Proyecto Test', active: true,
  links: [{ id: 1, label: 'Drive', url: 'https://drive.google.com' }],
  services: [], members: [],
}

describe('PUT /api/projects/:id/links', () => {
  beforeEach(() => jest.clearAllMocks())

  it('permite a un miembro del proyecto guardar links', async () => {
    mockWorkspace('member')
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 1, userId: 1 })
    prisma.$transaction.mockResolvedValue([])
    prisma.project.findUnique.mockResolvedValue(mockProject)

    const res = await request(app)
      .put('/api/projects/1/links')
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ links: [{ label: 'Drive', url: 'https://drive.google.com' }] })

    expect(res.status).toBe(200)
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('devuelve 403 si el usuario no es miembro del proyecto', async () => {
    mockWorkspace('member')
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .put('/api/projects/1/links')
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ links: [{ label: 'Drive', url: 'https://drive.google.com' }] })

    expect(res.status).toBe(403)
  })

  it('permite a un admin de workspace guardar links sin ser miembro del proyecto', async () => {
    mockWorkspace('admin')
    prisma.$transaction.mockResolvedValue([])
    prisma.project.findUnique.mockResolvedValue(mockProject)

    const res = await request(app)
      .put('/api/projects/1/links')
      .set('Authorization', authHeader(1, 'admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ links: [{ label: 'Drive', url: 'https://drive.google.com' }] })

    expect(res.status).toBe(200)
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled()
  })

  it('devuelve 400 si un link no tiene label', async () => {
    mockWorkspace('member')
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 1, userId: 1 })

    const res = await request(app)
      .put('/api/projects/1/links')
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ links: [{ label: '', url: 'https://drive.google.com' }] })

    expect(res.status).toBe(400)
  })

  it('devuelve 400 si links no es un array', async () => {
    mockWorkspace('member')
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: 1, userId: 1 })

    const res = await request(app)
      .put('/api/projects/1/links')
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ links: 'no-es-array' })

    expect(res.status).toBe(400)
  })

  it('devuelve 401 sin autenticación', async () => {
    const res = await request(app)
      .put('/api/projects/1/links')
      .send({ links: [] })

    expect(res.status).toBe(401)
  })
})
