jest.mock('../../src/lib/prisma', () => {
  const prisma = {
    workspace: { findUnique: jest.fn() },
    featureFlag: { findUnique: jest.fn() },
    company: { findFirst: jest.fn() },
    contact: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
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

function mockWorkspace(role = 'admin') {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss Marketing',
    timezone: 'America/Argentina/Buenos_Aires', salesRoleNames: '[]', disabledFeatureKeys: '[]',
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role, teamRole: null, active: true }],
  })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'ventas', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

function req(method, url) {
  return request(app)[method](url).set('X-Workspace', WORKSPACE_SLUG).set('Authorization', makeToken())
}

describe('POST /api/ventas/contacts', () => {
  it('normaliza el teléfono a "+<dígitos>" al crear', async () => {
    mockWorkspace()
    prisma.company.findFirst.mockResolvedValue({ id: 1 })
    prisma.contact.create.mockResolvedValue({ id: 1, name: 'Juan', phone: '+5491123456789' })

    const res = await req('post', '/api/ventas/contacts').send({ companyId: 1, name: 'Juan', phone: '+54 9 11 2345-6789' })

    expect(res.status).toBe(201)
    expect(prisma.contact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phone: '+5491123456789' }),
    }))
  })

  it('guarda null si el teléfono no tiene ningún dígito', async () => {
    mockWorkspace()
    prisma.company.findFirst.mockResolvedValue({ id: 1 })
    prisma.contact.create.mockResolvedValue({ id: 1, name: 'Juan', phone: null })

    await req('post', '/api/ventas/contacts').send({ companyId: 1, name: 'Juan', phone: 'N/A' })

    expect(prisma.contact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phone: null }),
    }))
  })

  it('rechaza sin nombre', async () => {
    mockWorkspace()
    prisma.company.findFirst.mockResolvedValue({ id: 1 })
    const res = await req('post', '/api/ventas/contacts').send({ companyId: 1, name: '' })
    expect(res.status).toBe(400)
  })

  it('404 si la empresa no existe en el workspace', async () => {
    mockWorkspace()
    prisma.company.findFirst.mockResolvedValue(null)
    const res = await req('post', '/api/ventas/contacts').send({ companyId: 999, name: 'Juan' })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/ventas/contacts/:id', () => {
  it('normaliza el teléfono también al editar', async () => {
    mockWorkspace()
    prisma.contact.findFirst.mockResolvedValue({ id: 1 })
    prisma.contact.update.mockResolvedValue({ id: 1, phone: '+01144445555' })

    await req('patch', '/api/ventas/contacts/1').send({ phone: '(011) 4444-5555' })

    expect(prisma.contact.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { phone: '+01144445555' } })
  })
})
