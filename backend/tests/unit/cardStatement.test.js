const {
  normalizeMerchantKey, findRuleForKey, parseAmount, sanitizeLines, checkTotals, groupLines, movementNote,
} = require('../../src/lib/cardStatement')

// Renglones reales de un resumen Visa Signature de Banco Patagonia (cierre 22/10/26).
const line = (date, description, amount, currency, kind, voucher = null) => ({ date, description, amount, currency, kind, voucher, installment: null })
const USD_LINES = [
  line('2026-10-02', 'SU PAGO EN USD', '209.87', 'USD', 'payment'),
  line('2026-09-24', 'ANTHROPIC', '10.07', 'USD', 'purchase', '592104K'),
  line('2026-09-27', 'GROWBOT in1UKH932USD', '8.99', 'USD', 'purchase', '947226K'),
  line('2026-10-02', 'ZEROSSL* ZEROSSL', '13.99', 'USD', 'purchase', '069879F'),
  line('2026-10-05', 'OPENAI', '5.00', 'USD', 'purchase', '422240'),
  line('2026-10-09', 'Mailchimp 248016104USD', '22.50', 'USD', 'purchase', '267107K'),
  line('2026-10-11', 'CURSOR, AI POWERED IDE', '50.00', 'USD', 'purchase', '230580K'),
  line('2026-10-14', 'CURSOR, AI POWER in1UQSeoBUSD', '40.00', 'USD', 'purchase', '980660K'),
  line('2026-10-14', 'CURSOR, AI POWER in1UQShIBUSD', '40.00', 'USD', 'purchase', '025114K'),
  line('2026-10-15', 'CURSOR, AI POWER in1UQp8fBUSD', '39.90', 'USD', 'purchase', '277899K'),
  line('2026-10-17', 'VERCEL INC.', '20.00', 'USD', 'purchase', '598860K'),
  line('2026-10-19', 'CURSOR, AI POWER in1USKP1BUSD', '66.76', 'USD', 'purchase', '701870K'),
  line('2026-10-19', 'HIGHLEVEL LLC', '100.00', 'USD', 'purchase', '679761'),
  line('2026-10-19', 'CURSOR, AI POWER in1USIdlBUSD', '66.96', 'USD', 'purchase', '626287K'),
  line('2026-10-20', 'CURSOR, AI POWER in1USdWoBUSD', '32.30', 'USD', 'purchase', '488707K'),
  line('2026-10-20', 'RAILWAY in1USkUoCUSD', '27.77', 'USD', 'purchase', '192112K'),
]
const ARS_LINES = [
  line('2026-09-30', 'CR IVA $ 21 %', '7176.45', 'ARS', 'credit'),
  line('2026-09-30', 'BONIFIC. COMIS. PROD. PAT', '34173.55', 'ARS', 'credit'),
  line('2026-10-02', 'SU PAGO EN PESOS', '1209985.00', 'ARS', 'payment'),
  line('2026-10-05', 'DEV.IMP. RG 5617 30%( 318162,92)', '95448.87', 'ARS', 'credit'),
  line('2026-09-25', 'FACEBK *N7RA77W5V4', '29172.00', 'ARS', 'purchase', '488422V'),
  line('2026-09-27', 'FACEBK *W9SFD7W5V4', '29172.00', 'ARS', 'purchase', '245606V'),
  line('2026-09-26', 'Netflix com', '13588.49', 'ARS', 'purchase', '783554K'),
  // El resto de los consumos en pesos del período, en un renglón (total impreso: 1.107.695,64).
  line('2026-10-21', 'RESTO DE CONSUMOS', '1035763.15', 'ARS', 'purchase'),
  line('2026-09-30', 'COMIS. PROD. PAT. SINGULAR', '34173.55', 'ARS', 'charge'),
  line('2026-10-22', 'IMP DE SELLOS P/INT.FIN. $', '154.77', 'ARS', 'charge'),
  line('2026-10-22', 'INTERESES FINANCIACION $', '7652.84', 'ARS', 'charge'),
  line('2026-10-22', 'DB IVA $ 21%', '8783.54', 'ARS', 'charge'),
  line('2026-10-22', 'IVA RG 4240 21%( 719254,28)', '151043.39', 'ARS', 'charge'),
  line('2026-10-22', 'IVA RG 4240 21%( 152727,47)', '32072.76', 'ARS', 'charge'),
  line('2026-10-22', 'DB.RG 5617 30% ( 1668156,99 )', '500447.09', 'ARS', 'charge'),
]
const BALANCES = [
  { currency: 'ARS', previousBalance: '1481304.11', currentBalance: '1976543.82' },
  { currency: 'USD', previousBalance: '209.87', currentBalance: '544.24' },
]

