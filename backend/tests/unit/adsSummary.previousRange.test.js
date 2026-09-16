const { previousRangeFor } = require('../../src/controllers/marketingSummary/adsSummary.controller')

describe('previousRangeFor', () => {
  it('today → el día inmediato anterior', () => {
    expect(previousRangeFor('today', '2026-03-15')).toEqual({ startDate: '2026-03-14', endDate: '2026-03-14' })
  })

  it('this_week → mismo tramo (lunes a día X) de la semana anterior', () => {
    // 2026-03-18 es miércoles. Lunes de esta semana: 2026-03-16.
    expect(previousRangeFor('this_week', '2026-03-18')).toEqual({ startDate: '2026-03-09', endDate: '2026-03-11' })
  })

  it('this_week con hoy=lunes → un solo día (semana pasada, mismo lunes)', () => {
    // 2026-03-16 es lunes.
    expect(previousRangeFor('this_week', '2026-03-16')).toEqual({ startDate: '2026-03-09', endDate: '2026-03-09' })
  })

  it('this_month → mismo tramo (día 1 a día X) del mes anterior', () => {
    expect(previousRangeFor('this_month', '2026-03-15')).toEqual({ startDate: '2026-02-01', endDate: '2026-02-15' })
  })

  it('this_month recorta el día si el mes anterior es más corto (31 marzo → 28 feb)', () => {
    expect(previousRangeFor('this_month', '2026-03-31')).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' })
  })

  it('this_month cruza el año (enero → diciembre anterior)', () => {
    expect(previousRangeFor('this_month', '2026-01-10')).toEqual({ startDate: '2025-12-01', endDate: '2025-12-10' })
  })

  it('período desconocido → null', () => {
    expect(previousRangeFor('last_month', '2026-03-15')).toBeNull()
  })
})
