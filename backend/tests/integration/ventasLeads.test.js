jest.mock('../../src/lib/prisma', () => {
  const prisma = {
    workspace: { findUnique: jest.fn() },
    featureFlag: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    company: { findFirst: jest.fn(), create: jest.fn() },
    contact: { findFirst: jest.fn(), create: jest.fn() },
    lead: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    leadAction: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
    leadActivity: { create: jest.fn() },
    notification: { create: jest.fn() },
    proposal: { count: jest.fn() },
    task: { updateMany: jest.fn() },
    taskSession: { updateMany: jest.fn() },
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
  prisma.workspaceMember.findUnique.mockResolvedValue({ active: true })
}

function req(method, url) {
  return request(app)[method](url).set('X-Workspace', WORKSPACE_SLUG).set('Authorization', makeToken())
}

function baseLead(overrides = {}) {
  return {
    id: 1, workspaceId: WORKSPACE_ID, companyId: 1, primaryContactId: null, ownerId: null,
    title: 'Rediseño web', status: 'prospecto', archived: false, convertedProjectId: null,
    company: { id: 1, name: 'Acme' },
    ...overrides,
  }
}

describe('POST /api/ventas/leads', () => {
  it('crea un lead con empresa existente', async () => {
    mockWorkspace()
    prisma.company.findFirst.mockResolvedValue({ id: 1 })
    prisma.lead.create.mockResolvedValue(baseLead())

    const res = await req('post', '/api/ventas/leads').send({ companyId: 1, title: 'Rediseño web' })

    expect(res.status).toBe(201)
    expect(prisma.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workspaceId: WORKSPACE_ID, companyId: 1, status: 'prospecto' }),
    }))
  })

  it('rechaza sin empresa (ni companyId ni newCompany)', async () => {
    mockWorkspace()
    const res = await req('post', '/api/ventas/leads').send({ title: 'Sin empresa' })
    expect(res.status).toBe(400)
    expect(prisma.lead.create).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/ventas/leads/:id/status', () => {
  it('exige motivo al pasar a Perdido', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue(baseLead({ status: 'propuesta' }))
    const res = await req('patch', '/api/ventas/leads/1/status').send({ status: 'perdido' })
    expect(res.status).toBe(400)
    expect(prisma.lead.update).not.toHaveBeenCalled()
  })

  it('marca perdido con motivo y sella lostAt/lostReason', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue(baseLead({ status: 'propuesta' }))
    prisma.lead.update.mockResolvedValue({})

    const res = await req('patch', '/api/ventas/leads/1/status').send({ status: 'perdido', lostReason: 'Eligió otra agencia' })

    expect(res.status).toBe(200)
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ status: 'perdido', lostReason: 'Eligió otra agencia' }),
    })
    const updateArgs = prisma.lead.update.mock.calls[0][0]
    expect(updateArgs.data.lostAt).toBeInstanceOf(Date)
  })

  it('404 si el lead no existe en el workspace', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue(null)
    const res = await req('patch', '/api/ventas/leads/999/status').send({ status: 'propuesta' })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/ventas/leads/:id/archive', () => {
  it('archiva un lead activo', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue(baseLead({ archived: false }))
    prisma.lead.update.mockResolvedValue({})

    const res = await req('patch', '/api/ventas/leads/1/archive').send({ archived: true })

    expect(res.status).toBe(200)
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ archived: true }),
    })
  })
})

describe('Próximas acciones', () => {
  it('POST .../actions crea una acción sin fecha (no dispara la tarea vinculada)', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue(baseLead())
    prisma.leadAction.create.mockResolvedValue({ id: 5, title: 'Llamar', status: 'pending' })

    const res = await req('post', '/api/ventas/leads/1/actions').send({ title: 'Llamar' })

    expect(res.status).toBe(201)
    expect(prisma.leadAction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ leadId: 1, title: 'Llamar' }),
    }))
  })

  it('rechaza una acción sin título', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue(baseLead())
    const res = await req('post', '/api/ventas/leads/1/actions').send({ title: '  ' })
    expect(res.status).toBe(400)
  })

  it('PATCH .../resolve marca la acción como hecha', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue(baseLead())
    prisma.leadAction.findFirst.mockResolvedValue({ id: 5, leadId: 1, status: 'pending', title: 'Llamar', taskId: null })
    prisma.leadAction.update.mockResolvedValue({})

    const res = await req('patch', '/api/ventas/leads/1/actions/5/resolve')

    expect(res.status).toBe(200)
    expect(prisma.leadAction.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({ status: 'done' }),
    })
  })

  it('resolver dos veces no vuelve a tocar la DB (ya estaba "done")', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue(baseLead())
    prisma.leadAction.findFirst.mockResolvedValue({ id: 5, leadId: 1, status: 'done', title: 'Llamar', taskId: null })

    const res = await req('patch', '/api/ventas/leads/1/actions/5/resolve')

    expect(res.status).toBe(200)
    expect(prisma.leadAction.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/ventas/leads/:id', () => {
  it('elimina un lead sin propuestas confirmadas', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue(baseLead())
    prisma.proposal.count.mockResolvedValue(0)
    prisma.lead.delete.mockResolvedValue({})

    const res = await req('delete', '/api/ventas/leads/1')

    expect(res.status).toBe(200)
    expect(prisma.lead.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it('bloquea el borrado si hay una propuesta confirmada', async () => {
    mockWorkspace()
    prisma.lead.findFirst.mockResolvedValue(baseLead())
    prisma.proposal.count.mockResolvedValue(1)

    const res = await req('delete', '/api/ventas/leads/1')

    expect(res.status).toBe(409)
    expect(prisma.lead.delete).not.toHaveBeenCalled()
  })
})
