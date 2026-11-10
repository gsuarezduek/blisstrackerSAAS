jest.mock('../../src/lib/prisma', () => ({}))
jest.mock('../../src/lib/platformSettings', () => ({ getSettings: jest.fn() }))

const { trialPosition, pickStage, buildPricing, STAGES } = require('../../src/services/trialLifecycle.service')

const TZ = 'America/Argentina/Buenos_Aires'
// Instante a las 09:00 ART (= 12:00 UTC), la hora a la que corre el cron.
const at9 = ymd => new Date(`${ymd}T12:00:00Z`)

function stageFor(ws, ymd) {
  return pickStage(trialPosition({ timezone: TZ, ...ws }, at9(ymd)))?.type ?? null
}

describe('trialPosition / pickStage', () => {
  // Alta el 1/11 a las 15:00 ART, trial de 14 días → vence el 15/11 a las 15:00 ART.
  const ws14 = { createdAt: new Date('2026-11-01T18:00:00Z'), trialEndsAt: new Date('2026-11-15T18:00:00Z') }

  test('trial de 14 días: mismo calendario que los días fijos de antes', () => {
    expect(stageFor(ws14, '2026-11-04')).toBe('trialDay3CheckIn')
    expect(stageFor(ws14, '2026-11-08')).toBe('trialDay7Progress')
    expect(stageFor(ws14, '2026-11-13')).toBe('trialDay12Urgency')
    expect(stageFor(ws14, '2026-11-14')).toBe('trialDay13LastDay')
    expect(stageFor(ws14, '2026-11-10')).toBeNull()
  })

  test('trial de 30 días: la urgencia sale contra el vencimiento, no en el día 12', () => {
    const ws = { createdAt: new Date('2026-11-01T18:00:00Z'), trialEndsAt: new Date('2026-12-01T18:00:00Z') }
    expect(stageFor(ws, '2026-11-13')).toBeNull()
    expect(stageFor(ws, '2026-11-16')).toBe('trialDay7Progress') // mitad: día 15
    expect(stageFor(ws, '2026-11-29')).toBe('trialDay12Urgency')
    expect(stageFor(ws, '2026-11-30')).toBe('trialDay13LastDay')
  })

  test('trial extendido a mano: el aviso se corre con la nueva fecha', () => {
    const extended = { ...ws14, trialEndsAt: new Date('2026-11-22T18:00:00Z') }
    expect(stageFor(extended, '2026-11-13')).toBeNull()
    expect(stageFor(extended, '2026-11-20')).toBe('trialDay12Urgency')
  })

  test('trial corto: no manda check-in ni "mitad" encima de la urgencia', () => {
    const ws = { createdAt: new Date('2026-11-01T18:00:00Z'), trialEndsAt: new Date('2026-11-06T18:00:00Z') }
    expect(stageFor(ws, '2026-11-04')).toBe('trialDay12Urgency') // faltan 2, aunque sea el día 3
    expect(stageFor(ws, '2026-11-05')).toBe('trialDay13LastDay')
  })

  test('los días se cuentan en la timezone del workspace, no en UTC', () => {
    // 23:30 ART del 13/11 = 02:30 UTC del 14/11. En ART faltan 2 días.
    const pos = trialPosition({ timezone: TZ, ...ws14 }, new Date('2026-11-14T02:30:00Z'))
    expect(pos.left).toBe(2)
  })

  test('sin trialEndsAt cae a trialDays desde el alta', () => {
    const pos = trialPosition({ timezone: TZ, createdAt: ws14.createdAt, trialEndsAt: null }, at9('2026-11-13'), 14)
    expect(pos.left).toBe(2)
  })

  test('solo los avisos de urgencia se pueden reenviar', () => {
    expect(STAGES.filter(s => s.resendAfterDays).map(s => s.type)).toEqual(['trialDay12Urgency', 'trialDay13LastDay'])
  })
})

describe('buildPricing', () => {
  test('usa el precio cargado y menciona el segundo tramo', () => {
    const p = buildPricing({ pricingTiers: [{ upTo: 19, pricePerSeat: 5 }, { upTo: null, pricePerSeat: 4 }], freeSeatLimit: 3 })
    expect(p.priceHtml).toContain('USD 5 por usuario por mes')
    expect(p.priceHtml).toContain('USD 4 a partir del usuario 20')
    expect(p.priceShort).toBe('USD 5/usuario/mes')
    expect(p.freeSeatLimit).toBe(3)
  })

  test('un solo tramo con decimales', () => {
    const p = buildPricing({ pricingTiers: [{ upTo: null, pricePerSeat: 7.5 }], freeSeatLimit: 0 })
    expect(p.priceHtml).toBe('<strong>USD 7.50 por usuario por mes</strong>')
    expect(p.freeSeatLimit).toBe(0)
  })

  test('los templates no traen montos ni límites escritos a mano', () => {
    const pricing = buildPricing({ pricingTiers: [{ upTo: null, pricePerSeat: 9 }], freeSeatLimit: 5 })
    for (const s of STAGES) {
      const html = s.tpl({ name: 'Ana', pricing, age: 7 })
      expect(html).not.toMatch(/USD 3\b|hasta 3 usuarios|más de 3/)
    }
    const urgency = STAGES.find(s => s.type === 'trialDay12Urgency').tpl({ name: 'Ana', pricing })
    expect(urgency).toContain('USD 9 por usuario por mes')
    expect(urgency).toContain('hasta 5 usuarios')
  })
})
