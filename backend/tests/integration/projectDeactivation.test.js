jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  project:         { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  projectMember:   { findUnique: jest.fn(), findMany: jest.fn() },
  chatChannel:     { updateMany: jest.fn() },
  $transaction:    jest.fn(arg => Array.isArray(arg) ? Promise.all(arg) : arg),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 10

function authHeader(role = 'admin') {
  const token = jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Admin', email: 'a@a.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function mockWorkspace(role = 'admin') {
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss' })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role, active: true })
}

function put(body) {
  return request(app)
    .put(`/api/projects/${PROJECT_ID}`)
    .set('Authorization', authHeader())
    .set('X-Workspace', WORKSPACE_SLUG)
    .send(body)
}

// Ver concepto "El canal de Chat del proyecto sigue automáticamente el estado
// `active`" en projects.controller.js: desactivar/reactivar un proyecto
// archiva/desarchiva su canal de Chat (kind='project'), sin crear ni borrar nada.
describe('PUT /api/projects/:id — el canal de Chat sigue el estado del proyecto', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWorkspace('admin')
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false }) // gate de proyectos privados
    prisma.project.update.mockResolvedValue({ id: PROJECT_ID, active: false, members: [] })
  })

  it('al desactivar (true→false), archiva el canal del proyecto', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID, active: true, monthlyHours: null, timezone: 'America/Argentina/Buenos_Aires' })

    const res = await put({ active: false })

    expect(res.status).toBe(200)
    expect(prisma.chatChannel.updateMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, kind: 'project' },
      data:  { archived: true },
    })
    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ active: false, lostAt: expect.any(Date) }),
    }))
  })

  it('al reactivar (false→true), desarchiva el canal del proyecto', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID, active: false, monthlyHours: null, timezone: 'America/Argentina/Buenos_Aires' })

    const res = await put({ active: true })

    expect(res.status).toBe(200)
    expect(prisma.chatChannel.updateMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, kind: 'project' },
      data:  { archived: false },
    })
    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ active: true, lostAt: null }),
    }))
  })

  it('re-guardar el mismo valor no toca el canal', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID, active: true, monthlyHours: null, timezone: 'America/Argentina/Buenos_Aires' })

    const res = await put({ active: true })

    expect(res.status).toBe(200)
    expect(prisma.chatChannel.updateMany).not.toHaveBeenCalled()
  })

  it('un PUT sin tocar `active` no toca el canal', async () => {
    const res = await put({ name: 'Nuevo nombre' })

    expect(res.status).toBe(200)
    expect(prisma.chatChannel.updateMany).not.toHaveBeenCalled()
  })
})
