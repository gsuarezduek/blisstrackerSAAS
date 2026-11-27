jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  financeIssuer:   { findMany: jest.fn(), findFirst: jest.fn() },
  financeAccount:  { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  financeInvoice:  { findMany: jest.fn(), aggregate: jest.fn() },
  financeMovement: { findMany: jest.fn(), aggregate: jest.fn() },
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

const api = (method, path) => request(app)[method](`/api/finanzas${path}`)
  .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)

const BLISS = { id: 3, name: 'Bliss SRL', cuit: '30712345678', active: true }
const FULANO = { id: 4, name: 'Fulano Monotributo', cuit: '20123456789', active: true }
const VIEJO = { id: 5, name: 'Emisor viejo', cuit: '20999999999', active: false }

const ACCOUNTS = [
  { id: 1, name: 'Galicia', issuerId: 3, active: true },
  { id: 2, name: 'Mercado Pago', issuerId: 4, active: true },
  { id: 3, name: 'Caja', issuerId: null, active: true },
]

// Los dos findMany de movimientos: el de totales y el de cobros cruzados (income + invoice).
function mockMovements({ totals = [], collections = [] }) {
  prisma.financeMovement.findMany.mockImplementation(async ({ where }) => (where.invoice ? collections : totals))
}

function collection(id, accountIssuer, invoiceIssuer, over = {}) {
  return {
    id, date: new Date('2026-11-10T12:00:00Z'), amount: '250', item: { name: 'Pastiza' }, check: null,
    account: { id: 9, name: 'Cuenta', currency: 'ARS', issuerId: accountIssuer, issuer: { name: `E${accountIssuer}` } },
    invoice: { id: 50 + id, number: `FC ${id}`, kind: 'invoice', issuerId: invoiceIssuer, issuer: { name: `E${invoiceIssuer}` } },
    ...over,
  }
}

describe('GET /api/finanzas/summary/entities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAccess()
    prisma.financeIssuer.findMany.mockResolvedValue([BLISS, FULANO, VIEJO])
    prisma.financeAccount.findMany.mockResolvedValue(ACCOUNTS)
    prisma.financeInvoice.findMany.mockResolvedValue([])
    mockMovements({})
  })

  it('400 con mes mal formado', async () => {
    const res = await api('get', '/summary/entities').query({ month: '2026-1' })
    expect(res.status).toBe(400)
  })

  it('filtra el mes por fecha (movimientos) y emisión (facturas), en la moneda pedida', async () => {
    await api('get', '/summary/entities').query({ month: '2026-11', currency: 'USD' })
    const range = { gte: new Date('2026-11-01T00:00:00Z'), lt: new Date('2026-12-01T00:00:00Z') }
    expect(prisma.financeInvoice.findMany.mock.calls[0][0].where).toMatchObject({ workspaceId: 1, deletedAt: null, currency: 'USD', issueDate: range })
    const totalsWhere = prisma.financeMovement.findMany.mock.calls.find(c => !c[0].where.invoice)[0].where
    expect(totalsWhere).toMatchObject({ workspaceId: 1, deletedAt: null, date: range, account: { currency: 'USD' } })
  })

  it('suma por entidad: facturado neto, ingresos sin cheques pendientes, egresos', async () => {
    prisma.financeInvoice.findMany.mockResolvedValue([
      { issuerId: 3, amount: '1000', kind: 'invoice', arcaStatus: 'authorized' },
      { issuerId: 3, amount: '100', kind: 'credit_note', arcaStatus: 'authorized' },
      { issuerId: 3, amount: '9999', kind: 'invoice', arcaStatus: 'rejected' },
      { issuerId: null, amount: '40', kind: 'invoice', arcaStatus: null },
    ])
    mockMovements({ totals: [
      { type: 'income', amount: '800', accountId: 1, check: null },
      { type: 'income', amount: '300', accountId: 1, check: { status: 'pending' } },
      { type: 'income', amount: '50', accountId: 1, check: { status: 'credited' } },
      { type: 'expense', amount: '200', accountId: 1, check: null },
      { type: 'expense', amount: '15', accountId: 3, check: null },
    ] })

    const res = await api('get', '/summary/entities').query({ month: '2026-11' })
    expect(res.status).toBe(200)
    const byName = Object.fromEntries(res.body.entities.map(e => [e.name, e]))

    expect(Number(byName['Bliss SRL'].invoiced)).toBe(900)
    expect(byName['Bliss SRL'].invoiceCount).toBe(3)
    expect(Number(byName['Bliss SRL'].income)).toBe(850)
    expect(Number(byName['Bliss SRL'].expense)).toBe(200)
    expect(Number(byName['Bliss SRL'].net)).toBe(650)
    expect(byName['Bliss SRL'].pendingChecks).toEqual({ amount: '300', count: 1 })
    expect(byName['Bliss SRL'].accounts).toEqual([{ id: 1, name: 'Galicia' }])

    // Activa sin datos: aparece igual, en cero.
    expect(Number(byName['Fulano Monotributo'].income)).toBe(0)
    // Desactivada sin datos: no aparece.
    expect(byName['Emisor viejo']).toBeUndefined()

    // Sin entidad: la informativa y la cuenta sin entidad, al final.
    expect(res.body.entities.at(-1).name).toBe('Sin entidad')
    expect(byName['Sin entidad'].issuerId).toBeNull()
    expect(Number(byName['Sin entidad'].invoiced)).toBe(40)
    expect(Number(byName['Sin entidad'].expense)).toBe(15)
  })

  it('una entidad desactivada con facturas en el mes aparece', async () => {
    prisma.financeInvoice.findMany.mockResolvedValue([{ issuerId: 5, amount: '10', kind: 'invoice', arcaStatus: 'authorized' }])
    const res = await api('get', '/summary/entities').query({ month: '2026-11' })
    const viejo = res.body.entities.find(e => e.issuerId === 5)
    expect(viejo).toMatchObject({ name: 'Emisor viejo', active: false, invoiceCount: 1 })
  })

  it('avisa los cobros que entraron en la cuenta de otra entidad (y no los de la misma)', async () => {
    mockMovements({ collections: [collection(1, 4, 3), collection(2, 3, 3)] })
    const res = await api('get', '/summary/entities').query({ month: '2026-11' })

    const where = prisma.financeMovement.findMany.mock.calls.find(c => c[0].where.invoice)[0].where
    expect(where).toMatchObject({ type: 'income', invoice: { issuerId: { not: null } }, account: { issuerId: { not: null } } })

    expect(res.body.crossCollections).toHaveLength(1)
    expect(res.body.crossCollections[0]).toMatchObject({
      movementId: 1, amount: '250', currency: 'ARS', itemName: 'Pastiza',
      account: { issuerId: 4, issuerName: 'E4' }, invoice: { issuerId: 3, issuerName: 'E3' },
    })
    const byId = Object.fromEntries(res.body.entities.map(e => [e.issuerId, e]))
    expect(byId[3].crossCount).toBe(1)
    expect(byId[4].crossCount).toBe(1)
  })
})

