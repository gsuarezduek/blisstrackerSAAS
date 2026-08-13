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
})
