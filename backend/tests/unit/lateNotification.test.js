const { lateMinutes, DEFAULT_LATE_TEMPLATE } = require('../../src/services/lateNotification.service')

const TZ = 'America/Argentina/Buenos_Aires' // UTC-3
const start9 = 9 * 60 // 09:00 = 540

describe('lateNotification.lateMinutes (regla de tardanza con tolerancia)', () => {
  test('sin tolerancia: 09:01 es tarde por 1, 09:00 no es tarde', () => {
    expect(lateMinutes('2026-06-16T12:01:00Z', TZ, start9, 0)).toBe(1)   // 09:01 ART
    expect(lateMinutes('2026-06-16T12:00:00Z', TZ, start9, 0)).toBe(0)   // 09:00 ART → no tarde (>0 falso)
  })

  test('tolerancia 5: 09:05 no cuenta, 09:06 cuenta como +1', () => {
    expect(lateMinutes('2026-06-16T12:05:00Z', TZ, start9, 5)).toBe(0)   // 09:05 → 545-540-5 = 0
    expect(lateMinutes('2026-06-16T12:06:00Z', TZ, start9, 5)).toBe(1)   // 09:06 → 546-540-5 = 1 (tarde)
  })

  test('llegada temprana da negativo (no tarde)', () => {
    expect(lateMinutes('2026-06-16T11:30:00Z', TZ, start9, 0)).toBe(-30) // 08:30 ART
  })
})

describe('lateNotification.DEFAULT_LATE_TEMPLATE', () => {
  test('incluye los placeholders [Nombre] y [workspace]', () => {
    expect(DEFAULT_LATE_TEMPLATE).toContain('[Nombre]')
    expect(DEFAULT_LATE_TEMPLATE).toContain('[workspace]')
  })
})
