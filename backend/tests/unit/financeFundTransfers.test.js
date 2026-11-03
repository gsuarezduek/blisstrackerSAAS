jest.mock('../../src/lib/prisma', () => ({
  financeAccount: { findFirst: jest.fn(), findMany: jest.fn() },
  financeTransfer: { create: jest.fn(), findUnique: jest.fn(), aggregate: jest.fn() },
  financeFundValuation: { findFirst: jest.fn(), create: jest.fn() },
  financeMovement: { aggregate: jest.fn() },
  financeBalanceAdjustment: { aggregate: jest.fn() },
  $transaction: jest.fn(),
}))
jest.mock('../../src/lib/financeAudit', () => ({ logFinanceAudit: jest.fn() }))

const prisma = require('../../src/lib/prisma')
const { createTransfer } = require('../../src/controllers/finanzas/transfers.controller')
const { getBalances } = require('../../src/controllers/finanzas/balances.controller')
const { createValuation } = require('../../src/controllers/finanzas/fundValuations.controller')
const { transfersAfterValuation } = require('../../src/controllers/finanzas/_shared')

const fundAccount = { id: 1, name: 'Galicia', currency: 'ARS', hasInvestments: true, initialBalance: '0', type: 'bank' }
const plainAccount = { id: 2, name: 'Caja', currency: 'ARS', hasInvestments: false, initialBalance: '0', type: 'cash' }

function run(handler, { body = {}, query = {} } = {}) {
  const req = { body, query, workspace: { id: 9 }, user: { userId: 5 } }
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this } }
  return new Promise((resolve, reject) => {
    const originalJson = res.json.bind(res)
    res.json = (b) => { originalJson(b); resolve(res); return res }
    handler(req, res, reject)
  })
}

const transferBody = (over = {}) => ({
  date: '2026-11-02', reason: 'fund_redemption', fromAccountId: 1, fromAmount: 1000, toAccountId: 1, toAmount: 1000, ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  prisma.financeAccount.findFirst.mockImplementation(({ where }) => Promise.resolve(where.id === 2 ? plainAccount : fundAccount))
  prisma.financeTransfer.create.mockResolvedValue({ id: 77, date: new Date() })
  prisma.financeTransfer.findUnique.mockResolvedValue({ id: 77 })
  prisma.$transaction.mockImplementation(fn => fn(prisma))
})

describe('createTransfer: aporte y rescate', () => {
  it('un rescate saca de los fondos y entra al disponible de la misma cuenta', async () => {
    const res = await run(createTransfer, { body: transferBody() })
    expect(res.statusCode).toBe(201)
    expect(prisma.financeTransfer.create.mock.calls[0][0].data).toMatchObject({ fromAccountId: 1, toAccountId: 1, fromIsFund: true, toIsFund: false })
  })

  it('un aporte saca del disponible y entra a los fondos de la misma cuenta', async () => {
    const res = await run(createTransfer, { body: transferBody({ reason: 'fund_contribution' }) })
    expect(res.statusCode).toBe(201)
    expect(prisma.financeTransfer.create.mock.calls[0][0].data).toMatchObject({ fromIsFund: false, toIsFund: true })
  })

  it('ignora el lado que mande el cliente: sale del motivo', async () => {
    await run(createTransfer, { body: transferBody({ fromIsFund: true, toIsFund: true }) })
    expect(prisma.financeTransfer.create.mock.calls[0][0].data).toMatchObject({ fromIsFund: true, toIsFund: false })
  })

  it('rechaza un rescate hacia otra cuenta', async () => {
    const res = await run(createTransfer, { body: transferBody({ toAccountId: 2 }) })
    expect(res.statusCode).toBe(400)
    expect(prisma.financeTransfer.create).not.toHaveBeenCalled()
  })

  it('rechaza montos distintos de salida y entrada', async () => {
    const res = await run(createTransfer, { body: transferBody({ toAmount: 900 }) })
    expect(res.statusCode).toBe(400)
    expect(prisma.financeTransfer.create).not.toHaveBeenCalled()
  })

  it('rechaza una cuenta sin inversiones', async () => {
    const res = await run(createTransfer, { body: transferBody({ fromAccountId: 2, toAccountId: 2 }) })
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/no tiene inversiones/)
  })
})