describe('normalizeMerchantKey', () => {
  it.each([
    ['FACEBK *N7RA77W5V4', 'FACEBK'],
    ['FACEBK *ELVD296P24', 'FACEBK'],
    ['CURSOR, AI POWER in1UQSeoBUSD', 'CURSOR AI POWER'],
    ['CURSOR, AI POWERED IDE', 'CURSOR AI POWERED IDE'],
    ['LA SEGUNDA COO0452380-01/06-000-014', 'LA SEGUNDA'],
    ['Mailchimp 248016104USD', 'MAILCHIMP'],
    ['IVA RG 4240 21%( 719254,28)', 'IVA RG'],
    ['DB.RG 5617 30% ( 1668156,99 )', 'DB.RG'],
    ['DB IVA $ 21%', 'DB IVA'],
    ['Netflix com', 'NETFLIX COM'],
    ['DLO*PedidosYa Propina', 'DLO PEDIDOSYA PROPINA'],
    ['Café Martínez', 'CAFE MARTINEZ'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeMerchantKey(input)).toBe(expected)
  })

  it('si todo son códigos, no devuelve una clave vacía', () => {
    expect(normalizeMerchantKey('123456 7890')).toBe('123456 7890')
  })
})

describe('findRuleForKey', () => {
  const rules = [
    { merchantKey: 'CURSOR AI POWER', itemId: 1 },
    { merchantKey: 'FACEBK', itemId: 2 },
    { merchantKey: 'LA', itemId: 3 },
  ]
  it('prefiere la coincidencia exacta', () => {
    expect(findRuleForKey(rules, 'FACEBK').itemId).toBe(2)
  })
  it('matchea por prefijo el mismo comercio cortado distinto', () => {
    expect(findRuleForKey(rules, 'CURSOR AI POWERED IDE').itemId).toBe(1)
  })
  it('no matchea por prefijo con claves muy cortas', () => {
    expect(findRuleForKey(rules, 'LA SEGUNDA')).toBeNull()
  })
  it('gana la regla más larga', () => {
    const r = [...rules, { merchantKey: 'CURSOR AI POWERED', itemId: 9 }]
    expect(findRuleForKey(r, 'CURSOR AI POWERED IDE').itemId).toBe(9)
  })
})

describe('parseAmount', () => {
  it.each([
    ['29172.00', '29172'], ['1.209.985,00', '1209985'], ['8,99', '8.99'], ['1,234.56', '1234.56'], [-95448.87, '95448.87'],
  ])('%s', (input, expected) => {
    expect(parseAmount(input).toString()).toBe(expected)
  })
  it('basura → null', () => {
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount(null)).toBeNull()
  })
})

