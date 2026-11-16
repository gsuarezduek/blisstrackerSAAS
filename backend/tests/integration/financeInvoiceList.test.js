jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  financeInvoice:  { findMany: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function authHeader() {
  const token = jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role: 'admin', isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function mockAccess() {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]', financeIvaMode: 'add',
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role: 'admin', active: true }],
  })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'finanzas', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

function list(query) {
  return request(app)
    .get('/api/finanzas/invoices')
    .query(query)
    .set('Authorization', authHeader())
    .set('X-Workspace', WORKSPACE_SLUG)
}

function whereOfLastCall() {
  return prisma.financeInvoice.findMany.mock.calls.at(-1)[0].where
}

// Pestaña Facturas: el listado de todo el workspace, por período de emisión y por emisor.
describe('GET /api/finanzas/invoices — período y emisor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAccess()
    prisma.financeInvoice.findMany.mockResolvedValue([])
  })

  it('sin cliente lista las de todo el workspace', async () => {
    const res = await list({})
    expect(res.status).toBe(200)
    expect(whereOfLastCall()).toEqual({ workspaceId: WORKSPACE_ID, deletedAt: null })
  })

  it('from/to toman los días de emisión enteros, inclusive', async () => {
    const res = await list({ from: '2026-10-01', to: '2026-10-31' })
    expect(res.status).toBe(200)
    expect(whereOfLastCall().issueDate).toEqual({
      gte: new Date('2026-10-01T00:00:00.000Z'),
      lte: new Date('2026-10-31T23:59:59.999Z'),
    })
  })

  it('acepta un solo extremo del rango', async () => {
    await list({ from: '2026-11-01' })
    expect(whereOfLastCall().issueDate).toEqual({ gte: new Date('2026-11-01T00:00:00.000Z') })
  })

  it('rechaza una fecha mal formada en vez de ignorarla', async () => {
    const res = await list({ from: '01/10/2026' })
    expect(res.status).toBe(400)
    expect(prisma.financeInvoice.findMany).not.toHaveBeenCalled()
  })

  it('rechaza un rango invertido', async () => {
    const res = await list({ from: '2026-11-01', to: '2026-10-01' })
    expect(res.status).toBe(400)
  })

  it('filtra por emisor', async () => {
    await list({ issuerId: '3' })
    expect(whereOfLastCall().issuerId).toBe(3)
  })

  it('issuerId=none trae las informativas (sin emisor)', async () => {
    await list({ issuerId: 'none' })
    expect(whereOfLastCall().issuerId).toBeNull()
  })

  it('rechaza un emisor inválido', async () => {
    const res = await list({ issuerId: 'abc' })
    expect(res.status).toBe(400)
  })

  it('combina período, emisor y cliente', async () => {
    await list({ from: '2026-10-01', to: '2026-10-31', issuerId: '3', itemId: '5' })
    expect(whereOfLastCall()).toEqual(expect.objectContaining({
      workspaceId: WORKSPACE_ID, itemId: 5, issuerId: 3,
      issueDate: { gte: new Date('2026-10-01T00:00:00.000Z'), lte: new Date('2026-10-31T23:59:59.999Z') },
    }))
  })

  it('el filtro por año del detalle del cliente sigue igual', async () => {
    await list({ itemId: '5', year: '2026' })
    expect(whereOfLastCall().issueDate).toEqual({
      gte: new Date(Date.UTC(2026, 0, 1)), lt: new Date(Date.UTC(2027, 0, 1)),
    })
  })
})
