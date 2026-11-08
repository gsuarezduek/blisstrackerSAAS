// El canal de chat del proyecto es best-effort dentro de createProject: mockeado
// para que el alta no intente tocar la DB de chat.
jest.mock('../../src/lib/chatChannels', () => ({ ensureProjectChannel: jest.fn().mockResolvedValue(undefined) }))

jest.mock('../../src/lib/prisma', () => ({
  workspace:          { findUnique: jest.fn() },
  workspaceMember:    { findUnique: jest.fn() },
  featureFlag:        { findUnique: jest.fn() },
  project:            { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  projectMember:      { findUnique: jest.fn() },
  marketingObjective: { findMany: jest.fn() },
  contentPiece:       { findMany: jest.fn(), count: jest.fn() },
  task:               { findMany: jest.fn(), findFirst: jest.fn() },
  calendarEvent:      { findMany: jest.fn() },
  projectFile:        { findMany: jest.fn() },
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

function mockWorkspace(role = 'member', flagKey = 'marketing') {
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss', disabledFeatureKeys: '[]', moduleAccess: null })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role, active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: flagKey, enabledGlobally: true, enabledWorkspaceIds: '[]' })
  prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
}

// Lo que el middleware lee del proyecto: privacidad + los toggles de sección.
function mockProjectModules({ marketingEnabled = true, contenidoEnabled = true, briefsEnabled = true, isPrivate = false } = {}) {
  prisma.project.findUnique.mockResolvedValue({ isPrivate, marketingEnabled, contenidoEnabled, briefsEnabled })
}

beforeEach(() => jest.clearAllMocks())

// Ver concepto "Secciones por proyecto (Marketing, Contenido, Briefs)": no todas las
// cuentas llevan marketing ni calendario de contenido, y el feature flag es del
// workspace entero.
describe('Gate de sección por proyecto — Marketing', () => {
  it('404 PROJECT_MODULE_DISABLED con Marketing apagado para esa cuenta', async () => {
    mockWorkspace('member')
    mockProjectModules({ marketingEnabled: false })

    const res = await request(app)
      .get(`/api/marketing/projects/${PROJECT_ID}/objectives`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('PROJECT_MODULE_DISABLED')
    expect(prisma.marketingObjective.findMany).not.toHaveBeenCalled()
  })

  // 404 y no 403 a propósito: desde esta sección la cuenta no existe (tampoco
  // aparece en su selector), no es un permiso que le falte a esta persona.
  it('ni un admin del workspace entra: no es un permiso, la cuenta no está en la sección', async () => {
    mockWorkspace('admin')
    mockProjectModules({ marketingEnabled: false })

    const res = await request(app)
      .get(`/api/marketing/projects/${PROJECT_ID}/objectives`)
      .set('Authorization', authHeader('admin'))
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('PROJECT_MODULE_DISABLED')
  })

  it('con Marketing prendido la ruta sigue abierta como siempre', async () => {
    mockWorkspace('member')
    mockProjectModules({ marketingEnabled: true })
    prisma.marketingObjective.findMany.mockResolvedValue([])

    const res = await request(app)
      .get(`/api/marketing/projects/${PROJECT_ID}/objectives`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
  })

  // Los dos toggles son independientes: apagar uno no debe cerrar el otro.
  it('Contenido apagado no cierra Marketing', async () => {
    mockWorkspace('member')
    mockProjectModules({ marketingEnabled: true, contenidoEnabled: false })
    prisma.marketingObjective.findMany.mockResolvedValue([])

    const res = await request(app)
      .get(`/api/marketing/projects/${PROJECT_ID}/objectives`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
  })
})

describe('Gate de sección por proyecto — Contenido', () => {
  it('404 PROJECT_MODULE_DISABLED con Contenido apagado para esa cuenta', async () => {
    mockWorkspace('member', 'contenido')
    mockProjectModules({ contenidoEnabled: false })

    const res = await request(app)
      .get(`/api/contenido/projects/${PROJECT_ID}/pieces`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('PROJECT_MODULE_DISABLED')
    expect(prisma.contentPiece.findMany).not.toHaveBeenCalled()
  })

  it('el gate de privacidad sigue corriendo primero (403, no 404)', async () => {
    mockWorkspace('member', 'contenido')
    mockProjectModules({ isPrivate: true, contenidoEnabled: false })
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get(`/api/contenido/projects/${PROJECT_ID}/pieces`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PROJECT_PRIVATE')
  })
})

describe('PATCH /api/projects/:id/modules', () => {
  it('un miembro del equipo del proyecto puede apagar Marketing', async () => {
    mockWorkspace('member')
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false, marketingEnabled: true, contenidoEnabled: true })
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: PROJECT_ID, userId: 1 })
    prisma.project.update.mockResolvedValue({ marketingEnabled: false, contenidoEnabled: true })

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/modules`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ marketingEnabled: false })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ marketingEnabled: false, contenidoEnabled: true })
    // Una clave ausente del body no se toca: prender uno no pisa el otro.
    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { marketingEnabled: false },
    }))
  })

  it('403 para alguien del workspace que no es del equipo ni admin', async () => {
    mockWorkspace('member')
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false, marketingEnabled: true, contenidoEnabled: true })
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/modules`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ contenidoEnabled: false })

    expect(res.status).toBe(403)
    expect(prisma.project.update).not.toHaveBeenCalled()
  })

  // `linksEnabled` sigue siendo un toggle global del workspace, no una sección de
  // proyecto: este endpoint no lo acepta.
  it('400 si el body no trae ninguna de las secciones', async () => {
    mockWorkspace('admin')
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false, marketingEnabled: true, contenidoEnabled: true })

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/modules`)
      .set('Authorization', authHeader('admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ linksEnabled: false })

    expect(res.status).toBe(400)
    expect(prisma.project.update).not.toHaveBeenCalled()
  })

  // La ruta vive en projects.routes.js justamente para esto: si colgara del router
  // de cada módulo, con el módulo apagado no habría por dónde volver a prenderlo.
  it('se puede volver a prender un módulo apagado', async () => {
    mockWorkspace('admin')
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false, marketingEnabled: false, contenidoEnabled: false })
    prisma.project.update.mockResolvedValue({ marketingEnabled: true, contenidoEnabled: false })

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/modules`)
      .set('Authorization', authHeader('admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ marketingEnabled: true })

    expect(res.status).toBe(200)
    expect(res.body.marketingEnabled).toBe(true)
  })
})

// Briefs es la tercera sección del mismo endpoint; a diferencia de las otras dos no
// tiene feature flag de workspace, así que este toggle es su única palanca.
describe('PATCH /api/projects/:id/modules — Briefs', () => {
  it('apaga Briefs y devuelve el estado de las tres secciones', async () => {
    mockWorkspace('admin')
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false, marketingEnabled: true, contenidoEnabled: true, briefsEnabled: true })
    prisma.project.update.mockResolvedValue({ marketingEnabled: true, contenidoEnabled: true, briefsEnabled: false })

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/modules`)
      .set('Authorization', authHeader('admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ briefsEnabled: false })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ marketingEnabled: true, contenidoEnabled: true, briefsEnabled: false })
    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: { briefsEnabled: false } }))
  })

  it('403 con Briefs apagado al leer los briefs del proyecto', async () => {
    mockWorkspace('member')
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
    prisma.project.findUnique.mockResolvedValue({ isPrivate: false, briefsEnabled: false })

    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/briefs`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(403)
  })
})