describe('createTransfer: entre cuentas', () => {
  it('va siempre sobre el disponible', async () => {
    const res = await run(createTransfer, { body: transferBody({ reason: 'account_transfer', toAccountId: 2, fromIsFund: true }) })
    expect(res.statusCode).toBe(201)
    expect(prisma.financeTransfer.create.mock.calls[0][0].data).toMatchObject({ fromIsFund: false, toIsFund: false })
  })

  it('rechaza la misma cuenta y señala aporte/rescate', async () => {
    const res = await run(createTransfer, { body: transferBody({ reason: 'account_transfer' }) })
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toMatch(/Aporte o Rescate/)
  })
})

describe('transfersAfterValuation', () => {
  it('sin valuación no filtra', () => {
    expect(transfersAfterValuation(null)).toEqual({})
  })

  it('cuenta las de fecha posterior y las del mismo día cargadas después', () => {
    const date = new Date('2026-11-02T12:00:00Z')
    const createdAt = new Date('2026-11-02T15:00:00Z')
    expect(transfersAfterValuation({ date, createdAt })).toEqual({
      OR: [{ date: { gt: date } }, { date, createdAt: { gt: createdAt } }],
    })
  })
})

describe('getBalances: En fondos', () => {
  function mockAggregates({ aportes = 0, rescates = 0 }) {
    prisma.financeAccount.findMany.mockResolvedValue([fundAccount])
    prisma.financeMovement.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: 0 })
    prisma.financeBalanceAdjustment.aggregate.mockResolvedValue({ _sum: { amount: null } })
    prisma.financeTransfer.aggregate.mockImplementation(({ where }) => {
      if (where.toIsFund === true) return Promise.resolve({ _sum: { toAmount: String(aportes) } })
      if (where.fromIsFund === true) return Promise.resolve({ _sum: { fromAmount: String(rescates) } })
      return Promise.resolve({ _sum: { toAmount: null, fromAmount: null } })
    })
  }

  it('un rescate posterior a la valuación baja los fondos', async () => {
    const valuation = { value: '5000', date: new Date('2026-10-01T12:00:00Z'), createdAt: new Date('2026-10-01T15:00:00Z') }
    prisma.financeFundValuation.findFirst.mockResolvedValue(valuation)
    mockAggregates({ aportes: 200, rescates: 1000 })
    const res = await run(getBalances)
    expect(res.body.accounts[0].fondos).toBe('4200')
    const rescatesCall = prisma.financeTransfer.aggregate.mock.calls.find(([a]) => a.where.fromIsFund === true)
    expect(rescatesCall[0].where.OR).toEqual(transfersAfterValuation(valuation).OR)
  })

  it('sin valuación son aportes menos rescates de todo el histórico', async () => {
    prisma.financeFundValuation.findFirst.mockResolvedValue(null)
    mockAggregates({ aportes: 3000, rescates: 1000 })
    const res = await run(getBalances)
    expect(res.body.accounts[0].fondos).toBe('2000')
    const rescatesCall = prisma.financeTransfer.aggregate.mock.calls.find(([a]) => a.where.fromIsFund === true)
    expect(rescatesCall[0].where.OR).toBeUndefined()
  })
})

describe('createValuation: resultado del período', () => {
  it('un rescate cargado después de la valuación anterior no se lee como pérdida', async () => {
    const previous = { value: '1000', date: new Date('2026-11-02T12:00:00Z'), createdAt: new Date('2026-11-02T15:00:00Z') }
    prisma.financeFundValuation.findFirst.mockResolvedValue(previous)
    prisma.financeFundValuation.create.mockResolvedValue({ id: 1 })
    prisma.financeTransfer.aggregate.mockImplementation(({ where }) => Promise.resolve(
      where.fromIsFund === true ? { _sum: { fromAmount: '200' } } : { _sum: { toAmount: null } },
    ))
    const res = await run(createValuation, { body: { accountId: 1, date: '2026-11-09', value: 800 } })
    expect(res.statusCode).toBe(201)
    expect(prisma.financeFundValuation.create.mock.calls[0][0].data.periodResult).toBe('0')
  })
})
