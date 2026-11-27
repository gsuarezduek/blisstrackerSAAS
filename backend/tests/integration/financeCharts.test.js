jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  financeAccount:  { findMany: jest.fn() },
  financeInvoice:  { findMany: jest.fn() },
  financeMovement: { findMany: jest.fn() },
  financeTransfer: { findMany: jest.fn() },
  financeBalanceAdjustment: { findMany: jest.fn() },
  financeItem:     { findMany: jest.fn(), findFirst: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET

function mockAccess() {
  prisma.workspace.findUnique.mockResolvedValue({
    id: 1, slug: 'bliss', status: 'active', name: 'Bliss', disabledFeatureKeys: '[]',
    members: [{ workspaceId: 1, userId: 1, role: 'admin', active: true }],
  })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'finanzas', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

const get = (path, query = {}) => request(app).get(`/api/finanzas${path}`).query(query)
  .set('Authorization', `Bearer ${jwt.sign({ userId: 1, workspaceId: 1, role: 'admin', isSuperAdmin: false, name: 'T', email: 't@t.com' }, SECRET)}`)
  .set('X-Workspace', 'bliss')

const d = s => new Date(`${s}T12:00:00Z`)

beforeEach(() => { jest.clearAllMocks(); mockAccess() })

describe('GET /summary/invoicing — facturado vs. cobrado', () => {
  beforeEach(() => {
    prisma.financeInvoice.findMany.mockResolvedValue([])
    prisma.financeMovement.findMany.mockResolvedValue([])
  })

  it('400 con mes mal formado', async () => {
    expect((await get('/summary/invoicing', { month: 'nov' })).status).toBe(400)
  })

  it('devuelve todos los meses de la ventana, también los vacíos', async () => {
    const res = await get('/summary/invoicing', { month: '2026-11', months: 3 })
    expect(res.status).toBe(200)
    expect(res.body.series.map(s => s.month)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(res.body.series.every(s => Number(s.invoiced) === 0 && Number(s.collected) === 0)).toBe(true)
  })

  it('facturado neto por emisión y cobrado de clientes sin cheques pendientes', async () => {
    prisma.financeInvoice.findMany.mockResolvedValue([
      { issueDate: d('2026-10-05'), amount: '1000', kind: 'invoice', arcaStatus: 'authorized' },
      { issueDate: d('2026-10-20'), amount: '200', kind: 'credit_note', arcaStatus: 'authorized' },
      { issueDate: d('2026-11-02'), amount: '5000', kind: 'invoice', arcaStatus: 'rejected' },
      { issueDate: d('2026-11-03'), amount: '500', kind: 'invoice', arcaStatus: null },
    ])
    prisma.financeMovement.findMany.mockResolvedValue([
      { date: d('2026-10-10'), amount: '300' },
      { date: d('2026-11-15'), amount: '900' },
    ])
    const res = await get('/summary/invoicing', { month: '2026-11', months: 2, currency: 'USD' })
    expect(res.body.series).toEqual([
      { month: '2026-10', invoiced: '800', collected: '300', diff: '500' },
      { month: '2026-11', invoiced: '500', collected: '900', diff: '-400' },
    ])
    expect(res.body.totals).toEqual({ invoiced: '1300', collected: '1200', diff: '100' })

    const invWhere = prisma.financeInvoice.findMany.mock.calls[0][0].where
    expect(invWhere).toMatchObject({ workspaceId: 1, deletedAt: null, currency: 'USD', issueDate: { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-12-01T00:00:00Z') } })
    expect(invWhere).not.toHaveProperty('issuerId')
    const mvWhere = prisma.financeMovement.findMany.mock.calls[0][0].where
    expect(mvWhere).toMatchObject({
      type: 'income', accountApplication: { in: ['invoice', 'on_account'] },
      NOT: { check: { status: 'pending' } }, account: { currency: 'USD' },
    })
  })

  it('por entidad: facturas del emisor y cobros en sus cuentas; "none" = sin entidad', async () => {
    await get('/summary/invoicing', { month: '2026-11', issuerId: '3' })
    expect(prisma.financeInvoice.findMany.mock.calls[0][0].where.issuerId).toBe(3)
    expect(prisma.financeMovement.findMany.mock.calls[0][0].where.account).toEqual({ currency: 'ARS', issuerId: 3 })

    await get('/summary/invoicing', { month: '2026-11', issuerId: 'none' })
    expect(prisma.financeInvoice.findMany.mock.calls[1][0].where.issuerId).toBeNull()
    expect(prisma.financeMovement.findMany.mock.calls[1][0].where.account).toEqual({ currency: 'ARS', issuerId: null })
  })
})

describe('GET /balances/history — evolución del disponible', () => {
  beforeAll(() => { jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] }); jest.setSystemTime(Date.UTC(2026, 10, 27, 15)) })
  afterAll(() => jest.useRealTimers())

  beforeEach(() => {
    prisma.financeAccount.findMany.mockResolvedValue([
      { id: 1, currency: 'ARS', initialBalance: '1000' },
      { id: 2, currency: 'USD', initialBalance: '0' },
    ])
    prisma.financeMovement.findMany.mockResolvedValue([
      { accountId: 1, type: 'income', amount: '500', date: d('2026-01-10') },   // antes de la ventana
      { accountId: 1, type: 'expense', amount: '200', date: d('2026-10-05') },
      { accountId: 1, type: 'income', amount: '50', date: d('2026-12-15') },    // fechado más adelante
      { accountId: 2, type: 'income', amount: '30', date: d('2026-11-02') },
    ])
    prisma.financeTransfer.findMany
      .mockResolvedValueOnce([{ toAccountId: 1, toAmount: '100', date: d('2026-11-03') }])  // entradas
      .mockResolvedValueOnce([{ fromAccountId: 1, fromAmount: '40', date: d('2026-11-04') }]) // salidas
    prisma.financeBalanceAdjustment.findMany.mockResolvedValue([{ accountId: 1, amount: '-10', date: d('2026-10-20') }])
  })

  it('arma el cierre de cada mes por moneda; el último punto es el saldo de hoy con todo', async () => {
    const res = await get('/balances/history', { months: 3 })
    expect(res.status).toBe(200)
    expect(res.body.months).toEqual(['2026-09', '2026-10', '2026-11'])
    const ars = res.body.currencies.find(c => c.currency === 'ARS').points.map(p => Number(p.balance))
    // apertura 1000 + 500 = 1500 · oct −200 −10 · nov +100 −40 y +50 fechado en diciembre
    expect(ars).toEqual([1500, 1290, 1400])
    const usd = res.body.currencies.find(c => c.currency === 'USD').points.map(p => Number(p.balance))
    expect(usd).toEqual([0, 0, 30])
    expect(res.body.currencies[0].currency).toBe('ARS')
  })

  it('solo cuentas activas y operativas, sin cheques pendientes ni fondos', async () => {
    await get('/balances/history')
    expect(prisma.financeAccount.findMany.mock.calls[0][0].where).toEqual({ workspaceId: 1, active: true, NOT: { balanceGroup: 'investment' } })
    expect(prisma.financeMovement.findMany.mock.calls[0][0].where).toMatchObject({ NOT: { check: { status: 'pending' } } })
    expect(prisma.financeTransfer.findMany.mock.calls[0][0].where).toMatchObject({ toIsFund: false })
    expect(prisma.financeTransfer.findMany.mock.calls[1][0].where).toMatchObject({ fromIsFund: false })
  })
})

describe('GET /customers/aging', () => {
  it('responde la antigüedad (y no la confunde con /customers/:id)', async () => {
    prisma.financeItem.findMany.mockResolvedValue([
      { id: 1, name: 'Pastiza', invoices: [{ amount: '100', kind: 'invoice', arcaStatus: null, currency: 'ARS', dueDate: new Date('2020-01-01T12:00:00Z'), collections: [] }] },
    ])
    prisma.financeMovement.findMany.mockResolvedValue([])
    const res = await get('/customers/aging')
    expect(res.status).toBe(200)
    expect(prisma.financeItem.findFirst).not.toHaveBeenCalled()
    expect(prisma.financeItem.findMany.mock.calls[0][0].where).toEqual({ workspaceId: 1, tracksAccount: true, active: true })
    expect(res.body.currencies[0].buckets.find(b => b.key === 'd90_plus').amount).toBe('100')
    expect(res.body.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
