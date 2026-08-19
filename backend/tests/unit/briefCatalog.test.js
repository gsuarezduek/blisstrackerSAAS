const {
  BRIEF_TYPES,
  isValidBriefType,
  briefLabel,
  briefCompletionPct,
  isBriefComplete,
} = require('../../src/lib/briefCatalog')

describe('briefCatalog', () => {
  test('isValidBriefType acepta solo los tipos del catálogo', () => {
    expect(isValidBriefType('marca')).toBe(true)
    expect(isValidBriefType('inventado')).toBe(false)
  })

  test('briefLabel devuelve un título por cada tipo del catálogo', () => {
    for (const type of BRIEF_TYPES) {
      expect(typeof briefLabel(type)).toBe('string')
      expect(briefLabel(type).length).toBeGreaterThan(0)
    }
  })

  test('briefLabel cae al propio key si el tipo no está en el catálogo', () => {
    expect(briefLabel('inventado')).toBe('inventado')
  })

  describe('briefCompletionPct / isBriefComplete', () => {
    test('memoria (1 solo campo) — 1 respondida = 100%', () => {
      expect(briefCompletionPct('memoria', { notas: 'algo' })).toBe(1)
      expect(isBriefComplete('memoria', { notas: 'algo' })).toBe(true)
    })

    test('sin respuestas → 0% y no está completo', () => {
      expect(briefCompletionPct('marca', {})).toBe(0)
      expect(isBriefComplete('marca', {})).toBe(false)
      expect(isBriefComplete('marca', null)).toBe(false)
    })

    test('umbral de completitud es 80%, no 100%', () => {
      // marca tiene 31 campos: 25/31 ≈ 80.6% → completo; 24/31 ≈ 77.4% → no
      const answers25 = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`k${i}`, 'x']))
      const answers24 = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [`k${i}`, 'x']))
      expect(isBriefComplete('marca', answers25)).toBe(true)
      expect(isBriefComplete('marca', answers24)).toBe(false)
    })

    test('nunca supera 100% aunque el objeto tenga más keys que campos del brief', () => {
      const tooMany = Object.fromEntries(Array.from({ length: 999 }, (_, i) => [`k${i}`, 'x']))
      expect(briefCompletionPct('memoria', tooMany)).toBe(1)
    })

    test('tipo inválido → 0% (sin total conocido)', () => {
      expect(briefCompletionPct('inventado', { a: '1' })).toBe(0)
      expect(isBriefComplete('inventado', { a: '1' })).toBe(false)
    })
  })
})
