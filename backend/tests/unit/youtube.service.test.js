const { parseISODuration, SHORT_MAX_SECONDS } = require('../../src/services/youtube.service')

describe('youtube.service — parseISODuration', () => {
  test('parsea segundos', () => {
    expect(parseISODuration('PT45S')).toBe(45)
  })
  test('parsea minutos y segundos', () => {
    expect(parseISODuration('PT1M30S')).toBe(90)
  })
  test('parsea horas, minutos y segundos', () => {
    expect(parseISODuration('PT1H2M3S')).toBe(3723)
  })
  test('parsea solo minutos', () => {
    expect(parseISODuration('PT10M')).toBe(600)
  })
  test('devuelve null ante valores inválidos o vacíos', () => {
    expect(parseISODuration(null)).toBeNull()
    expect(parseISODuration('')).toBeNull()
    expect(parseISODuration('abc')).toBeNull()
  })
})

describe('youtube.service — clasificación de Shorts (heurística por duración)', () => {
  // Un video es Short si dura <= 60s (la API no expone un flag oficial).
  const isShort = (iso) => {
    const sec = parseISODuration(iso)
    return sec != null ? sec <= SHORT_MAX_SECONDS : false
  }
  test('un video de 60s o menos es Short', () => {
    expect(isShort('PT60S')).toBe(true)
    expect(isShort('PT58S')).toBe(true)
  })
  test('un video de más de 60s es largo', () => {
    expect(isShort('PT1M1S')).toBe(false)
    expect(isShort('PT12M30S')).toBe(false)
  })
  test('sin duración no se clasifica como Short', () => {
    expect(isShort(null)).toBe(false)
  })
})
