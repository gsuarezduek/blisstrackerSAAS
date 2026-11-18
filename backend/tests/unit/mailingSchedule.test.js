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
