jest.mock('../../src/lib/prisma', () => ({}))

const { computeAging } = require('../../src/controllers/finanzas/customers.controller')

const TODAY = new Date('2026-11-27T12:00:00Z')
const daysAgo = n => new Date(TODAY.getTime() - n * 24 * 60 * 60 * 1000)

function invoice(amount, dueDaysAgo, over = {}) {
  return { amount: String(amount), kind: 'invoice', arcaStatus: null, currency: 'ARS', dueDate: daysAgo(dueDaysAgo), collections: [], ...over }
}

const bucketOf = (result, currency, key) => result.find(c => c.currency === currency).buckets.find(b => b.key === key)
const amounts = (result, currency = 'ARS') => Object.fromEntries(result.find(c => c.currency === currency).buckets.map(b => [b.key, Number(b.amount)]))

describe('computeAging', () => {
  it('reparte por días de vencido, con los bordes de cada tramo', () => {
    const items = [{ id: 1, name: 'Pastiza', invoices: [
      invoice(100, -5),  // vence en 5 días → al día
      invoice(10, 0),    // vence hoy → al día
      invoice(20, 1), invoice(30, 30),
      invoice(40, 31), invoice(50, 60),
      invoice(60, 61), invoice(70, 90),
      invoice(80, 91),
    ] }]
    expect(amounts(computeAging(items, [], TODAY))).toEqual({ current: 110, d1_30: 50, d31_60: 90, d61_90: 130, d90_plus: 80 })
  })

  it('descuenta lo cobrado de cada factura', () => {
    const items = [{ id: 1, name: 'Pastiza', invoices: [invoice(100, 45, { collections: [{ amount: '60' }] })] }]
    expect(amounts(computeAging(items, [], TODAY)).d31_60).toBe(40)
  })

  it('los cobros a cuenta y las notas de crédito pagan lo más viejo primero', () => {
    const items = [{ id: 1, name: 'Pastiza', invoices: [
      invoice(100, 100),
      invoice(100, 10),
      invoice(30, 0, { kind: 'credit_note' }),
    ] }]
    const result = computeAging(items, [{ itemId: 1, amount: '50', currency: 'ARS' }], TODAY)
    // 80 de crédito se comen 80 de la de hace 100 días; la de hace 10 queda entera.
    expect(amounts(result)).toMatchObject({ d90_plus: 20, d1_30: 100 })
    expect(Number(result[0].total)).toBe(120)
  })

  it('lo cobrado de más en una factura es crédito para las otras', () => {
    const items = [{ id: 1, name: 'Pastiza', invoices: [
      invoice(100, 5, { collections: [{ amount: '150' }] }),
      invoice(100, 50),
    ] }]
    expect(amounts(computeAging(items, [], TODAY)).d31_60).toBe(50)
  })

  it('las rechazadas por ARCA no pesan y un cliente con saldo a favor no aparece', () => {
    const items = [
      { id: 1, name: 'Pastiza', invoices: [invoice(999, 40, { arcaStatus: 'rejected' })] },
      { id: 2, name: 'Hosting', invoices: [invoice(100, 40)] },
    ]
    const result = computeAging(items, [{ itemId: 2, amount: '500', currency: 'ARS' }], TODAY)
    expect(result).toEqual([])
  })

  it('cada tramo lista sus clientes, de mayor a menor', () => {
    const items = [
      { id: 1, name: 'Pastiza', invoices: [invoice(100, 40), invoice(20, 45)] },
      { id: 2, name: 'Hosting', invoices: [invoice(300, 50)] },
    ]
    const b = bucketOf(computeAging(items, [], TODAY), 'ARS', 'd31_60')
    expect(b.customers).toEqual([{ id: 2, name: 'Hosting', amount: '300' }, { id: 1, name: 'Pastiza', amount: '120' }])
  })

  it('no mezcla monedas y pone ARS primero', () => {
    const items = [{ id: 1, name: 'Pastiza', invoices: [invoice(100, 40, { currency: 'USD' }), invoice(50, 40)] }]
    const result = computeAging(items, [{ itemId: 1, amount: '100', currency: 'USD' }], TODAY)
    expect(result.map(c => c.currency)).toEqual(['ARS'])
    expect(Number(result[0].total)).toBe(50)
  })
})
