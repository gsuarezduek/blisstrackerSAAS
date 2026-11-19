// Ritmo de envío de Mailing: ventana horaria en la tz del workspace y estimación
// de cuántos días tarda una campaña con el tope diario.
const { inSendWindow, estimateFinish, isHHMM } = require('../../src/services/mailing/schedule')

const TZ = 'America/Argentina/Buenos_Aires' // UTC-3
const at = (utc) => new Date(utc)

describe('inSendWindow', () => {
  it('usa la hora de pared del workspace, no la del servidor', () => {
    // 12:00 UTC = 09:00 en Buenos Aires
    expect(inSendWindow(at('2026-11-18T12:00:00Z'), TZ, '09:00', '20:00')).toBe(true)
    expect(inSendWindow(at('2026-11-18T11:59:00Z'), TZ, '09:00', '20:00')).toBe(false)
    // fin exclusivo: 20:00 ya no
    expect(inSendWindow(at('2026-11-18T23:00:00Z'), TZ, '09:00', '20:00')).toBe(false)
  })

  it('respeta una ventana que cruza la medianoche', () => {
    expect(inSendWindow(at('2026-11-19T02:00:00Z'), TZ, '22:00', '06:00')).toBe(true) // 23:00 local
    expect(inSendWindow(at('2026-11-18T15:00:00Z'), TZ, '22:00', '06:00')).toBe(false) // 12:00 local
  })

  it('inicio igual a fin o un valor inválido = todo el día', () => {
    expect(inSendWindow(at('2026-11-18T05:00:00Z'), TZ, '09:00', '09:00')).toBe(true)
    expect(inSendWindow(at('2026-11-18T05:00:00Z'), TZ, 'x', '20:00')).toBe(true)
  })
})

describe('estimateFinish', () => {
  const base = { tz: TZ, start: '09:00', end: '20:00' }

  it('entra hoy si alcanza lo que queda del tope', () => {
    const r = estimateFinish({ ...base, count: 300, dailyLimit: 500, usedToday: 100, now: at('2026-11-18T15:00:00Z') })
    expect(r).toMatchObject({ days: 1, finishDate: '2026-11-18', todayCapacity: 400 })
  })

  it('reparte el resto en días siguientes', () => {
    // hoy 400 + mañana 500 + pasado 500 = 1400
    const r = estimateFinish({ ...base, count: 1400, dailyLimit: 500, usedToday: 100, now: at('2026-11-18T15:00:00Z') })
    expect(r).toMatchObject({ days: 3, finishDate: '2026-11-20' })
  })

  it('con la ventana de hoy ya cerrada, empieza mañana', () => {
    const r = estimateFinish({ ...base, count: 500, dailyLimit: 500, usedToday: 0, now: at('2026-11-18T23:30:00Z') }) // 20:30 local
    expect(r).toMatchObject({ days: 1, finishDate: '2026-11-19', todayCapacity: 0 })
  })

  it('antes de que abra la ventana, hoy todavía cuenta', () => {
    const r = estimateFinish({ ...base, count: 200, dailyLimit: 500, now: at('2026-11-18T10:00:00Z') }) // 07:00 local
    expect(r.finishDate).toBe('2026-11-18')
  })
})

describe('isHHMM', () => {
  it('valida el formato', () => {
    expect(isHHMM('09:00')).toBe(true)
    expect(isHHMM('23:59')).toBe(true)
    expect(isHHMM('24:00')).toBe(false)
    expect(isHHMM('9:00')).toBe(false)
  })
})

describe('calentamiento del dominio', () => {
  const { warmupLimit, effectiveDailyLimit } = require('../../src/services/mailing/schedule')

  it('arranca en 50 y crece 50% por día', () => {
    expect([0, 1, 2, 3, 4].map(warmupLimit)).toEqual([50, 75, 113, 169, 253])
  })

  it('el tope del día es el menor entre el configurado, el techo de plataforma y la curva', () => {
    const now = at('2026-11-18T15:00:00Z')
    const startedAt = at('2026-11-16T15:00:00Z') // hace 2 días → día 3 → 113
    expect(effectiveDailyLimit({ dailyLimit: 1000, warmupEnabled: true, warmupStartedAt: startedAt, tz: TZ, now }))
      .toEqual({ limit: 113, warmup: { day: 3, limit: 113, done: false } })
    expect(effectiveDailyLimit({ dailyLimit: 80, warmupEnabled: true, warmupStartedAt: startedAt, tz: TZ, now }).warmup.done).toBe(true)
    expect(effectiveDailyLimit({ dailyLimit: 1000, hardCap: 300, warmupEnabled: false, tz: TZ, now })).toEqual({ limit: 300, warmup: null })
  })

  it('la estimación recorre el tope de cada día', () => {
    // 50 + 75 + 113 + 169 + 253 + 380 = 1040 → 6 días
    const r = estimateFinish({ count: 1000, limitForDay: warmupLimit, tz: TZ, start: '09:00', end: '20:00', now: at('2026-11-18T15:00:00Z') })
    expect(r).toMatchObject({ days: 6, finishDate: '2026-11-23', todayCapacity: 50 })
  })
})
