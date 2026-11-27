jest.mock('../../src/lib/prisma', () => ({
  financeAccount: { findMany: jest.fn() },
  financeTransfer: { aggregate: jest.fn() },
  financeFundValuation: { findFirst: jest.fn() },
  financeMovement: { aggregate: jest.fn() },
  financeBalanceAdjustment: { aggregate: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { getBalances } = require('../../src/controllers/finanzas/balances.controller')
const { isValidBalanceGroup, isValidAccountType } = require('../../src/lib/financeCatalog')

function run(handler, { query = {} } = {}) {
  const req = { query, workspace: { id: 9 } }
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; resolve(this); return this } }
    handler(req, res, reject)
  })
}

const account = (over) => ({ initialBalance: '0', hasInvestments: false, type: 'bank', balanceGroup: 'available', ...over })

// Ingresos históricos por cuenta (lo único que mueve el disponible en estos tests).
const INCOME = { 1: '1000', 2: '300', 3: '5000', 4: '80' }

beforeEach(() => {
  jest.clearAllMocks()
  prisma.financeMovement.aggregate.mockImplementation(async ({ where }) => {
    const allTimeIncome = where.type === 'income' && where.NOT && !where.date
    return { _sum: { amount: allTimeIncome ? INCOME[where.accountId] : 0 }, _count: 0 }
  })
  prisma.financeTransfer.aggregate.mockResolvedValue({ _sum: { toAmount: 0, fromAmount: 0 } })
  prisma.financeBalanceAdjustment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
  prisma.financeFundValuation.findFirst.mockResolvedValue({ value: '2000', date: new Date('2026-11-01'), createdAt: new Date('2026-11-01') })
})

describe('getBalances: Inversión va aparte del disponible', () => {
  it('las cuentas de inversión no suman al disponible y van a `inversion` (efectivo + fondos)', async () => {
    prisma.financeAccount.findMany.mockResolvedValue([
      account({ id: 1, name: 'Galicia', currency: 'USD' }),
      account({ id: 2, name: 'Wise', currency: 'USD' }),
      account({ id: 3, name: 'Broker', currency: 'USD', type: 'investment', balanceGroup: 'investment', hasInvestments: true }),
      account({ id: 4, name: 'Caja', currency: 'ARS' }),
    ])
    const res = await run(getBalances)
    const usd = res.body.totalsByCurrency.USD
    expect(Number(usd.disponible)).toBe(1300)
    expect(Number(usd.total)).toBe(1300)
    expect(Number(usd.inversion)).toBe(7000) // 5000 de efectivo + 2000 de valuación
    expect(usd.investmentAccounts).toBe(1)

    const ars = res.body.totalsByCurrency.ARS
    expect(Number(ars.total)).toBe(80)
    expect(Number(ars.inversion)).toBe(0)
    expect(ars.investmentAccounts).toBe(0)

    expect(res.body.accounts.find(a => a.id === 3).balanceGroup).toBe('investment')
    expect(res.body.accounts.find(a => a.id === 1).balanceGroup).toBe('available')
  })

  it('una cuenta vieja sin grupo cuenta como disponible', async () => {
    prisma.financeAccount.findMany.mockResolvedValue([account({ id: 1, name: 'Galicia', currency: 'ARS', balanceGroup: undefined })])
    const res = await run(getBalances)
    expect(Number(res.body.totalsByCurrency.ARS.disponible)).toBe(1000)
    expect(res.body.accounts[0].balanceGroup).toBe('available')
  })
})

describe('catálogo', () => {
  it('"Cuenta de inversión" es un tipo y Disponible/Inversión los grupos', () => {
    expect(isValidAccountType('investment')).toBe(true)
    expect(isValidBalanceGroup('available')).toBe(true)
    expect(isValidBalanceGroup('investment')).toBe(true)
    expect(isValidBalanceGroup('fondos')).toBe(false)
  })
})
