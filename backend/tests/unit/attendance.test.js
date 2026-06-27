const { inArrivalWindow, laborableDays, loginMinsFromMidnight, ARRIVAL_WINDOW_MINS } = require('../../src/lib/attendance')

const TZ = 'America/Argentina/Buenos_Aires'
// Helper: ISO de una hora local (UTC-3) para un día dado.
const at = (day, hh, mm = 0) => `${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-03:00`

describe('inArrivalWindow (ventana ±2h)', () => {
  const start = 9 * 60 // 09:00

  test('llegada puntual está dentro de la ventana', () => {
    expect(inArrivalWindow(9 * 60, start)).toBe(true)
  })
  test('hasta 2h antes y 2h después están dentro (bordes inclusive)', () => {
    expect(inArrivalWindow(7 * 60, start)).toBe(true)   // 07:00 = inicio - 2h
    expect(inArrivalWindow(11 * 60, start)).toBe(true)  // 11:00 = inicio + 2h
  })
  test('un domingo a la tarde (15:00) queda fuera de la ventana', () => {
    expect(inArrivalWindow(15 * 60, start)).toBe(false)
  })
  test('una llegada muy tardía (12:00, +3h) queda fuera (se ignora, no es tardanza)', () => {
    expect(inArrivalWindow(12 * 60, start)).toBe(false)
  })
  test('antes de la ventana (06:30) queda fuera', () => {
    expect(inArrivalWindow(6 * 60 + 30, start)).toBe(false)
  })
  test('sin horario (startMins null) no se filtra: siempre dentro', () => {
    expect(inArrivalWindow(15 * 60, null)).toBe(true)
  })
  test('ARRIVAL_WINDOW_MINS es 120', () => {
    expect(ARRIVAL_WINDOW_MINS).toBe(120)
  })
})

describe('laborableDays (regla del >50%)', () => {
  test('un día con >50% del equipo cuenta; con exactamente 50% no', () => {
    const activeCount = 4
    const logins = [
      // 2026-06-01: 3 de 4 (75% > 50%) → laborable
      { userId: 1, loginAt: at('2026-06-01', 9) },
      { userId: 2, loginAt: at('2026-06-01', 9) },
      { userId: 3, loginAt: at('2026-06-01', 10) },
      // 2026-06-02: 2 de 4 (50%, no es > 50%) → NO laborable
      { userId: 1, loginAt: at('2026-06-02', 9) },
      { userId: 2, loginAt: at('2026-06-02', 9) },
      // 2026-06-07 (domingo): 1 de 4 (conexión suelta) → NO laborable
      { userId: 1, loginAt: at('2026-06-07', 15) },
    ]
    const set = laborableDays(logins, activeCount, TZ)
    expect(set.has('2026-06-01')).toBe(true)
    expect(set.has('2026-06-02')).toBe(false)
    expect(set.has('2026-06-07')).toBe(false)
    expect(set.size).toBe(1)
  })

  test('logins repetidos del mismo usuario en el día cuentan una sola vez', () => {
    const logins = [
      { userId: 1, loginAt: at('2026-06-01', 9) },
      { userId: 1, loginAt: at('2026-06-01', 14) },
      { userId: 1, loginAt: at('2026-06-01', 18) },
    ]
    // 1 usuario distinto de 2 → 50%, no laborable
    expect(laborableDays(logins, 2, TZ).has('2026-06-01')).toBe(false)
    // 1 usuario distinto de 1 → 100%, laborable
    expect(laborableDays(logins, 1, TZ).has('2026-06-01')).toBe(true)
  })

  test('sin miembros activos devuelve set vacío', () => {
    expect(laborableDays([{ userId: 1, loginAt: at('2026-06-01', 9) }], 0, TZ).size).toBe(0)
  })
})

describe('loginMinsFromMidnight', () => {
  test('convierte la hora local a minutos desde medianoche', () => {
    expect(loginMinsFromMidnight(at('2026-06-01', 9, 30), TZ)).toBe(9 * 60 + 30)
  })
})