describe('sanitizeLines', () => {
  it('descarta renglones sin fecha, monto, moneda o tipo válidos', () => {
    const { lines, dropped } = sanitizeLines([
      line('2026-10-01', 'OK', '10', 'ARS', 'purchase'),
      line('2026-13-01', 'fecha mala', '10', 'ARS', 'purchase'),
      line('2026-10-01', 'sin monto', '0', 'ARS', 'purchase'),
      line('2026-10-01', 'moneda rara', '10', 'EUR', 'purchase'),
      line('2026-10-01', 'tipo raro', '10', 'ARS', 'other'),
    ])
    expect(lines).toHaveLength(1)
    expect(dropped).toBe(4)
  })

  it('la huella es estable entre lecturas y distingue renglones idénticos', () => {
    const twin = line('2026-10-03', 'Starlink Argentina', '54390', 'ARS', 'purchase')
    const a = sanitizeLines([twin, twin]).lines
    const b = sanitizeLines([twin, twin]).lines
    expect(a[0].fingerprint).not.toBe(a[1].fingerprint)
    expect(a.map(l => l.fingerprint)).toEqual(b.map(l => l.fingerprint))
  })
})

describe('checkTotals', () => {
  it('cierra con los saldos reales del resumen en pesos y en dólares', () => {
    const { lines } = sanitizeLines([...ARS_LINES, ...USD_LINES])
    const checks = checkTotals(lines, BALANCES)
    expect(checks).toEqual([
      expect.objectContaining({ currency: 'ARS', ok: true, diff: '0.00' }),
      expect.objectContaining({ currency: 'USD', ok: true, diff: '0.00' }),
    ])
  })

  it('avisa cuando falta un renglón', () => {
    const { lines } = sanitizeLines(USD_LINES.filter(l => l.description !== 'OPENAI'))
    const [usd] = checkTotals(lines, BALANCES).filter(c => c.currency === 'USD')
    expect(usd.ok).toBe(false)
    expect(usd.diff).toBe('5.00')
  })

  it('sin saldos impresos no puede controlar', () => {
    const { lines } = sanitizeLines(USD_LINES)
    const [usd] = checkTotals(lines, [])
    expect(usd.ok).toBeNull()
  })
})

describe('groupLines', () => {
  it('agrupa por comercio + moneda + tipo y deja afuera los pagos', () => {
    const { lines } = sanitizeLines([...ARS_LINES, ...USD_LINES])
    const groups = groupLines(lines)
    const facebk = groups.find(g => g.merchantKey === 'FACEBK')
    expect(facebk).toMatchObject({ currency: 'ARS', type: 'expense', total: '58344.00' })
    expect(facebk.lines).toHaveLength(2)
    const cursor = groups.find(g => g.merchantKey === 'CURSOR AI POWER')
    expect(cursor.lines).toHaveLength(6)
    // "CURSOR, AI POWERED IDE" queda en su propio grupo; la memoria lo une por prefijo.
    expect(groups.find(g => g.merchantKey === 'CURSOR AI POWERED IDE').lines).toHaveLength(1)
    expect(groups.find(g => g.merchantKey === 'IVA RG').total).toBe('183116.15')
    expect(groups.find(g => g.merchantKey === 'BONIFIC COMIS PROD PAT').type).toBe('income')
    expect(groups.some(g => g.lines.some(l => l.kind === 'payment'))).toBe(false)
  })

  it('ordena por total descendente', () => {
    const { lines } = sanitizeLines(ARS_LINES)
    const totals = groupLines(lines).map(g => Number(g.total))
    expect([...totals].sort((a, b) => b - a)).toEqual(totals)
  })
})

describe('movementNote', () => {
  it('un renglón: el detalle', () => {
    const { lines } = sanitizeLines([line('2026-09-26', 'Netflix com', '13588.49', 'ARS', 'purchase')])
    expect(movementNote('Visa', lines)).toBe('Visa · Netflix com')
  })
  it('varios: cuántos y entre qué fechas', () => {
    const { lines } = sanitizeLines(ARS_LINES.filter(l => l.description.startsWith('FACEBK')))
    expect(movementNote('Visa', lines)).toBe('Visa · 2 renglones de FACEBK del 25/09 al 27/09')
  })
})
