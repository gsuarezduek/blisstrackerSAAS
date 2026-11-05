jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  financeInvoice:  { findFirst: jest.fn(), update: jest.fn() },
  financeAuditLog: { create: jest.fn() },
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

// Factura informativa: la cargó una persona a mano, sin emisor de ARCA.
function informativeInvoice(overrides = {}) {
  return {
    id: 10, workspaceId: WORKSPACE_ID, itemId: 5, number: 'FC A 0001-00000161',
    issueDate: new Date('2026-10-01T12:00:00Z'), dueDate: new Date('2026-10-11T12:00:00Z'),
    concept: 'Fee mensual', amount: '100000', currency: 'ARS', kind: 'invoice',
    issuerId: null, cae: null, arcaStatus: null,
    item: { name: 'Cliente Test' }, collections: [],
    ...overrides,
  }
}

function patch(body) {
  return request(app)
    .patch('/api/finanzas/invoices/10')
    .set('Authorization', authHeader())
    .set('X-Workspace', WORKSPACE_SLUG)
    .send(body)
}

describe('PATCH /api/finanzas/invoices/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAccess()
  })

  it('edita una factura informativa (número, fechas, concepto y monto)', async () => {
    prisma.financeInvoice.findFirst.mockResolvedValue(informativeInvoice())
    prisma.financeInvoice.update.mockResolvedValue({
      ...informativeInvoice(), number: 'FC A 0001-00000162', amount: '150000', concept: 'Fee + extra',
    })

    const res = await patch({ number: 'FC A 0001-00000162', amount: 150000, concept: 'Fee + extra', issueDate: '2026-10-02', dueDate: '2026-10-20' })

    expect(res.status).toBe(200)
    expect(prisma.financeInvoice.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 10 },
      data: expect.objectContaining({
        number: 'FC A 0001-00000162', amount: '150000', concept: 'Fee + extra',
        issueDate: new Date('2026-10-02T12:00:00Z'), dueDate: new Date('2026-10-20T12:00:00Z'),
      }),
    }))
  })

  it('rechaza editar una factura con CAE y manda a la nota de crédito', async () => {
    prisma.financeInvoice.findFirst.mockResolvedValue(informativeInvoice({
      issuerId: 3, cae: '75123456789012', arcaStatus: 'authorized',
    }))

    const res = await patch({ amount: 150000 })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/nota de cr[ée]dito/i)
    expect(prisma.financeInvoice.update).not.toHaveBeenCalled()
  })

  // Un comprobante mandado a ARCA que todavía no tiene CAE puede volver
  // `authorized` al reconciliar: editarlo a mano dejaría la fila distinta del
  // comprobante que ARCA guardó.
  it('rechaza editar una emisión de ARCA sin CAE (pendiente de confirmar)', async () => {
    prisma.financeInvoice.findFirst.mockResolvedValue(informativeInvoice({
      issuerId: 3, number: null, cae: null, arcaStatus: 'indeterminate',
    }))

    const res = await patch({ number: 'inventado' })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/ARCA/)
    expect(prisma.financeInvoice.update).not.toHaveBeenCalled()
  })

  it('rechaza bajar el monto por debajo de lo ya cobrado', async () => {
    prisma.financeInvoice.findFirst.mockResolvedValue(informativeInvoice({
      collections: [{ amount: '60000' }, { amount: '20000' }],
    }))

    const res = await patch({ amount: 50000 })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/80000/)
    expect(prisma.financeInvoice.update).not.toHaveBeenCalled()
  })

  it('acepta un monto igual a lo ya cobrado', async () => {
    prisma.financeInvoice.findFirst.mockResolvedValue(informativeInvoice({
      collections: [{ amount: '60000' }, { amount: '20000' }],
    }))
    prisma.financeInvoice.update.mockResolvedValue(informativeInvoice({ amount: '80000' }))

    const res = await patch({ amount: 80000 })

    expect(res.status).toBe(200)
    expect(prisma.financeInvoice.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: '80000' }),
    }))
  })
})
