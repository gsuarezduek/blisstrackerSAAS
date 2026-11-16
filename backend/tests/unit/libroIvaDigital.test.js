/**
 * Libro IVA Digital — ventas. Las líneas esperadas están copiadas tal cual de un
 * export real (CITI_26.10_Ventas_*.txt): si el formateador corre un solo campo,
 * estos tests lo agarran antes que el importador de ARCA.
 */
const { buildVentasFiles, cbteLine, alicuotaLines, toWindows1252 } = require('../../src/lib/libroIvaDigital')

function voucher(overrides = {}) {
  return {
    voucherType: 3, salesPoint: 10, number: 254, date: '2026-10-01', voucherClass: 'A',
    header: { concept: 1, documentType: 80, documentNumber: '20201113629', receiverVatConditionId: 1, currencyId: 'PES', exchangeRate: '1' },
    totals: {
      total: 10326487, netTaxed: 8534287, untaxed: 0, exempt: 0, vat: 1792200, otherTaxes: 0,
      vatRates: [{ id: 5, rate: 21, base: 8534287, amount: 1792200 }], taxes: [],
    },
    ...overrides,
  }
}

describe('Libro IVA Digital — comprobante', () => {
  it('reproduce una nota de crédito A del export real', () => {
    expect(cbteLine(voucher(), 'SERGIO VALDEZ')).toBe(
      '202610010030001000000000000000000254000000000000000002548000000000020201113629SERGIO VALDEZ                 000000010326487000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000PES00010000001 00000000000000000000000',
    )
  })

  it('reproduce su línea de alícuota', () => {
    expect(alicuotaLines(voucher())).toEqual(['00300010000000000000000002540000000085342870005000000001792200'])
  })

  it('una factura B con dos alícuotas: la cantidad va en el comprobante y hay una línea por alícuota', () => {
    const v = voucher({
      voucherType: 6, number: 41824, date: '2026-10-02', voucherClass: 'B',
      header: { documentType: 96, documentNumber: '99999999', currencyId: 'PES', exchangeRate: '1' },
      totals: {
        total: 2624030, untaxed: 0, exempt: 0, vat: 417380, otherTaxes: 0,
        vatRates: [{ id: 5, base: 1768395, amount: 371363 }, { id: 4, base: 438255, amount: 46017 }],
      },
    })
    expect(cbteLine(v, 'CONSUMIDOR FINAL')).toBe(
      '202610020060001000000000000000041824000000000000000418249600000000000099999999CONSUMIDOR FINAL              000000002624030000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000PES00010000002 00000000000000000000000',
    )
    expect(alicuotaLines(v)).toEqual([
      '00600010000000000000000418240000000017683950005000000000371363',
      '00600010000000000000000418240000000004382550004000000000046017',
    ])
  })

  it('comprador sin identificar (documento 99)', () => {
    const v = voucher({ voucherType: 6, number: 41806, header: { documentType: 99, documentNumber: '0', currencyId: 'PES', exchangeRate: '1' }, totals: { total: 601538, vat: 104399, vatRates: [{ id: 5, base: 497139, amount: 104399 }] } })
    expect(cbteLine(v, 'CONSUMIDOR MERCADO LIBRE').slice(0, 108)).toBe(
      '202610010060001000000000000000041806000000000000000418069900000000000000000000CONSUMIDOR MERCADO LIBRE      ',
    )
  })

  it('informa la fecha de vencimiento de pago si el comprobante la tiene (servicios)', () => {
    const v = voucher({ header: { ...voucher().header, concept: 2, paymentDueDate: '2026-10-11' } })
    expect(cbteLine(v, 'X').slice(-8)).toBe('20261011')
  })

  it('el nombre se corta a 30 y no rompe el ancho con caracteres fuera de Windows-1252', () => {
    const line = cbteLine(voucher(), 'Distribuidora “Peña” — Ñandú Ünico 🚀 S.R.L. y asociados')
    expect(line).toHaveLength(266)
    expect(line.slice(78, 108)).toBe('Distribuidora "Peña" - Ñandú Ü')
    expect(toWindows1252(line)).toHaveLength(266)
  })

  it('un monto que no entra en el campo es un error, no un recorte', () => {
    expect(() => cbteLine(voucher({ totals: { ...voucher().totals, total: 10 ** 16 } }), 'X')).toThrow(/Importe total/)
  })

  it('código de operación E cuando no hay IVA y sí exento', () => {
    const v = voucher({ totals: { total: 1000, exempt: 1000, vat: 0, vatRates: [{ id: 3, base: 0, amount: 0 }] } })
    expect(cbteLine(v, 'X')[242]).toBe('E')
  })
})

describe('Libro IVA Digital — archivos', () => {
  it('ordena por fecha, tipo y número, y termina cada línea en CRLF', () => {
    const a = { voucher: voucher({ date: '2026-10-02', number: 2 }), receiverName: 'B' }
    const b = { voucher: voucher({ date: '2026-10-01', number: 9 }), receiverName: 'A' }
    const { cbte, alicuotas } = buildVentasFiles([a, b])
    const lines = cbte.split('\r\n')
    expect(lines).toHaveLength(3) // dos líneas + el vacío después del último CRLF
    expect(lines[0].startsWith('20261001')).toBe(true)
    expect(lines[1].startsWith('20261002')).toBe(true)
    expect(alicuotas.split('\r\n').filter(Boolean)).toHaveLength(2)
    expect(cbte).not.toMatch(/[^\r]\n/)
  })

  it('sin comprobantes, archivos vacíos', () => {
    expect(buildVentasFiles([])).toEqual({ cbte: '', alicuotas: '' })
  })
})
