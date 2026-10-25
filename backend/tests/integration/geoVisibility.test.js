jest.mock('../../src/lib/prisma', () => ({
  workspace:               { findUnique: jest.fn() },
  workspaceMember:         { findUnique: jest.fn() },
  featureFlag:             { findUnique: jest.fn() },
  project:                 { findFirst: jest.fn(), findUnique: jest.fn() },
  geoVisibilityPrompt:     { count: jest.fn(), create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  geoVisibilityCompetitor: { count: jest.fn(), create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  geoVisibilityRun:        { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
}))
jest.mock('../../src/services/geoVisibility.service', () => ({ runVisibilityCheck: jest.fn() }))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 10

function authHeader() {
  return `Bearer ${jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

function mockWorkspace() {
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss', disabledFeatureKeys: '[]', moduleAccess: null })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'marketing', enabledGlobally: true, enabledWorkspaceIds: '[]' })
  // requireProjectAccessPrefix: resolveProjectId (findFirst) + isPrivate check (findUnique)
  prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID, name: 'Proyecto X' })
  prisma.project.findUnique.mockResolvedValue({ isPrivate: false })
}

beforeEach(() => jest.clearAllMocks())

describe('POST /api/marketing/projects/:id/visibility/prompts', () => {
  it('201 — crea la pregunta', async () => {
    mockWorkspace()
    prisma.geoVisibilityPrompt.count.mockResolvedValue(0)
    prisma.geoVisibilityPrompt.create.mockResolvedValue({ id: 1, query: '¿Cuál es la mejor agencia de X?', active: true })

    const res = await request(app)
      .post(`/api/marketing/projects/${PROJECT_ID}/visibility/prompts`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ query: '¿Cuál es la mejor agencia de X?' })

    expect(res.status).toBe(201)
    expect(prisma.geoVisibilityPrompt.create).toHaveBeenCalledWith({
      data: { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, query: '¿Cuál es la mejor agencia de X?' },
    })
  })

  it('400 — query vacío', async () => {
    mockWorkspace()
    const res = await request(app)
      .post(`/api/marketing/projects/${PROJECT_ID}/visibility/prompts`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ query: '   ' })

    expect(res.status).toBe(400)
    expect(prisma.geoVisibilityPrompt.create).not.toHaveBeenCalled()
  })

  it('400 — ya hay 5 preguntas activas (tope duro de costo)', async () => {
    mockWorkspace()
    prisma.geoVisibilityPrompt.count.mockResolvedValue(5)

    const res = await request(app)
      .post(`/api/marketing/projects/${PROJECT_ID}/visibility/prompts`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ query: 'Otra pregunta más' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Máximo 5/)
    expect(prisma.geoVisibilityPrompt.create).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/marketing/projects/:id/visibility/prompts/:promptId', () => {
  it('400 — reactivar cuando ya hay 5 activas (excluida ella misma, que está inactiva)', async () => {
    mockWorkspace()
    prisma.geoVisibilityPrompt.findFirst.mockResolvedValue({ id: 2, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, active: false, query: 'x' })
    prisma.geoVisibilityPrompt.count.mockResolvedValue(5)

    const res = await request(app)
      .patch(`/api/marketing/projects/${PROJECT_ID}/visibility/prompts/2`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ active: true })

    expect(res.status).toBe(400)
    expect(prisma.geoVisibilityPrompt.update).not.toHaveBeenCalled()
  })

  it('200 — desactivar siempre está permitido aunque haya 5 activas', async () => {
    mockWorkspace()
    prisma.geoVisibilityPrompt.findFirst.mockResolvedValue({ id: 2, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, active: true, query: 'x' })
    prisma.geoVisibilityPrompt.update.mockResolvedValue({ id: 2, active: false })

    const res = await request(app)
      .patch(`/api/marketing/projects/${PROJECT_ID}/visibility/prompts/2`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ active: false })

    expect(res.status).toBe(200)
    expect(prisma.geoVisibilityPrompt.count).not.toHaveBeenCalled()
  })
})

describe('POST /api/marketing/projects/:id/visibility/competitors', () => {
  it('400 — ya hay 4 competidores (tope duro)', async () => {
    mockWorkspace()
    prisma.geoVisibilityCompetitor.count.mockResolvedValue(4)

    const res = await request(app)
      .post(`/api/marketing/projects/${PROJECT_ID}/visibility/competitors`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ name: 'Competidor 5' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Máximo 4/)
    expect(prisma.geoVisibilityCompetitor.create).not.toHaveBeenCalled()
  })

  it('201 — crea el competidor', async () => {
    mockWorkspace()
    prisma.geoVisibilityCompetitor.count.mockResolvedValue(1)
    prisma.geoVisibilityCompetitor.create.mockResolvedValue({ id: 9, name: 'Competidor', domain: 'competidor.com' })

    const res = await request(app)
      .post(`/api/marketing/projects/${PROJECT_ID}/visibility/competitors`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ name: 'Competidor', domain: 'competidor.com' })

    expect(res.status).toBe(201)
  })
})

describe('POST /api/marketing/projects/:id/visibility/runs', () => {
  const { runVisibilityCheck } = require('../../src/services/geoVisibility.service')

  it('400 — no hay preguntas activas configuradas', async () => {
    mockWorkspace()
    prisma.geoVisibilityPrompt.count.mockResolvedValue(0)

    const res = await request(app)
      .post(`/api/marketing/projects/${PROJECT_ID}/visibility/runs`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({})

    expect(res.status).toBe(400)
    expect(prisma.geoVisibilityRun.create).not.toHaveBeenCalled()
    expect(runVisibilityCheck).not.toHaveBeenCalled()
  })

  it('201 — crea la corrida en pending y dispara el análisis async', async () => {
    mockWorkspace()
    prisma.geoVisibilityPrompt.count.mockResolvedValue(2)
    prisma.geoVisibilityRun.create.mockResolvedValue({ id: 7, status: 'pending', projectId: PROJECT_ID, workspaceId: WORKSPACE_ID })

    const res = await request(app)
      .post(`/api/marketing/projects/${PROJECT_ID}/visibility/runs`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({})

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending')
    // setImmediate — darle una vuelta al event loop para que se dispare
    await new Promise(r => setImmediate(r))
    expect(runVisibilityCheck).toHaveBeenCalledWith(7, WORKSPACE_ID, PROJECT_ID, 1)
  })
})

describe('GET /api/marketing/projects/:id/visibility/runs/:runId', () => {
  it('parsea los campos JSON de cada resultado', async () => {
    mockWorkspace()
    prisma.geoVisibilityRun.findFirst.mockResolvedValue({
      id: 7, status: 'completed', projectId: PROJECT_ID, workspaceId: WORKSPACE_ID,
      results: [
        {
          id: 1, promptId: 3, ownMentioned: true, ownPosition: 1,
          competitorsMentioned: JSON.stringify([{ id: 9, name: 'Competidor', mentioned: false, position: null }]),
          sources: JSON.stringify([{ url: 'https://x.com', title: 'X' }]),
          prompt: { id: 3, query: '¿Cuál es la mejor agencia?' },
        },
      ],
    })

    const res = await request(app)
      .get(`/api/marketing/projects/${PROJECT_ID}/visibility/runs/7`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.results[0].competitorsMentioned).toEqual([{ id: 9, name: 'Competidor', mentioned: false, position: null }])
    expect(res.body.results[0].sources).toEqual([{ url: 'https://x.com', title: 'X' }])
  })

  it('404 — corrida de otro proyecto/workspace', async () => {
    mockWorkspace()
    prisma.geoVisibilityRun.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .get(`/api/marketing/projects/${PROJECT_ID}/visibility/runs/999`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(404)
  })
})