describe('GET /api/finanzas/first-month', () => {
  beforeEach(() => { jest.clearAllMocks(); mockAccess() })

  it('el mes del primer movimiento vivo', async () => {
    prisma.financeMovement.aggregate.mockResolvedValue({ _min: { date: new Date('2026-10-03T12:00:00Z') } })
    const res = await api('get', '/first-month').query({ source: 'movements' })
    expect(res.body).toEqual({ month: '2026-10' })
    expect(prisma.financeMovement.aggregate.mock.calls[0][0].where).toEqual({ workspaceId: 1, deletedAt: null })
  })

  it('el de la primera factura por emisión, o null si no hay', async () => {
    prisma.financeInvoice.aggregate.mockResolvedValue({ _min: { issueDate: null } })
    const res = await api('get', '/first-month').query({ source: 'invoices' })
    expect(res.body).toEqual({ month: null })
  })

  it('400 con otro source', async () => {
    const res = await api('get', '/first-month').query({ source: 'extras' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/finanzas/accounts/:id — entidad de facturación', () => {
  const existing = {
    id: 1, workspaceId: 1, name: 'Galicia', issuerId: null, issuer: null,
    _count: { movements: 3, transfersFrom: 0, transfersTo: 0, fundValuations: 0 },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockAccess()
    prisma.financeAccount.findFirst.mockResolvedValue(existing)
    prisma.financeAccount.update.mockImplementation(async ({ data }) => ({ ...existing, ...data, issuer: data.issuerId ? { id: 3, name: 'Bliss SRL' } : null }))
  })

  it('asocia la cuenta a un emisor del workspace', async () => {
    prisma.financeIssuer.findFirst.mockResolvedValue({ id: 3 })
    const res = await api('patch', '/accounts/1').send({ issuerId: 3 })
    expect(res.status).toBe(200)
    expect(prisma.financeIssuer.findFirst).toHaveBeenCalledWith({ where: { id: 3, workspaceId: 1 }, select: { id: true } })
    expect(prisma.financeAccount.update.mock.calls[0][0].data).toEqual({ issuerId: 3 })
  })

  it('400 si el emisor no es del workspace', async () => {
    prisma.financeIssuer.findFirst.mockResolvedValue(null)
    const res = await api('patch', '/accounts/1').send({ issuerId: 99 })
    expect(res.status).toBe(400)
    expect(prisma.financeAccount.update).not.toHaveBeenCalled()
  })

  it('null la deja sin entidad', async () => {
    const res = await api('patch', '/accounts/1').send({ issuerId: null })
    expect(res.status).toBe(200)
    expect(prisma.financeIssuer.findFirst).not.toHaveBeenCalled()
    expect(prisma.financeAccount.update.mock.calls[0][0].data).toEqual({ issuerId: null })
  })

  it('sin issuerId en el body no la toca', async () => {
    await api('patch', '/accounts/1').send({ name: 'Galicia CC' })
    expect(prisma.financeAccount.update.mock.calls[0][0].data).toEqual({ name: 'Galicia CC' })
  })
})
