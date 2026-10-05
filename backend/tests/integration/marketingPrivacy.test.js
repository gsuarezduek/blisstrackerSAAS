jest.mock('../../src/lib/prisma', () => ({
  workspace:          { findUnique: jest.fn() },
  workspaceMember:    { findUnique: jest.fn() },
  featureFlag:        { findUnique: jest.fn() },
  project:            { findFirst: jest.fn(), findUnique: jest.fn() },
  projectMember:      { findUnique: jest.fn() },
  marketingObjective: { findMany: jest.fn() },
  geoAudit:           { findFirst: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 10

function authHeader(role = 'member') {
  return `Bearer ${jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

function mockWorkspace(role = 'member') {
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss', disabledFeatureKeys: '[]', moduleAccess: null })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role, active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'marketing', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

beforeEach(() => jest.clearAllMocks())

// Ver middleware/projectPrivacy.js — acá ':id' se reusa para dos cosas distintas
// dentro del mismo router (projectId en '/projects/:id/*', GeoAudit.id en
// '/geo/audits/:id'), por eso el gate va por prefijo de path, no router.param.
describe('Marketing — gate de proyectos privados por prefijo /projects/:id', () => {
  it('403 PROJECT_PRIVATE en una ruta de proyecto si es privado y no soy del equipo', async () => {
    mockWorkspace('member')
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
    prisma.project.findUnique.mockResolvedValue({ isPrivate: true })
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get(`/api/marketing/projects/${PROJECT_ID}/objectives`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PROJECT_PRIVATE')
    expect(prisma.marketingObjective.findMany).not.toHaveBeenCalled()
  })

  it('200 en una ruta de proyecto privado si soy del equipo', async () => {
    mockWorkspace('member')
    prisma.project.findUnique.mockResolvedValue({ isPrivate: true })
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: PROJECT_ID, userId: 1 })
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
    prisma.marketingObjective.findMany.mockResolvedValue([])

    const res = await request(app)
      .get(`/api/marketing/projects/${PROJECT_ID}/objectives`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
  })

  it('una ruta de proyecto NO privado sigue abierta a cualquiera (sin cambios)', async () => {
    mockWorkspace('member')
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false })
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
    prisma.marketingObjective.findMany.mockResolvedValue([])

    const res = await request(app)
      .get(`/api/marketing/projects/${PROJECT_ID}/objectives`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled()
  })

  it('NO afecta rutas que reusan :id para otra entidad (GeoAudit, no projectId)', async () => {
    mockWorkspace('member')
    // Si el gate confundiera este :id con un projectId, intentaría resolver un
    // Project con ese id — acá no debería ni tocar prisma.project en absoluto.
    prisma.geoAudit.findFirst.mockResolvedValue({
      id: 999, workspaceId: WORKSPACE_ID, status: 'done', findings: '[]', recommendations: '[]',
      project: { name: 'X', websiteUrl: null },
    })

    const res = await request(app)
      .get('/api/marketing/geo/audits/999')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.project.findUnique).not.toHaveBeenCalled()
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled()
  })
})
