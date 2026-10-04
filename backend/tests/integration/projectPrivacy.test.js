jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  project:         { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  projectMember:   { findUnique: jest.fn(), findMany: jest.fn() },
  task:            { findMany: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 10

function authHeader(userId = 1, role = 'member') {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function mockWorkspace(role = 'member') {
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss' })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role, active: true })
}

describe('Proyectos privados — gate de acceso (router.param de projects.routes.js)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('un proyecto NO privado sigue abierto a cualquier miembro del workspace', async () => {
    mockWorkspace('member')
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false })
    prisma.projectMember.findMany.mockResolvedValue([])

    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/members`)
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
  })

  it('un proyecto privado devuelve 403 PROJECT_PRIVATE a quien no es del equipo ni admin', async () => {
    mockWorkspace('member')
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
    prisma.project.findUnique.mockResolvedValue({ isPrivate: true })
    prisma.projectMember.findUnique.mockResolvedValue(null) // no es del equipo

    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/members`)
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PROJECT_PRIVATE')
  })

  it('un proyecto privado sigue abierto al equipo (ProjectMember)', async () => {
    mockWorkspace('member')
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
    prisma.project.findUnique.mockResolvedValue({ isPrivate: true })
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: PROJECT_ID, userId: 1 })
    prisma.projectMember.findMany.mockResolvedValue([])

    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/members`)
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
  })

  it('un proyecto privado sigue abierto a admin/owner aunque no sea del equipo', async () => {
    mockWorkspace('admin')
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
    prisma.project.findUnique.mockResolvedValue({ isPrivate: true })
    prisma.projectMember.findMany.mockResolvedValue([])

    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/members`)
      .set('Authorization', authHeader(1, 'admin'))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    // admin nunca necesita resolverse contra ProjectMember para el gate.
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/projects/:id/privacy', () => {
  beforeEach(() => jest.clearAllMocks())

  it('403 si quien lo pide no es del equipo ni admin', async () => {
    mockWorkspace('member')
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false }) // gate: no privado, pasa
    prisma.projectMember.findUnique.mockResolvedValue(null) // canWrite dentro del controller: no es del equipo

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/privacy`)
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ isPrivate: true })

    expect(res.status).toBe(403)
  })

  it('409 con el detalle si alguien ajeno al equipo tiene tareas abiertas', async () => {
    mockWorkspace('member')
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false })
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: PROJECT_ID, userId: 1 }) // quien pide SÍ es del equipo
    prisma.task.findMany.mockResolvedValue([
      { userId: 99, user: { id: 99, name: 'Ana (no es del equipo)' } },
    ])
    prisma.projectMember.findMany.mockResolvedValue([{ userId: 1 }]) // equipo actual: solo el user 1

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/privacy`)
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ isPrivate: true })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('PRIVATE_BLOCKED_BY_TASKS')
    expect(res.body.users).toEqual([{ id: 99, name: 'Ana (no es del equipo)', taskCount: 1 }])
    expect(prisma.project.update).not.toHaveBeenCalled()
  })

  it('marca privado si todas las tareas abiertas son del equipo', async () => {
    mockWorkspace('member')
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false })
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: PROJECT_ID, userId: 1 })
    prisma.task.findMany.mockResolvedValue([{ userId: 1, user: { id: 1, name: 'Yo' } }])
    prisma.projectMember.findMany.mockResolvedValue([{ userId: 1 }])
    prisma.project.update.mockResolvedValue({ id: PROJECT_ID, isPrivate: true, members: [] })

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/privacy`)
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ isPrivate: true })

    expect(res.status).toBe(200)
    expect(res.body.isPrivate).toBe(true)
    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: PROJECT_ID },
      data:  { isPrivate: true },
    }))
  })

  it('des-privatizar no valida tareas abiertas (solo el alta las chequea)', async () => {
    mockWorkspace('member')
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
    prisma.project.findUnique.mockResolvedValue({ isPrivate: true }) // el gate exige equipo/admin para esta transición
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: PROJECT_ID, userId: 1 })
    prisma.project.update.mockResolvedValue({ id: PROJECT_ID, isPrivate: false, members: [] })

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/privacy`)
      .set('Authorization', authHeader(1, 'member'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ isPrivate: false })

    expect(res.status).toBe(200)
    expect(prisma.task.findMany).not.toHaveBeenCalled()
    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isPrivate: false } }))
  })
})
