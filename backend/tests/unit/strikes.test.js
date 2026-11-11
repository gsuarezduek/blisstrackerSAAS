const {
  MAX_ACTIVE_STRIKES, strikeExpiresAt, isStrikeActive, activeStrikeWhere, shapeStrikes,
} = require('../../src/lib/strikes')

// El criterio de "falta activa" vive en un solo lugar porque lo consultan el panel
// de Desempeño, el tope al registrar una nueva y los contadores de RRHH. Duplicarlo
// es una persona que figura con 2 faltas en una pantalla y con 1 en la otra.

const NOW = new Date('2026-11-10T12:00:00Z')

describe('vencimiento', () => {
  it('suma los meses de la política del workspace', () => {
    expect(strikeExpiresAt('2026-01-10T00:00:00Z', 12).toISOString().slice(0, 10)).toBe('2027-01-10')
    expect(strikeExpiresAt('2026-01-10T00:00:00Z', 6).toISOString().slice(0, 10)).toBe('2026-07-10')
  })

  // 0 = la política de "no vencen, solo se levantan a mano".
  it('0 o un valor inválido significa que no vence', () => {
    for (const v of [0, -3, null, undefined, 'doce', NaN]) {
      expect(strikeExpiresAt('2026-01-10T00:00:00Z', v)).toBeNull()
    }
  })
})

describe('isStrikeActive', () => {
  it('cuenta mientras no haya vencido ni se haya levantado', () => {
    expect(isStrikeActive({ expiresAt: '2027-01-01' }, NOW)).toBe(true)
    expect(isStrikeActive({ expiresAt: '2026-01-01' }, NOW)).toBe(false)
    expect(isStrikeActive({ expiresAt: '2027-01-01', liftedAt: '2026-05-01' }, NOW)).toBe(false)
  })

  // Las faltas registradas mientras el vencimiento estaba apagado no vencen solas.
  it('sin expiresAt no vence por tiempo', () => {
    expect(isStrikeActive({ expiresAt: null }, NOW)).toBe(true)
  })

  // Levantar gana sobre cualquier fecha: es una decisión explícita.
  it('una levantada no revive aunque su vencimiento sea futuro', () => {
    expect(isStrikeActive({ expiresAt: null, liftedAt: '2026-05-01' }, NOW)).toBe(false)
  })
})

describe('activeStrikeWhere', () => {
  it('acepta las que no vencen y las que vencen después de ahora', () => {
    expect(activeStrikeWhere(NOW)).toEqual({
      liftedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }],
    })
  })
})

describe('shapeStrikes', () => {
  const rows = [
    { id: 1, createdAt: '2024-01-01', expiresAt: '2025-01-01' },                                   // vencida
    { id: 2, createdAt: '2026-03-01', expiresAt: '2027-03-01' },                                   // activa
    { id: 3, createdAt: '2026-05-01', expiresAt: '2027-05-01', liftedAt: '2026-06-01' },           // levantada
    { id: 4, createdAt: '2026-07-01', expiresAt: '2027-07-01' },                                   // activa
  ]

  // El número se deriva en LECTURA sobre las activas: como las faltas vencen solas,
  // el que le tocó al registrarse deja de ser cierto, y renumerar la tabla pediría
  // un cron diario para algo que sale en una línea.
  it('numera solo las activas, en orden cronológico', () => {
    const out = shapeStrikes(rows, NOW)
    expect(out.map(s => [s.id, s.active, s.strikeNumber])).toEqual([
      [1, false, null], [2, true, 1], [3, false, null], [4, true, 2],
    ])
  })

  it('dice por qué dejó de contar', () => {
    const byId = Object.fromEntries(shapeStrikes(rows, NOW).map(s => [s.id, s]))
    expect(byId[1].inactiveReason).toBe('expired')
    expect(byId[3].inactiveReason).toBe('lifted')
    expect(byId[2].inactiveReason).toBeNull()
  })

  it('no muta ni reordena el array que recibe', () => {
    const input = [...rows]
    shapeStrikes(input, NOW)
    expect(input.map(s => s.id)).toEqual([1, 2, 3, 4])
  })

  it('expone el acuerdo y quién la levantó', () => {
    const [s] = shapeStrikes([{
      id: 9, createdAt: '2026-02-01', expiresAt: '2027-02-01', agreement: 'Avisar con 48 h',
      liftedAt: '2026-08-01', liftReason: 'Se corrigió', liftedBy: { id: 3, name: 'Ana' },
      createdBy: { id: 1, name: 'Beto' },
    }], NOW)
    expect(s).toMatchObject({
      agreement: 'Avisar con 48 h',
      liftReason: 'Se corrigió',
      liftedBy: { id: 3, name: 'Ana' },
      createdBy: { id: 1, name: 'Beto' },
      active: false,
    })
  })

  it('el tope sigue siendo 3', () => {
    expect(MAX_ACTIVE_STRIKES).toBe(3)
  })
})
