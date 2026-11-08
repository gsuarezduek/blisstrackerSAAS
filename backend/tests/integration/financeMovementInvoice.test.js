jest.mock('../../src/lib/prisma', () => {
  const m = {
    workspace:       { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    featureFlag:     { findUnique: jest.fn() },
    financeMovement: {
      findFirst:  jest.fn(),
      findUnique: jest.fn(),
      update:     jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      aggregate:  jest.fn(),
    },
    financeItem:        { findFirst: jest.fn() },
    financeCategory:    { findFirst: jest.fn() },
    financeAccount:     { findFirst: jest.fn() },
    financeInvoice:     { findFirst: jest.fn() },
    financeMovementTax: { findMany: jest.fn(), deleteMany: jest.fn() },
    financeExtraPayment:   { update: jest.fn() },
    financeExtra:          { updateMany: jest.fn(), findUnique: jest.fn() },
    financeExtraTeamPayout: { findUnique: jest.fn() },
    financeAuditLog:    { create: jest.fn() },
  }
  m.$transaction = jest.fn(arg => (typeof arg === 'function' ? arg(m) : Promise.all(arg)))
  return m
})

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const MOVEMENT_ID    = 50
const CUSTOMER_ID    = 5
const INVOICE_ID     = 10

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

// Un cobro de un cliente cargado "a cuenta" (el caso real: el cliente pagó
// antes de que se emitiera la factura).
function onAccountIncome(overrides = {}) {
  return {
    id: MOVEMENT_ID, workspaceId: WORKSPACE_ID, type: 'income', date: new Date('2026-11-05T12:00:00Z'),
    itemId: CUSTOMER_ID, categoryId: 2, accountId: 3, amount: '100000', note: null,
    sourceMovementId: null, paymentMethod: 'transfer', accountApplication: 'on_account', invoiceId: null,
    item:     { id: CUSTOMER_ID, name: 'Cliente Test', tracksAccount: true },
    category: { id: 2, name: 'Fee mensual', type: 'income' },
    account:  { id: 3, name: 'Galicia', currency: 'ARS' },
    invoice: null, check: null, taxes: [], extraPayment: null,
    ...overrides,
  }
}

function invoice(overrides = {}) {
  return {
    id: INVOICE_ID, workspaceId: WORKSPACE_ID, itemId: CUSTOMER_ID, number: 'FC A 0001-00000161',
    amount: '150000', currency: 'ARS', kind: 'invoice', arcaStatus: null, cae: null,
    issueDate: new Date('2026-11-01T12:00:00Z'), dueDate: new Date('2026-11-11T12:00:00Z'),
    ...overrides,
  }
}

// `resolveMovementFields` relee item/categoría/cuenta del body ya mergeado.
function mockRefs() {
  prisma.financeItem.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: 'Cliente Test', tracksAccount: true })
  prisma.financeCategory.findFirst.mockResolvedValue({ id: 2, name: 'Fee mensual', type: 'income' })
  prisma.financeAccount.findFirst.mockResolvedValue({ id: 3, name: 'Galicia', currency: 'ARS' })
  prisma.financeMovementTax.findMany.mockResolvedValue([])
  prisma.financeExtraTeamPayout.findUnique.mockResolvedValue(null)
  prisma.financeMovement.update.mockResolvedValue({})
  prisma.financeMovement.findUnique.mockResolvedValue(onAccountIncome({ accountApplication: 'invoice', invoiceId: INVOICE_ID }))
}

function patch(body) {
  return request(app)
    .patch(`/api/finanzas/movements/${MOVEMENT_ID}`)
    .set('Authorization', authHeader())
    .set('X-Workspace', WORKSPACE_SLUG)
    .send(body)
}

