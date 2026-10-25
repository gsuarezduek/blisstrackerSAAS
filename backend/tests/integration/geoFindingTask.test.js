jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  project:         { findFirst: jest.fn() },
  geoAudit:        { findFirst: jest.fn() },
  task:            { findFirst: jest.fn() },
  geoFindingTask:  { create: jest.fn(), findFirst: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const AUDIT_ID        = 20
const PROJECT_ID      = 10

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
}

beforeEach(() => jest.clearAllMocks())

// Vínculo (auditId, itemIndex) -> taskId: ver concepto "GEO — recomendaciones
// vinculadas a tareas" — la Task siempre se crea por el POST /tasks normal
// (con sus validaciones de proyecto privado); este endpoint solo linkea.
describe('POST /api/marketing/geo/audits/:auditId/findings/:itemIndex/task', () => {
  const findings = JSON.stringify([
    { severity: 'high', title: 'Falta llms.txt', action: 'Agregar llms.txt' },
    { severity: 'low',  title: 'Falta autoría',  action: 'Agregar autor' },
  ])

  it('201 — crea el vínculo cuando la tarea es del mismo proyecto y workspace', async () => {
    mockWorkspace()
    prisma.geoAudit.findFirst.mockResolvedValue({ id: AUDIT_ID, projectId: PROJECT_ID, findings })
    prisma.task.findFirst.mockResolvedValue({ id: 55, projectId: PROJECT_ID, workDay: { workspaceId: WORKSPACE_ID } })
    prisma.geoFindingTask.create.mockResolvedValue({ id: 1, auditId: AUDIT_ID, itemIndex: 0, taskId: 55 })

    const res = await request(app)
      .post(`/api/marketing/geo/audits/${AUDIT_ID}/findings/0/task`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ taskId: 55 })

    expect(res.status).toBe(201)
    expect(prisma.geoFindingTask.create).toHaveBeenCalledWith({
      data: { workspaceId: WORKSPACE_ID, auditId: AUDIT_ID, itemIndex: 0, taskId: 55 },
    })
  })

  it('400 — itemIndex fuera de rango del array de findings', async () => {
    mockWorkspace()
    prisma.geoAudit.findFirst.mockResolvedValue({ id: AUDIT_ID, projectId: PROJECT_ID, findings })

    const res = await request(app)
      .post(`/api/marketing/geo/audits/${AUDIT_ID}/findings/5/task`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ taskId: 55 })

    expect(res.status).toBe(400)
    expect(prisma.geoFindingTask.create).not.toHaveBeenCalled()
  })

  it('404 — la tarea pertenece a otro workspace (no se puede vincular una tarea ajena)', async () => {
    mockWorkspace()
    prisma.geoAudit.findFirst.mockResolvedValue({ id: AUDIT_ID, projectId: PROJECT_ID, findings })
    prisma.task.findFirst.mockResolvedValue({ id: 55, projectId: PROJECT_ID, workDay: { workspaceId: 999 } })

    const res = await request(app)
      .post(`/api/marketing/geo/audits/${AUDIT_ID}/findings/0/task`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ taskId: 55 })

    expect(res.status).toBe(404)
    expect(prisma.geoFindingTask.create).not.toHaveBeenCalled()
  })

  it('404 — no existe ninguna tarea con ese id en el proyecto del audit', async () => {
    mockWorkspace()
    prisma.geoAudit.findFirst.mockResolvedValue({ id: AUDIT_ID, projectId: PROJECT_ID, findings })
    prisma.task.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post(`/api/marketing/geo/audits/${AUDIT_ID}/findings/0/task`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ taskId: 999 })

    expect(res.status).toBe(404)
  })

  it('409 — ya existe un vínculo para ese (auditId, itemIndex), devuelve el taskId existente', async () => {
    mockWorkspace()
    prisma.geoAudit.findFirst.mockResolvedValue({ id: AUDIT_ID, projectId: PROJECT_ID, findings })
    prisma.task.findFirst.mockResolvedValue({ id: 56, projectId: PROJECT_ID, workDay: { workspaceId: WORKSPACE_ID } })
    const dup = new Error('Unique constraint failed')
    dup.code = 'P2002'
    prisma.geoFindingTask.create.mockRejectedValue(dup)
    prisma.geoFindingTask.findFirst.mockResolvedValue({ id: 1, auditId: AUDIT_ID, itemIndex: 0, taskId: 55 })

    const res = await request(app)
      .post(`/api/marketing/geo/audits/${AUDIT_ID}/findings/0/task`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)
      .send({ taskId: 56 })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'already_linked', taskId: 55 })
  })
})

describe('GET /api/marketing/geo/audits/:id — findings anotados con la tarea vinculada', () => {
  it('cada item trae itemIndex siempre, y taskId/task solo si hay vínculo', async () => {
    mockWorkspace()
    const findings = JSON.stringify([
      { severity: 'high', title: 'Falta llms.txt' },
      { severity: 'low',  title: 'Falta autoría' },
    ])
    prisma.geoAudit.findFirst.mockResolvedValue({
      id: AUDIT_ID, workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, status: 'completed',
      findings, recommendations: '[]',
      project: { name: 'Proyecto X', websiteUrl: 'https://x.com' },
      geoFindingTasks: [
        { itemIndex: 0, task: { id: 55, status: 'IN_PROGRESS' } },
      ],
    })

    const res = await request(app)
      .get(`/api/marketing/geo/audits/${AUDIT_ID}`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.findings[0]).toMatchObject({ itemIndex: 0, taskId: 55, task: { id: 55, status: 'IN_PROGRESS' } })
    expect(res.body.findings[1]).toMatchObject({ itemIndex: 1, taskId: null, task: null })
  })

  it('expone pagesCrawled y llmsTxtExists parseados de rawData — señal real para el botón "Generar llms.txt", no texto de los findings', async () => {
    mockWorkspace()
    prisma.geoAudit.findFirst.mockResolvedValue({
      id: AUDIT_ID, workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, status: 'completed',
      findings: '[]', recommendations: '[]',
      rawData: JSON.stringify({ pagesCrawled: 3, llmsTxtExists: true }),
      project: { name: 'Proyecto X', websiteUrl: 'https://x.com' },
      geoFindingTasks: [],
    })

    const res = await request(app)
      .get(`/api/marketing/geo/audits/${AUDIT_ID}`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.pagesCrawled).toBe(3)
    expect(res.body.llmsTxtExists).toBe(true)
  })

  it('rawData ausente o corrupto no rompe la respuesta — pagesCrawled/llmsTxtExists quedan null', async () => {
    mockWorkspace()
    prisma.geoAudit.findFirst.mockResolvedValue({
      id: AUDIT_ID, workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, status: 'completed',
      findings: '[]', recommendations: '[]',
      rawData: null,
      project: { name: 'Proyecto X', websiteUrl: 'https://x.com' },
      geoFindingTasks: [],
    })

    const res = await request(app)
      .get(`/api/marketing/geo/audits/${AUDIT_ID}`)
      .set('Authorization', authHeader())
      .set('X-Workspace', WORKSPACE_SLUG)

    expect(res.status).toBe(200)
    expect(res.body.pagesCrawled).toBeNull()
    expect(res.body.llmsTxtExists).toBeNull()
  })
})
