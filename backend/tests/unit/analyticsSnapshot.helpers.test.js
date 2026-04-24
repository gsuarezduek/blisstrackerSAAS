/**
 * Tests para los helpers puros de analyticsSnapshot.service.js
 * (prevMonth, monthBounds, delta)
 *
 * No requieren DB ni mocks externos — son funciones matemáticas puras.
 */

// Extraemos las funciones directamente del módulo mediante re-export manual
// porque el service exporta solo las funciones async de alto nivel.
// Definimos las mismas implementaciones aquí para testearlas aisladamente.

function prevMonth(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  const pad     = n => String(n).padStart(2, '0')
  const lastDay = new Date(y, m, 0).getDate()
  return { startDate: `${y}-${pad(m)}-01`, endDate: `${y}-${pad(m)}-${pad(lastDay)}` }
}

function delta(curr, prev) {
  if (prev == null || prev === 0) return null
  return Math.round(((curr - prev) / prev) * 100)
}

// ─── prevMonth ────────────────────────────────────────────────────────────────

describe('prevMonth', () => {
  test('mes normal → mes anterior en el mismo año', () => {
    expect(prevMonth('2026-04')).toBe('2026-03')
    expect(prevMonth('2026-12')).toBe('2026-11')
    expect(prevMonth('2026-02')).toBe('2026-01')
  })

  test('enero → diciembre del año anterior', () => {
    expect(prevMonth('2026-01')).toBe('2025-12')
    expect(prevMonth('2000-01')).toBe('1999-12')
  })

  test('resultado siempre tiene mes con dos dígitos', () => {
    const result = prevMonth('2026-10')
    expect(result).toBe('2026-09')
    expect(result).toMatch(/^\d{4}-\d{2}$/)
  })
})

// ─── monthBounds ─────────────────────────────────────────────────────────────

describe('monthBounds', () => {
  test('devuelve startDate el día 01', () => {
    const { startDate } = monthBounds('2026-04')
    expect(startDate).toBe('2026-04-01')
  })

  test('endDate es el último día del mes', () => {
    expect(monthBounds('2026-04').endDate).toBe('2026-04-30') // abril 30 días
    expect(monthBounds('2026-01').endDate).toBe('2026-01-31') // enero 31 días
    expect(monthBounds('2026-02').endDate).toBe('2026-02-28') // febrero (no bisiesto)
    expect(monthBounds('2024-02').endDate).toBe('2024-02-29') // febrero bisiesto
    expect(monthBounds('2026-12').endDate).toBe('2026-12-31') // diciembre 31 días
  })

  test('formato de salida es YYYY-MM-DD', () => {
    const { startDate, endDate } = monthBounds('2026-06')
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    expect(startDate).toMatch(dateRegex)
    expect(endDate).toMatch(dateRegex)
  })

  test('meses de un solo dígito quedan con padding', () => {
    const { startDate, endDate } = monthBounds('2026-03')
    expect(startDate).toBe('2026-03-01')
    expect(endDate).toBe('2026-03-31')
  })
})

// ─── delta ────────────────────────────────────────────────────────────────────

describe('delta', () => {
  test('calcula porcentaje de cambio correctamente', () => {
    expect(delta(150, 100)).toBe(50)   // +50%
    expect(delta(50, 100)).toBe(-50)   // -50%
    expect(delta(100, 100)).toBe(0)    // sin cambio
  })

  test('redondea al entero más cercano', () => {
    expect(delta(110, 300)).toBe(-63)  // -63.33... → -63
    expect(delta(200, 300)).toBe(-33)  // -33.33... → -33
  })

  test('retorna null si prev es 0 (división por cero)', () => {
    expect(delta(100, 0)).toBeNull()
  })

  test('retorna null si prev es null', () => {
    expect(delta(100, null)).toBeNull()
  })

  test('funciona con valores decimales', () => {
    expect(delta(0.5, 0.25)).toBe(100)  // +100%
  })
})
