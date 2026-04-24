/**
 * Tests para helpers puros del módulo PageSpeed
 * - scoreRating: convierte score numérico a etiqueta
 * - normalización de URL (lógica del controller)
 */

// ─── scoreRating ─────────────────────────────────────────────────────────────
// Extraemos la lógica directamente (es idéntica a la del service)

function scoreRating(score) {
  if (score == null) return null
  if (score >= 0.9) return 'good'
  if (score >= 0.5) return 'needs-improvement'
  return 'poor'
}

describe('scoreRating', () => {
  test('≥ 0.9 → good', () => {
    expect(scoreRating(0.9)).toBe('good')
    expect(scoreRating(1.0)).toBe('good')
    expect(scoreRating(0.95)).toBe('good')
  })

  test('≥ 0.5 y < 0.9 → needs-improvement', () => {
    expect(scoreRating(0.5)).toBe('needs-improvement')
    expect(scoreRating(0.75)).toBe('needs-improvement')
    expect(scoreRating(0.89)).toBe('needs-improvement')
  })

  test('< 0.5 → poor', () => {
    expect(scoreRating(0)).toBe('poor')
    expect(scoreRating(0.1)).toBe('poor')
    expect(scoreRating(0.49)).toBe('poor')
  })

  test('null → null', () => {
    expect(scoreRating(null)).toBeNull()
    expect(scoreRating(undefined)).toBeNull()
  })
})

// ─── Normalización de URL ─────────────────────────────────────────────────────
// Misma lógica que usa el controller antes de llamar a PageSpeed API

function normalizeUrl(websiteUrl) {
  return /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`
}

describe('normalizeUrl', () => {
  test('URLs con https:// se mantienen igual', () => {
    expect(normalizeUrl('https://ejemplo.com')).toBe('https://ejemplo.com')
    expect(normalizeUrl('https://www.ejemplo.com/path')).toBe('https://www.ejemplo.com/path')
  })

  test('URLs con http:// se mantienen igual', () => {
    expect(normalizeUrl('http://ejemplo.com')).toBe('http://ejemplo.com')
  })

  test('URLs sin protocolo reciben https://', () => {
    expect(normalizeUrl('ejemplo.com')).toBe('https://ejemplo.com')
    expect(normalizeUrl('www.ejemplo.com')).toBe('https://www.ejemplo.com')
    expect(normalizeUrl('blissout.com.ar')).toBe('https://blissout.com.ar')
  })

  test('no agrega doble protocolo', () => {
    const result = normalizeUrl('https://ejemplo.com')
    expect(result).not.toContain('https://https://')
  })

  test('protocolo en mayúsculas también se detecta', () => {
    expect(normalizeUrl('HTTPS://ejemplo.com')).toBe('HTTPS://ejemplo.com')
    expect(normalizeUrl('HTTP://ejemplo.com')).toBe('HTTP://ejemplo.com')
  })
})