describe('PATCH /api/finanzas/movements/:id — aplicar un ingreso a una factura', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAccess()
    mockRefs()
  })

  it('pasa un cobro cargado "a cuenta" a una factura', async () => {
    prisma.financeMovement.findFirst.mockResolvedValue(onAccountIncome())
    prisma.financeInvoice.findFirst.mockResolvedValue(invoice())
    prisma.financeMovement.aggregate.mockResolvedValue({ _sum: { amount: null } })

    const res = await patch({ accountApplication: 'invoice', invoiceId: INVOICE_ID })

    expect(res.status).toBe(200)
    expect(prisma.financeMovement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: MOVEMENT_ID },
      data: expect.objectContaining({ accountApplication: 'invoice', invoiceId: INVOICE_ID }),
    }))
  })

  it('deja reelegir la MISMA factura sin contar dos veces su propio cobro', async () => {
    // El movimiento ya aplica $100k a una factura de $150k: el pendiente que ve
    // la validación tiene que ser el total (excludeMovementId), no $50k.
    prisma.financeMovement.findFirst.mockResolvedValue(
      onAccountIncome({ accountApplication: 'invoice', invoiceId: INVOICE_ID, invoice: { id: INVOICE_ID, number: 'FC A 0001-00000161' } }),
    )
    prisma.financeInvoice.findFirst.mockResolvedValue(invoice())
    prisma.financeMovement.aggregate.mockResolvedValue({ _sum: { amount: null } })

    const res = await patch({ accountApplication: 'invoice', invoiceId: INVOICE_ID, amount: 150000 })

    expect(res.status).toBe(200)
    expect(prisma.financeMovement.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: { not: MOVEMENT_ID } }),
    }))
  })

  it('rechaza un cobro que supera el pendiente de la factura', async () => {
    prisma.financeMovement.findFirst.mockResolvedValue(onAccountIncome())
    prisma.financeInvoice.findFirst.mockResolvedValue(invoice())
    prisma.financeMovement.aggregate.mockResolvedValue({ _sum: { amount: '120000' } })

    const res = await patch({ accountApplication: 'invoice', invoiceId: INVOICE_ID })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/supera el saldo pendiente/i)
    expect(prisma.financeMovement.update).not.toHaveBeenCalled()
  })

  it('no deja aplicar un cobro a una nota de crédito ni a una factura rechazada por ARCA', async () => {
    prisma.financeMovement.findFirst.mockResolvedValue(onAccountIncome())
    prisma.financeMovement.aggregate.mockResolvedValue({ _sum: { amount: null } })

    prisma.financeInvoice.findFirst.mockResolvedValue(invoice({ kind: 'credit_note' }))
    const note = await patch({ accountApplication: 'invoice', invoiceId: INVOICE_ID })
    expect(note.status).toBe(400)
    expect(note.body.error).toMatch(/nota de cr[ée]dito/i)

    prisma.financeInvoice.findFirst.mockResolvedValue(invoice({ arcaStatus: 'rejected' }))
    const rejected = await patch({ accountApplication: 'invoice', invoiceId: INVOICE_ID })
    expect(rejected.status).toBe(400)
    expect(rejected.body.error).toMatch(/rechaz/i)

    expect(prisma.financeMovement.update).not.toHaveBeenCalled()
  })

  it('desvincula la cuota del extra cuando el cobro deja de ser "a cuenta"', async () => {
    prisma.financeMovement.findFirst.mockResolvedValue(onAccountIncome({ extraPayment: { id: 77, extraId: 9 } }))
    prisma.financeInvoice.findFirst.mockResolvedValue(invoice())
    prisma.financeMovement.aggregate.mockResolvedValue({ _sum: { amount: null } })

    const res = await patch({ accountApplication: 'invoice', invoiceId: INVOICE_ID })

    expect(res.status).toBe(200)
    expect(prisma.financeExtraPayment.update).toHaveBeenCalledWith({ where: { id: 77 }, data: { movementId: null } })
    expect(prisma.financeExtra.updateMany).toHaveBeenCalledWith({
      where: { id: 9, status: 'collected' }, data: { status: 'finished' },
    })
  })

  it('conserva la cuota del extra si el cobro sigue "a cuenta"', async () => {
    prisma.financeMovement.findFirst.mockResolvedValue(onAccountIncome({ extraPayment: { id: 77, extraId: 9 } }))

    const res = await patch({ amount: 120000 })

    expect(res.status).toBe(200)
    expect(prisma.financeExtraPayment.update).not.toHaveBeenCalled()
  })

  it('registra el cambio en el historial como "Aplicado a"', async () => {
    prisma.financeMovement.findFirst.mockResolvedValue(onAccountIncome())
    prisma.financeInvoice.findFirst.mockResolvedValue(invoice())
    prisma.financeMovement.aggregate.mockResolvedValue({ _sum: { amount: null } })

    await patch({ accountApplication: 'invoice', invoiceId: INVOICE_ID })

    const logged = prisma.financeAuditLog.create.mock.calls[0][0].data
    expect(logged.summary).toMatch(/Aplicado a/i)
    expect(logged.summary).toMatch(/FC A 0001-00000161/)
  })
})
