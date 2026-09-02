jest.mock('../../src/lib/prisma', () => {
  const prisma = {
    workspace: { findUnique: jest.fn() },
    featureFlag: { findUnique: jest.fn() },
    company: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  }
  prisma.$transaction = jest.fn((arg) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)))
  return prisma
})

const request = require('supertest')
const jwt = require('jsonwebtoken')
const prisma = require('../../src/lib/prisma')
const app = require('../../src/app')

const SECRET = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID = 1

function makeToken(userId = 1, role = 'admin') {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test User', email: 'test@bliss.ar' },
    SECRET,
  )}`
}

// Mirror del shape real de resolveWorkspace: workspace.findUnique trae `members`
// embebido (1 sola query) — sin members no dispara el fallback a workspaceMember.
function mockWorkspace(role = 'admin', teamRole = null) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss Marketing',
    timezone: 'America/Argentina/Buenos_Aires', moduleAccess: {}, disabledFeatureKeys: '[]',
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role, teamRole, active: true }],
  })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'ventas', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

function req(method, url) {
  return request(app)[method](url).set('X-Workspace', WORKSPACE_SLUG).set('Authorization', makeToken())
}

describe('POST /api/ventas/companies', () => {
  it('crea una empresa con nombre válido', async () => {
    mockWorkspace()
    prisma.company.create.mockResolvedValue({ id: 10, name: 'Acme', website: null, industry: null, notes: null })

    const res = await req('post', '/api/ventas/companies').send({ name: 'Acme' })

    expect(res.status).toBe(201)
    expect(prisma.company.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workspaceId: WORKSPACE_ID, name: 'Acme' }),
    }))
  })

  it('rechaza sin nombre', async () => {
    mockWorkspace()
    const res = await req('post', '/api/ventas/companies').send({ name: '   ' })
    expect(res.status).toBe(400)
    expect(prisma.company.create).not.toHaveBeenCalled()
  })

  it('rechaza usuarios sin acceso al equipo comercial', async () => {
    mockWorkspace('member', null) // ni admin/owner ni teamRole habilitado en moduleAccess
    const res = await req('post', '/api/ventas/companies').send({ name: 'Acme' })
    expect(res.status).toBe(403)
  })
})

describe('GET/PATCH/DELETE /api/ventas/companies/:id', () => {
  it('404 si la empresa no existe en el workspace', async () => {
    mockWorkspace()
    prisma.company.findFirst.mockResolvedValue(null)
    const res = await req('patch', '/api/ventas/companies/99').send({ name: 'Nuevo nombre' })
    expect(res.status).toBe(404)
  })

  it('actualiza una empresa existente', async () => {
    mockWorkspace()
    prisma.company.findFirst.mockResolvedValue({ id: 5 })
    prisma.company.update.mockResolvedValue({ id: 5, name: 'Nuevo nombre' })
    const res = await req('patch', '/api/ventas/companies/5').send({ name: 'Nuevo nombre' })
    expect(res.status).toBe(200)
    expect(prisma.company.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { name: 'Nuevo nombre' } })
  })

  it('elimina una empresa existente (cascada de contactos/leads en DB)', async () => {
    mockWorkspace()
    prisma.company.findFirst.mockResolvedValue({ id: 5 })
    prisma.company.delete.mockResolvedValue({ id: 5 })
    const res = await req('delete', '/api/ventas/companies/5')
    expect(res.status).toBe(200)
    expect(prisma.company.delete).toHaveBeenCalledWith({ where: { id: 5 } })
  })
})
