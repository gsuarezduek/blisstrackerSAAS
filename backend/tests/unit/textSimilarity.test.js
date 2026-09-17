const { jaccardSimilarity } = require('../../src/lib/textSimilarity')

describe('jaccardSimilarity', () => {
  test('mismo título exacto → 1', () => {
    expect(jaccardSimilarity('Agregar meta description a la home', 'Agregar meta description a la home')).toBe(1)
  })

  test('reformulado por IA con mismo vocabulario relevante → similitud alta', () => {
    const a = 'Agregar meta description a la página de Servicios'
    const b = 'Falta meta description en la página de Servicios'
    expect(jaccardSimilarity(a, b)).toBeGreaterThanOrEqual(0.5)
  })

  test('hallazgos sobre temas distintos → similitud baja', () => {
    const a = 'Optimizar el CTR de la campaña de Instagram'
    const b = 'Mejorar el engagement en TikTok'
    expect(jaccardSimilarity(a, b)).toBeLessThan(0.3)
  })

  test('ignora acentos y mayúsculas', () => {
    expect(jaccardSimilarity('Título con acentos: canción, año', 'Titulo con acentos: cancion, ano')).toBe(1)
  })

  test('string vacío o null → 0', () => {
    expect(jaccardSimilarity('', 'algo')).toBe(0)
    expect(jaccardSimilarity(null, undefined)).toBe(0)
  })
})
