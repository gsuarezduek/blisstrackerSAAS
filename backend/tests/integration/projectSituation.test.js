jest.mock('../../src/lib/prisma', () => ({
  workspace:             { findUnique: jest.fn() },
  workspaceMember:       { findUnique: jest.fn() },
  projectMember:         { findUnique: jest.fn() },
  project:               { findUnique: jest.fn(), findFirst: jest.fn() },
  projectSituationEntry: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')
const { toHtml } = require('../../src/controllers/projects/projectSituation.controller')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function authHeader(userId = 1, role = 'member', extra = {}) {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com', ...extra },
    SECRET,
  )
  return `Bearer ${token}`
}

function mockProject({ role = 'member', userId = 1, situationEnabled = true } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss' })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId, role, active: true })
  prisma.project.findFirst.mockResolvedValue({ id: 7 })
  prisma.project.findUnique.mockResolvedValue({ id: 7, isPrivate: false, situationEnabled })
}

function call(method, path, { userId = 1, role = 'member', extra } = {}) {
  return request(app)[method](`/api/projects/7/situation${path}`)
    .set('Authorization', authHeader(userId, role, extra))
    .set('X-Workspace', WORKSPACE_SLUG)
}

beforeEach(() => jest.clearAllMocks())

describe('GET /api/projects/:id/situation', () => {
  it('lista las hojas y marca la más nueva como actual', async () => {
    mockProject()
    prisma.projectSituationEntry.findMany.mockResolvedValue([
      { id: 3, content: '<p>nueva</p>', createdById: 1 },
      { id: 2, content: '<p>vieja</p>', createdById: 2 },
    ])

    const res = await call('get', '')
    expect(res.status).toBe(200)
    expect(res.body.entries.map(e => [e.id, e.isCurrent, e.canDelete])).toEqual([[3, true, true], [2, false, false]])
  })

  it('403 si la sección está apagada en el workspace', async () => {
    mockProject({ situationEnabled: false })
    const res = await call('get', '')
    expect(res.status).toBe(403)
  })
})

describe('POST /api/projects/:id/situation', () => {
  it('crea una hoja nueva con autor y agente', async () => {
    mockProject()
    prisma.projectSituationEntry.create.mockImplementation(({ data }) => Promise.resolve({ id: 4, ...data }))

    const res = await call('post', '', { extra: { mcpTokenId: 9 } }).send({ content: 'Hola\n\nChau' })
    expect(res.status).toBe(201)
    expect(res.body.isCurrent).toBe(true)
    expect(prisma.projectSituationEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ projectId: 7, content: '<p>Hola</p><p>Chau</p>', createdById: 1, createdByAgentId: 9 }),
    }))
  })

  it('400 si la hoja nueva está vacía', async () => {
    mockProject()
    const res = await call('post', '').send({ content: '<p></p>' })
    expect(res.status).toBe(400)
    expect(prisma.projectSituationEntry.create).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/projects/:id/situation/:entryId', () => {
  it('edita la hoja actual', async () => {
    mockProject()
    prisma.projectSituationEntry.findFirst
      .mockResolvedValueOnce({ id: 3 })  // la hoja pedida
      .mockResolvedValueOnce({ id: 3 })  // la más nueva
    prisma.projectSituationEntry.update.mockResolvedValue({ id: 3, content: '<p>x</p>', createdById: 2 })

    const res = await call('patch', '/3').send({ content: '<p>x</p>' })
    expect(res.status).toBe(200)
    expect(prisma.projectSituationEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 3 }, data: expect.objectContaining({ content: '<p>x</p>', updatedById: 1, updatedByAgentId: null }),
    }))
  })

  it('409 sobre una hoja anterior (solo lectura)', async () => {
    mockProject()
    prisma.projectSituationEntry.findFirst
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce({ id: 3 })

    const res = await call('patch', '/2').send({ content: '<p>x</p>' })
    expect(res.status).toBe(409)
    expect(prisma.projectSituationEntry.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/projects/:id/situation/:entryId', () => {
  it('quien creó la hoja la puede borrar', async () => {
    mockProject()
    prisma.projectSituationEntry.findFirst.mockResolvedValue({ id: 2, createdById: 1 })
    prisma.projectSituationEntry.delete.mockResolvedValue({})

    const res = await call('delete', '/2')
    expect(res.status).toBe(200)
    expect(prisma.projectSituationEntry.delete).toHaveBeenCalledWith({ where: { id: 2 } })
  })

  it('403 para un miembro que no la creó', async () => {
    mockProject()
    prisma.projectSituationEntry.findFirst.mockResolvedValue({ id: 2, createdById: 5 })

    const res = await call('delete', '/2')
    expect(res.status).toBe(403)
    expect(prisma.projectSituationEntry.delete).not.toHaveBeenCalled()
  })

  it('un admin borra cualquiera, incluida la hoja migrada sin autor', async () => {
    mockProject({ role: 'admin' })
    prisma.projectSituationEntry.findFirst.mockResolvedValue({ id: 1, createdById: null })
    prisma.projectSituationEntry.delete.mockResolvedValue({})

    const res = await call('delete', '/1', { role: 'admin' })
    expect(res.status).toBe(200)
  })
})

describe('toHtml', () => {
  it('deja el HTML tal cual y arma párrafos escapados con texto plano', () => {
    expect(toHtml('<h2>Título</h2><p>x</p>')).toBe('<h2>Título</h2><p>x</p>')
    expect(toHtml('a < b\nc\n\nd')).toBe('<p>a &lt; b<br>c</p><p>d</p>')
    expect(toHtml('   ')).toBe('')
  })
})
