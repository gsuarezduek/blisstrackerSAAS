/**
 * El mes EN CURSO no se compara contra el mes anterior completo.
 *
 * El bug que cubren estos tests: el análisis IA de Web → Analytics ponía en el
 * prompt los 13 días que tenía noviembre y los 31 de octubre como si fueran dos
 * meses, y la IA reportaba una caída de ~60% que nunca existió. Las tarjetas de
 * la misma pantalla ya estaban bien (GA4 compara los mismos días ordinales).
 * Lo que se afirma acá es el criterio con el que ahora se arma la comparación.
 */
jest.mock('../../src/lib/prisma', () => ({
  analyticsSnapshot:  { findUnique: jest.fn(), upsert: jest.fn() },
  analyticsInsight:   { upsert: jest.fn() },
  project:            { findUnique: jest.fn() },
  workspace:          { findUnique: jest.fn() },
  projectIntegration: { findUnique: jest.fn() },
}))

const { monthProgress, projectMonthValue, windowLabel } = require('../../src/services/analyticsSnapshot.service')
const { computePreviousPeriod } = require('../../src/services/googleAnalytics.service')

// ─── monthProgress ───────────────────────────────────────────────────────────

describe('monthProgress', () => {
  test('mes en curso: parcial, con los días transcurridos y el corte en hoy', () => {
    const p = monthProgress('2026-11', undefined, '2026-11-13')
    expect(p).toEqual({ isPartial: true, isFuture: false, daysElapsed: 13, daysInMonth: 30, from: '2026-11-01', to: '2026-11-13' })
  })

  test('mes cerrado: completo, de punta a punta', () => {
    const p = monthProgress('2026-10', undefined, '2026-11-13')
    expect(p.isPartial).toBe(false)
    expect(p.daysElapsed).toBe(31)
    expect(p.to).toBe('2026-10-31')
  })

  test('el último día del mes todavía es parcial (el día en curso no cerró)', () => {
    const p = monthProgress('2026-11', undefined, '2026-11-30')
    expect(p.isPartial).toBe(true)
    expect(p.daysElapsed).toBe(30)
    expect(p.daysInMonth).toBe(30)
  })

  test('el 1° del mes: un solo día transcurrido', () => {
    expect(monthProgress('2026-11', undefined, '2026-11-01').daysElapsed).toBe(1)
  })

  test('mes futuro: ni parcial ni cerrado', () => {
    const p = monthProgress('2026-12', undefined, '2026-11-13')
    expect(p).toMatchObject({ isPartial: false, isFuture: true, daysElapsed: 0 })
  })

  test('febrero bisiesto y no bisiesto', () => {
    expect(monthProgress('2024-02', undefined, '2024-02-10').daysInMonth).toBe(29)
    expect(monthProgress('2026-02', undefined, '2026-02-10').daysInMonth).toBe(28)
  })

  test('el mes en curso se resuelve con el "hoy" del workspace, no del servidor', () => {
    // Un workspace en Buenos Aires el 1° a la mañana: diciembre todavía no empezó.
    expect(monthProgress('2026-12', undefined, '2026-11-30').isFuture).toBe(true)
    expect(monthProgress('2026-12', undefined, '2026-12-01').isPartial).toBe(true)
  })
})

// ─── Ventana comparable ──────────────────────────────────────────────────────

describe('ventana comparable del mes anterior', () => {
  test('13 días de noviembre se comparan contra 13 días de octubre, no contra octubre entero', () => {
    const p = monthProgress('2026-11', undefined, '2026-11-13')
    expect(computePreviousPeriod(p.from, p.to)).toEqual({ startDate: '2026-10-01', endDate: '2026-10-13' })
  })

  test('el 31 de marzo contra febrero: se recorta al último día que existe', () => {
    const p = monthProgress('2026-03', undefined, '2026-03-31')
    expect(computePreviousPeriod(p.from, p.to)).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' })
  })

  test('enero compara contra diciembre del año anterior', () => {
    const p = monthProgress('2026-01', undefined, '2026-01-09')
    expect(computePreviousPeriod(p.from, p.to)).toEqual({ startDate: '2025-12-01', endDate: '2025-12-09' })
  })

  test('las dos ventanas tienen el mismo largo (es el punto de todo esto)', () => {
    for (const today of ['2026-11-02', '2026-11-13', '2026-11-27', '2026-07-15']) {
      const p = monthProgress(today.slice(0, 7), undefined, today)
      const prev = computePreviousPeriod(p.from, p.to)
      const days = s => Number(s.slice(8, 10))
      expect(days(prev.endDate)).toBe(Math.min(p.daysElapsed, days(prev.endDate)))
      expect(days(prev.endDate)).toBeLessThanOrEqual(p.daysElapsed)
    }
  })
})

// ─── Proyección ──────────────────────────────────────────────────────────────

describe('projectMonthValue', () => {
  test('proyecta a fin de mes al ritmo de los días transcurridos', () => {
    expect(projectMonthValue(1300, 13, 30)).toBe(3000)
    expect(projectMonthValue(100, 10, 31)).toBe(310)
  })

  test('un mes completo se proyecta a sí mismo', () => {
    expect(projectMonthValue(4210, 30, 30)).toBe(4210)
  })

  test('sin días transcurridos o sin valor no hay proyección (nunca 0 ni Infinity)', () => {
    expect(projectMonthValue(100, 0, 30)).toBeNull()
    expect(projectMonthValue(null, 13, 30)).toBeNull()
    expect(projectMonthValue(undefined, 13, 30)).toBeNull()
  })

  test('cero visitas en lo que va del mes proyecta cero, no null', () => {
    expect(projectMonthValue(0, 13, 30)).toBe(0)
  })
})

// ─── Etiqueta de ventana ─────────────────────────────────────────────────────

describe('windowLabel', () => {
  test('mismo mes', () => {
    expect(windowLabel('2026-11-01', '2026-11-13')).toBe('1 al 13 de noviembre')
    expect(windowLabel('2026-10-01', '2026-10-13')).toBe('1 al 13 de octubre')
  })

  test('cruza de mes', () => {
    expect(windowLabel('2026-10-20', '2026-11-05')).toBe('20 de octubre al 5 de noviembre')
  })
})
