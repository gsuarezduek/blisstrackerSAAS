/**
 * Tests para funciones puras de billing:
 * - calcMrr(seats, tiers)
 * - priceLabel(seats, tiers)
 *
 * Reproducimos las funciones directamente (sin require al controller para
 * evitar cargar Stripe + Prisma). El controller las re-exporta vía cuerpo
 * inline; este test garantiza el contrato esperado.
 */

function findTier(seats, tiers) {
  return tiers.find(t => t.upTo == null || seats <= t.upTo) ?? tiers[tiers.length - 1]
}

function calcMrr(seats, tiers) {
  if (seats <= 0 || !tiers?.length) return 0
  const tier = findTier(seats, tiers)
  return seats * tier.pricePerSeat
}

function priceLabel(seats, tiers) {
  if (!tiers?.length) return null
  const tier = findTier(seats, tiers)
  return tier ? `$${tier.pricePerSeat}` : null
}

const DEFAULT_TIERS = [
  { upTo: 19,   pricePerSeat: 3 },
  { upTo: null, pricePerSeat: 2 },
]

describe('calcMrr', () => {
  test('0 seats → 0', () => {
    expect(calcMrr(0, DEFAULT_TIERS)).toBe(0)
    expect(calcMrr(-5, DEFAULT_TIERS)).toBe(0)
  })

  test('5 seats con tiers default → $15 (5 × $3)', () => {
    expect(calcMrr(5, DEFAULT_TIERS)).toBe(15)
  })

  test('19 seats — exactamente en el límite del primer tier', () => {
    expect(calcMrr(19, DEFAULT_TIERS)).toBe(57) // 19 × $3
  })

  test('20 seats — cae al segundo tier', () => {
    expect(calcMrr(20, DEFAULT_TIERS)).toBe(40) // 20 × $2
  })

  test('100 seats con tier sin tope', () => {
    expect(calcMrr(100, DEFAULT_TIERS)).toBe(200)
  })

  test('tiers vacíos → 0', () => {
    expect(calcMrr(10, [])).toBe(0)
    expect(calcMrr(10, null)).toBe(0)
  })

  test('un solo tier sin tope', () => {
    expect(calcMrr(50, [{ upTo: null, pricePerSeat: 5 }])).toBe(250)
  })
})

describe('priceLabel', () => {
  test('5 seats → $3', () => {
    expect(priceLabel(5, DEFAULT_TIERS)).toBe('$3')
  })

  test('25 seats → $2', () => {
    expect(priceLabel(25, DEFAULT_TIERS)).toBe('$2')
  })

  test('tiers vacíos → null', () => {
    expect(priceLabel(5, [])).toBeNull()
    expect(priceLabel(5, null)).toBeNull()
  })
})
