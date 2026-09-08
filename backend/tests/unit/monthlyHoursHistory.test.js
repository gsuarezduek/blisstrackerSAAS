const { resolveMonthlyHoursByMonth } = require('../../src/lib/monthlyHoursHistory')

describe('resolveMonthlyHoursByMonth', () => {
  test('sin logs, todos los meses quedan sin dato', () => {
    const result = resolveMonthlyHoursByMonth([], ['2026-06', '2026-07'])
    expect(result).toEqual({ '2026-06': null, '2026-07': null })
  })

  test('un solo log viejo se aplica a todos los meses pedidos', () => {
    const logs = [{ effectiveFrom: '2025-01', monthlyHours: 10 }]
    const result = resolveMonthlyHoursByMonth(logs, ['2026-06', '2026-07', '2026-08'])
    expect(result).toEqual({ '2026-06': 10, '2026-07': 10, '2026-08': 10 })
  })

  test('cambio de valor a mitad de camino produce el escalón correcto', () => {
    const logs = [
      { effectiveFrom: '2026-01', monthlyHours: 10 },
      { effectiveFrom: '2026-07', monthlyHours: 20 },
    ]
    const result = resolveMonthlyHoursByMonth(logs, ['2026-06', '2026-07', '2026-08'])
    expect(result).toEqual({ '2026-06': 10, '2026-07': 20, '2026-08': 20 })
  })

  test('no importa el orden de entrada de los logs (se ordenan internamente)', () => {
    const logs = [
      { effectiveFrom: '2026-07', monthlyHours: 20 },
      { effectiveFrom: '2026-01', monthlyHours: 10 },
    ]
    const result = resolveMonthlyHoursByMonth(logs, ['2026-06', '2026-07'])
    expect(result).toEqual({ '2026-06': 10, '2026-07': 20 })
  })

  test('un log con monthlyHours null marca el mes sin presupuesto desde ahí', () => {
    const logs = [
      { effectiveFrom: '2026-01', monthlyHours: 10 },
      { effectiveFrom: '2026-05', monthlyHours: null },
    ]
    const result = resolveMonthlyHoursByMonth(logs, ['2026-04', '2026-05', '2026-06'])
    expect(result).toEqual({ '2026-04': 10, '2026-05': null, '2026-06': null })
  })

  test('mes pedido anterior al primer log queda sin dato', () => {
    const logs = [{ effectiveFrom: '2026-05', monthlyHours: 15 }]
    const result = resolveMonthlyHoursByMonth(logs, ['2026-01', '2026-05'])
    expect(result).toEqual({ '2026-01': null, '2026-05': 15 })
  })
})
