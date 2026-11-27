jest.mock('../../src/lib/prisma', () => {
  const m = {
    workspace:       { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    featureFlag:     { findUnique: jest.fn() },
    financeAccount:  { findMany: jest.fn(), update: jest.fn(), aggregate: jest.fn(), create: jest.fn() },
    financeAuditLog: { create: jest.fn() },
  }
  m.$transaction = jest.fn(arg => Promise.all(arg))
  return m
})

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET

function authHeader(role = 'admin') {
  return `Bearer ${jwt.sign({ userId: 1, workspaceId: 1, role, isSuperAdmin: false, name: 'T', email: 't@t.com' }, SECRET)}`
}

function mockAccess(role = 'admin') {
  prisma.workspace.findUnique.mockResolvedValue({
    id: 1, slug: 'bliss', status: 'active', name: 'Bliss', disabledFeatureKeys: '[]',
    members: [{ workspaceId: 1, userId: 1, role, active: true }],
  })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'finanzas', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

const reorder = (body, role) => request(app).put('/api/finanzas/accounts/reorder')
  .set('Authorization', authHeader(role)).set('X-Workspace', 'bliss').send(body)

describe('PUT /api/finanzas/accounts/reorder', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAccess()
    // Cuentas del workspace en su orden actual.
    prisma.financeAccount.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }])
    prisma.financeAccount.update.mockResolvedValue({})
  })

  const savedOrder = () => prisma.financeAccount.update.mock.calls.map(c => [c[0].where.id, c[0].data.sortOrder])

  it('guarda el orden pedido, de arriba hacia abajo', async () => {
    const res = await reorder({ orderedIds: [3, 1, 2] })
    expect(res.status).toBe(200)
    expect(savedOrder()).toEqual([[3, 0], [1, 1], [2, 2]])
    expect(prisma.financeAccount.findMany.mock.calls[0][0].where).toEqual({ workspaceId: 1 })
  })

  it('ignora ids de otro workspace y deja al final las que no vinieron', async () => {
    await reorder({ orderedIds: [2, 99] })
    expect(savedOrder()).toEqual([[2, 0], [1, 1], [3, 2]])
  })

  it('400 sin array', async () => {
    const res = await reorder({ orderedIds: 'x' })
    expect(res.status).toBe(400)
    expect(prisma.financeAccount.update).not.toHaveBeenCalled()
  })

  it('solo admin', async () => {
    mockAccess('member')
    const res = await reorder({ orderedIds: [1] }, 'member')
    expect(res.status).toBe(403)
  })
})

describe('POST /api/finanzas/accounts — orden', () => {
  beforeEach(() => { jest.clearAllMocks(); mockAccess() })

  it('una cuenta nueva va al final', async () => {
    prisma.financeAccount.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } })
    prisma.financeAccount.create.mockImplementation(async ({ data }) => ({ id: 9, ...data }))
    const res = await request(app).post('/api/finanzas/accounts')
      .set('Authorization', authHeader()).set('X-Workspace', 'bliss')
      .send({ name: 'Brubank', type: 'bank', currency: 'ARS' })
    expect(res.status).toBe(201)
    expect(prisma.financeAccount.create.mock.calls[0][0].data.sortOrder).toBe(5)
  })

  it('la primera cuenta del workspace arranca en 0', async () => {
    prisma.financeAccount.aggregate.mockResolvedValue({ _max: { sortOrder: null } })
    prisma.financeAccount.create.mockImplementation(async ({ data }) => ({ id: 9, ...data }))
    await request(app).post('/api/finanzas/accounts')
      .set('Authorization', authHeader()).set('X-Workspace', 'bliss')
      .send({ name: 'Brubank', type: 'bank', currency: 'ARS' })
    expect(prisma.financeAccount.create.mock.calls[0][0].data.sortOrder).toBe(0)
  })
})

describe('cuentas — En Saldos cuenta como', () => {
  beforeEach(() => {
    jest.clearAllMocks(); mockAccess()
    prisma.financeAccount.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } })
    prisma.financeAccount.create.mockImplementation(async ({ data }) => ({ id: 9, ...data }))
  })
  const create = body => request(app).post('/api/finanzas/accounts')
    .set('Authorization', authHeader()).set('X-Workspace', 'bliss').send(body)

  it('por defecto es disponible', async () => {
    await create({ name: 'Brubank', type: 'bank', currency: 'ARS' })
    expect(prisma.financeAccount.create.mock.calls[0][0].data.balanceGroup).toBe('available')
  })

  it('acepta inversión en cualquier tipo de cuenta', async () => {
    const res = await create({ name: 'Plazo fijo', type: 'bank', currency: 'USD', balanceGroup: 'investment' })
    expect(res.status).toBe(201)
    expect(prisma.financeAccount.create.mock.calls[0][0].data.balanceGroup).toBe('investment')
  })

  it('400 con un grupo que no existe', async () => {
    const res = await create({ name: 'X', type: 'bank', currency: 'ARS', balanceGroup: 'largo_plazo' })
    expect(res.status).toBe(400)
    expect(prisma.financeAccount.create).not.toHaveBeenCalled()
  })
})
