jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  task:            { findMany: jest.fn() },
  contentPiece:    { findMany: jest.fn() },
  calendarEvent:   { findMany: jest.fn() },
  projectFile:     { findMany: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const WORKSPACE_ID = 1

function authHeader(role = 'member') {
  const token = jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    process.env.JWT_SECRET,
  )
  return `Bearer ${token}`
}

function mockWorkspace({ moduleAccess = {}, role = 'member' } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: 'bliss', status: 'active', name: 'Bliss', moduleAccess, disabledFeatureKeys: '[]',
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({
    workspaceId: WORKSPACE_ID, userId: 1, role, active: true, teamRole: 'DESIGNER',
  })
}

function get(q, role) {
  return request(app).get('/api/search').query({ q }).set('Authorization', authHeader(role)).set('X-Workspace', 'bliss')
}

beforeEach(() => {
  jest.clearAllMocks()
  prisma.task.findMany.mockResolvedValue([{ id: 5, description: 'Diseñar logo' }])
  prisma.contentPiece.findMany.mockResolvedValue([{ id: 7, title: 'Post logo' }])
  prisma.calendarEvent.findMany.mockResolvedValue([{ id: 9, title: 'Reunión logo' }])
  prisma.projectFile.findMany.mockResolvedValue([{ id: 3, name: 'logo.png' }])
})

describe('GET /api/search', () => {
  it('con menos de 2 caracteres no consulta nada', async () => {
    mockWorkspace()
    const res = await get('l')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tasks: [], pieces: [], events: [], files: [] })
    expect(prisma.task.findMany).not.toHaveBeenCalled()
  })

  it('devuelve los cuatro bloques cuando ambos módulos están habilitados', async () => {
    mockWorkspace()
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'x', enabledGlobally: true, enabledWorkspaceIds: '[]' })
    const res = await get('logo')
    expect(res.status).toBe(200)
    expect(res.body.tasks).toHaveLength(1)
    expect(res.body.pieces).toHaveLength(1)
    expect(res.body.events).toHaveLength(1)
    expect(res.body.files).toHaveLength(1)
  })

  it('omite Contenido y Calendario si el flag no está habilitado para el workspace', async () => {
    mockWorkspace()
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'x', enabledGlobally: false, enabledWorkspaceIds: '[]' })
    const res = await get('logo')
    expect(res.body.pieces).toEqual([])
    expect(res.body.events).toEqual([])
    expect(res.body.tasks).toHaveLength(1)
    expect(prisma.contentPiece.findMany).not.toHaveBeenCalled()
    expect(prisma.calendarEvent.findMany).not.toHaveBeenCalled()
  })

  it('omite un módulo si el rol del miembro no tiene acceso', async () => {
    mockWorkspace({ moduleAccess: { contenido: { allMembers: false, roles: ['CM'] } } })
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'x', enabledGlobally: true, enabledWorkspaceIds: '[]' })
    const res = await get('logo')
    expect(res.body.pieces).toEqual([])
    expect(res.body.events).toHaveLength(1)
  })

  it('acota los archivos a proyectos con Nube habilitada y del workspace', async () => {
    mockWorkspace()
    prisma.featureFlag.findUnique.mockResolvedValue(null)
    await get('logo')
    const where = prisma.projectFile.findMany.mock.calls[0][0].where
    expect(where.workspaceId).toBe(WORKSPACE_ID)
    // Ver concepto "Proyectos privados": un miembro no-admin solo ve archivos de
    // proyectos no privados o donde es del equipo.
    expect(where.project).toEqual({
      filesEnabled: true,
      OR: [{ isPrivate: false }, { isPrivate: true, members: { some: { userId: 1 } } }],
    })
    expect(where.deletedAt).toBeNull()
  })

  it('acota tareas/piezas/eventos a proyectos no privados o del equipo (member)', async () => {
    mockWorkspace()
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'x', enabledGlobally: true, enabledWorkspaceIds: '[]' })
    await get('logo')
    const privacyOr = { OR: [{ isPrivate: false }, { isPrivate: true, members: { some: { userId: 1 } } }] }
    expect(prisma.task.findMany.mock.calls[0][0].where.project).toEqual(privacyOr)
    expect(prisma.contentPiece.findMany.mock.calls[0][0].where.project).toEqual(privacyOr)
    // CalendarEvent.projectId es nullable: además de la condición de arriba, deja
    // pasar los eventos legacy sin proyecto asociado.
    expect(prisma.calendarEvent.findMany.mock.calls[0][0].where.OR).toEqual([
      { projectId: null },
      { project: privacyOr },
    ])
  })

  it('admin/owner no lleva filtro de privacidad', async () => {
    mockWorkspace({ role: 'admin' })
    prisma.featureFlag.findUnique.mockResolvedValue({ key: 'x', enabledGlobally: true, enabledWorkspaceIds: '[]' })
    await get('logo', 'admin')
    expect(prisma.task.findMany.mock.calls[0][0].where.project).toBeUndefined()
    expect(prisma.projectFile.findMany.mock.calls[0][0].where.project).toEqual({ filesEnabled: true })
  })
})