// Lo que se personaliza en el popup de alta: secciones, privacidad y abono de horas.
describe('POST /api/projects — personalización al crear', () => {
  function mockCreate() {
    prisma.project.create.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))
  }

  it('un proyecto nuevo estrena Briefs apagado aunque nadie lo mande', async () => {
    mockWorkspace('admin')
    mockCreate()

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', authHeader('admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ name: 'Cuenta nueva' })

    expect(res.status).toBe(201)
    const { data } = prisma.project.create.mock.calls[0][0]
    expect(data.briefsEnabled).toBe(false)
    // Las otras dos quedan en el default del modelo: no se tocan al crear.
    expect(data.marketingEnabled).toBeUndefined()
    expect(data.contenidoEnabled).toBeUndefined()
  })

  it('guarda las secciones, la privacidad y el abono elegidos', async () => {
    mockWorkspace('admin')
    mockCreate()

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', authHeader('admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({
        name: 'Cuenta con todo', marketingEnabled: false, contenidoEnabled: true, briefsEnabled: true,
        isPrivate: true, hoursEnabled: true, monthlyHours: 40, websiteUrl: 'https://ejemplo.com',
      })

    expect(res.status).toBe(201)
    const { data } = prisma.project.create.mock.calls[0][0]
    expect(data).toMatchObject({
      marketingEnabled: false, contenidoEnabled: true, briefsEnabled: true,
      isPrivate: true, hoursEnabled: true, monthlyHours: 40, websiteUrl: 'https://ejemplo.com',
    })
  })

  // El abono apagado manda `monthlyHours: null` para no dejar un número colgado de
  // un seguimiento que nadie va a mirar.
  it('sin abono no guarda horas contratadas', async () => {
    mockWorkspace('admin')
    mockCreate()

    await request(app)
      .post('/api/projects')
      .set('Authorization', authHeader('admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ name: 'Sin abono', hoursEnabled: false, monthlyHours: null })

    const { data } = prisma.project.create.mock.calls[0][0]
    expect(data.hoursEnabled).toBe(false)
    expect(data.monthlyHours).toBeNull()
  })

  it('400 si las horas contratadas no son un entero positivo', async () => {
    mockWorkspace('admin')
    mockCreate()

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', authHeader('admin'))
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ name: 'Horas raras', hoursEnabled: true, monthlyHours: -3 })

    expect(res.status).toBe(400)
    expect(prisma.project.create).not.toHaveBeenCalled()
  })
})

describe('Buscador global — piezas de Contenido', () => {
  it('no busca piezas en cuentas con Contenido apagado', async () => {
    mockWorkspace('member', 'contenido')
    prisma.task.findMany.mockResolvedValue([])
    prisma.contentPiece.findMany.mockResolvedValue([])
    prisma.calendarEvent.findMany.mockResolvedValue([])
    prisma.projectFile.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/search?q=posteo')
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(prisma.contentPiece.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        project: expect.objectContaining({ contenidoEnabled: true }),
      }),
    }))
  })
})
