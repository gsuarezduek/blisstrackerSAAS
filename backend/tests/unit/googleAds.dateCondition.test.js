// GAQL acepta en DURING solo una lista cerrada de literales: LAST_90_DAYS no existe
// y hacía fallar la query entera (INVALID_VALUE_WITH_DURING_OPERATOR) cada vez que
// alguien elegía "90 días". Esos presets se arman como BETWEEN explícito.
const { gaqlDateCondition } = require('../../src/services/googleAds.service')

describe('gaqlDateCondition', () => {
  it('usa DURING para los literales que GAQL sí tiene', () => {
    expect(gaqlDateCondition('last_30d')).toBe('DURING LAST_30_DAYS')
    expect(gaqlDateCondition('this_month')).toBe('DURING THIS_MONTH')
  })

  it('last_90d va como BETWEEN: los 90 días completos antes de hoy, sin hoy', () => {
    expect(gaqlDateCondition('last_90d', null, '2026-11-27'))
      .toBe("BETWEEN '2026-08-29' AND '2026-11-26'")
  })

  it('cruza el cambio de año', () => {
    expect(gaqlDateCondition('last_90d', null, '2026-01-01'))
      .toBe("BETWEEN '2025-10-03' AND '2025-12-31'")
  })

  it('nunca manda LAST_90_DAYS', () => {
    expect(gaqlDateCondition('last_90d')).not.toMatch(/LAST_90_DAYS|DURING/)
  })

  it('un rango explícito gana sobre el preset', () => {
    expect(gaqlDateCondition('last_90d', { startDate: '2026-01-01', endDate: '2026-01-31' }))
      .toBe("BETWEEN '2026-01-01' AND '2026-01-31'")
  })

  it('un preset desconocido cae en THIS_MONTH', () => {
    expect(gaqlDateCondition('cualquiera')).toBe('DURING THIS_MONTH')
  })
})
