const { resolveMentions } = require('../../src/lib/mentions')

describe('resolveMentions', () => {
  const members = [
    { id: 1, name: 'Gastón Suarez' },
    { id: 2, name: 'Ana' },
    { id: 3, name: 'Analía Gómez' },
    { id: 4, name: null },
  ]

  test('matchea por nombre completo', () => {
    const result = resolveMentions('@Gastón Suarez ¿podés revisar esto?', members, 99)
    expect(result.has(1)).toBe(true)
  })

  test('matchea por primer nombre como fallback', () => {
    const result = resolveMentions('Che @Gastón dale una mirada', members, 99)
    expect(result.has(1)).toBe(true)
  })

  test('no confunde "@Ana" con "@Analía" (límite de palabra)', () => {
    const result = resolveMentions('@Ana ¿lo viste?', members, 99)
    expect(result.has(2)).toBe(true)
    expect(result.has(3)).toBe(false)
  })

  test('"@Analía" matchea a Analía y no a Ana', () => {
    const result = resolveMentions('@Analía revisá el brief', members, 99)
    expect(result.has(3)).toBe(true)
    expect(result.has(2)).toBe(false)
  })

  test('excluye al autor del texto', () => {
    const result = resolveMentions('@Gastón Suarez dale', members, 1)
    expect(result.has(1)).toBe(false)
  })

  test('ignora miembros sin nombre', () => {
    const result = resolveMentions('cualquier texto', members, 99)
    expect(result.size).toBe(0)
  })

  test('sin @ en el texto no matchea a nadie', () => {
    const result = resolveMentions('Gastón Suarez no lleva arroba', members, 99)
    expect(result.size).toBe(0)
  })

  test('es case-insensitive', () => {
    const result = resolveMentions('@GASTÓN SUAREZ mirá esto', members, 99)
    expect(result.has(1)).toBe(true)
  })

  describe('homónimos por primer nombre (ej. "Marti V" y "Marti G")', () => {
    const homonyms = [
      { id: 10, name: 'Marti V' },
      { id: 11, name: 'Marti G' },
    ]

    test('"@Marti V" no notifica de rebote a "Marti G"', () => {
      const result = resolveMentions('hola @Marti V como estás', homonyms, 99)
      expect(result.has(10)).toBe(true)
      expect(result.has(11)).toBe(false)
    })

    test('"@Marti G" no notifica de rebote a "Marti V"', () => {
      const result = resolveMentions('hola @Marti G como estás', homonyms, 99)
      expect(result.has(11)).toBe(true)
      expect(result.has(10)).toBe(false)
    })

    test('mencionar a ambos por nombre completo notifica a los dos', () => {
      const result = resolveMentions('avisale a @Marti V y a @Marti G', homonyms, 99)
      expect(result.has(10)).toBe(true)
      expect(result.has(11)).toBe(true)
    })

    test('"@Marti" sin apellido es ambiguo y notifica a los dos', () => {
      const result = resolveMentions('che @Marti alguien se fija?', homonyms, 99)
      expect(result.has(10)).toBe(true)
      expect(result.has(11)).toBe(true)
    })
  })
})
