jest.mock('../../src/lib/prisma', () => ({
  workspace:          { findUnique: jest.fn() },
  workspaceMember:    { findMany: jest.fn() },
  userLogin:          { findMany: jest.fn() },
  vacationRequest:    { findMany: jest.fn() },
  task:               { findMany: jest.fn() },
  project:            { findMany: jest.fn() },
  rrhhMetricSnapshot: { findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { computeAutoScorecardYear, isoWeekPeriodOf } = require('../../src/services/eosAutoScorecard.service')

const TZ = 'America/Argentina/Buenos_Aires' // UTC-3

function resetAll() {
  Object.values(prisma).forEach(model => Object.values(model).forEach(fn => fn.mockReset()))
  // defaults
  prisma.workspace.findUnique.mockResolvedValue({ attendanceTrackingEnabled: true, lateToleranceMins: 0 })
  prisma.workspaceMember.findMany.mockResolvedValue([])
  prisma.userLogin.findMany.mockResolvedValue([])
  prisma.vacationRequest.findMany.mockResolvedValue([])
  prisma.task.findMany.mockResolvedValue([])
  prisma.project.findMany.mockResolvedValue([])
  prisma.rrhhMetricSnapshot.findMany.mockResolvedValue([])
}

beforeEach(resetAll)

describe('isoWeekPeriodOf', () => {
  it('asigna la semana ISO correcta', () => {
    // 2026-03-02 es lunes de la semana ISO 10 de 2026
    expect(isoWeekPeriodOf('2026-03-02')).toBe('2026-W10')
    expect(isoWeekPeriodOf('2026-03-08')).toBe('2026-W10') // domingo misma semana
    expect(isoWeekPeriodOf('2026-03-09')).toBe('2026-W11')
  })
})

describe('computeAutoScorecardYear — tardanzas', () => {
  it('cuenta las llegadas tarde de la semana y arma el top 3 (días, desempata minutos)', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, workStartTime: '09:00', workEndTime: '17:00', user: { name: 'Ana Lopez', avatar: 'a.png' } },
      { userId: 2, workStartTime: '09:00', workEndTime: '17:00', user: { name: 'Beto Ruiz', avatar: 'b.png' } },
    ])
    prisma.userLogin.findMany.mockResolvedValue([
      // Ana: 2 días tarde (lun +30, mar +10) → 2 días, 40 min
      { userId: 1, loginAt: '2026-03-02T09:30:00-03:00' },
      { userId: 1, loginAt: '2026-03-03T09:10:00-03:00' },
      // Beto: 1 día tarde (lun +50)
      { userId: 2, loginAt: '2026-03-02T09:50:00-03:00' },
      // Beto: martes en horario (no cuenta)
      { userId: 2, loginAt: '2026-03-03T08:55:00-03:00' },
    ])

    const out = await computeAutoScorecardYear(1, TZ, 2026, ['tardanzas'])
    const wk = out.tardanzas['2026-W10']
    expect(wk.value).toBe(3) // 2 (Ana) + 1 (Beto)
    expect(wk.top3.map(p => p.userId)).toEqual([1, 2]) // Ana primero: más días
    expect(wk.top3[0]).toMatchObject({ userId: 1, lateDays: 2, lateMins: 40 })
    expect(wk.top3[1]).toMatchObject({ userId: 2, lateDays: 1, lateMins: 50 })
  })

  it('respeta la tolerancia', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ attendanceTrackingEnabled: true, lateToleranceMins: 15 })
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, workStartTime: '09:00', workEndTime: '17:00', user: { name: 'Ana', avatar: 'a.png' } },
    ])
    prisma.userLogin.findMany.mockResolvedValue([
      { userId: 1, loginAt: '2026-03-02T09:10:00-03:00' }, // +10, dentro de tolerancia 15 → no tarde
      { userId: 1, loginAt: '2026-03-03T09:20:00-03:00' }, // +20 → tarde por 5
    ])
    const out = await computeAutoScorecardYear(1, TZ, 2026, ['tardanzas'])
    expect(out.tardanzas['2026-W10'].value).toBe(1)
    expect(out.tardanzas['2026-W10'].top3[0]).toMatchObject({ lateDays: 1, lateMins: 5 })
  })

  it('no calcula tardanzas si el seguimiento de horarios está apagado', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ attendanceTrackingEnabled: false, lateToleranceMins: 0 })
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, workStartTime: '09:00', workEndTime: '17:00', user: { name: 'Ana', avatar: 'a.png' } },
    ])
    prisma.userLogin.findMany.mockResolvedValue([{ userId: 1, loginAt: '2026-03-02T11:00:00-03:00' }])
    const out = await computeAutoScorecardYear(1, TZ, 2026, ['tardanzas'])
    expect(Object.keys(out.tardanzas)).toHaveLength(0)
  })
})

describe('computeAutoScorecardYear — ocupación', () => {
  it('pondera horas trabajadas sobre disponibles y rankea a los que menos aprovecharon', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, workStartTime: '09:00', workEndTime: '17:00', user: { name: 'Ana', avatar: 'a.png' } }, // 8h/día
      { userId: 2, workStartTime: '09:00', workEndTime: '13:00', user: { name: 'Beto', avatar: 'b.png' } }, // 4h/día
    ])
    // Semana W10 (2026-03-02..08): 5 días hábiles.
    //   Ana disponible = 5×8h = 40h. Beto disponible = 5×4h = 20h. Total = 60h.
    //   Ana trabaja 20h, Beto trabaja 5h → total 25h. Ocupación = 25/60 ≈ 42%.
    prisma.task.findMany.mockResolvedValue([
      { userId: 1, completedAt: '2026-03-02T12:00:00-03:00', startedAt: '2026-03-02T02:00:00-03:00', pausedMinutes: 0, minutesOverride: 1200 }, // 20h (override)
      { userId: 2, completedAt: '2026-03-03T12:00:00-03:00', startedAt: '2026-03-03T07:00:00-03:00', pausedMinutes: 0, minutesOverride: 300 },  // 5h
    ])
    const out = await computeAutoScorecardYear(1, TZ, 2026, ['ocupacion'])
    const wk = out.ocupacion['2026-W10']
    expect(wk.value).toBe(42) // round(25/60*100)
    // Beto aprovechó 5/20 = 25%, Ana 20/40 = 50% → Beto primero (menos)
    expect(wk.top3[0]).toMatchObject({ userId: 2, util: 25, registeredHours: 5, availableHours: 20 })
    expect(wk.top3[1]).toMatchObject({ userId: 1, util: 50, registeredHours: 20, availableHours: 40 })
  })

  it('descuenta días de licencia de las horas disponibles', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, workStartTime: '09:00', workEndTime: '17:00', user: { name: 'Ana', avatar: 'a.png' } },
    ])
    // Licencia lun+mar de W10 → quedan 3 días hábiles disponibles = 24h.
    prisma.vacationRequest.findMany.mockResolvedValue([
      { userId: 1, startDate: '2026-03-02', endDate: '2026-03-03' },
    ])
    prisma.task.findMany.mockResolvedValue([
      { userId: 1, completedAt: '2026-03-04T12:00:00-03:00', startedAt: '2026-03-04T00:00:00-03:00', pausedMinutes: 0, minutesOverride: 720 }, // 12h
    ])
    const out = await computeAutoScorecardYear(1, TZ, 2026, ['ocupacion'])
    const wk = out.ocupacion['2026-W10']
    expect(wk.top3[0]).toMatchObject({ userId: 1, availableHours: 24, registeredHours: 12, util: 50 })
    expect(wk.value).toBe(50)
  })

  it('ignora a quienes no tienen horario completo cargado', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, workStartTime: '09:00', workEndTime: null, user: { name: 'SinFin', avatar: 'x.png' } },
      { userId: 2, workStartTime: null, workEndTime: null, user: { name: 'SinHorario', avatar: 'y.png' } },
    ])
    prisma.task.findMany.mockResolvedValue([
      { userId: 1, completedAt: '2026-03-02T12:00:00-03:00', startedAt: '2026-03-02T11:00:00-03:00', pausedMinutes: 0, minutesOverride: 60 },
    ])
    const out = await computeAutoScorecardYear(1, TZ, 2026, ['ocupacion'])
    expect(Object.keys(out.ocupacion)).toHaveLength(0) // nadie con jornada completa
  })
})

// Hoy (memoria) = 2026-06-18 → meses cerrados de 2026 = ene..may.
describe('computeAutoScorecardYear — mensuales (a mes vencido)', () => {
  it('delta_horas: ocupación ponderada del mes cerrado, por mes', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, workStartTime: '09:00', workEndTime: '17:00', user: { name: 'Ana', avatar: 'a.png' } }, // 8h/día
    ])
    // Marzo 2026 tiene 22 días hábiles → disponible = 22×8 = 176h. Trabaja 88h → 50%.
    prisma.task.findMany.mockResolvedValue([
      { userId: 1, completedAt: '2026-03-10T12:00:00-03:00', startedAt: '2026-03-10T00:00:00-03:00', pausedMinutes: 0, minutesOverride: 5280 },
    ])
    const out = await computeAutoScorecardYear(1, TZ, 2026, ['delta_horas'])
    const m = out.delta_horas['2026-03']
    expect(m.value).toBe(50)
    expect(m.top3[0]).toMatchObject({ userId: 1, util: 50, registeredHours: 88, availableHours: 176 })
  })

  it('delta_horas: no incluye el mes en curso (junio)', async () => {
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 1, workStartTime: '09:00', workEndTime: '17:00', user: { name: 'Ana', avatar: 'a.png' } },
    ])
    prisma.task.findMany.mockResolvedValue([
      { userId: 1, completedAt: '2026-06-10T12:00:00-03:00', startedAt: '2026-06-10T08:00:00-03:00', pausedMinutes: 0, minutesOverride: 240 },
    ])
    const out = await computeAutoScorecardYear(1, TZ, 2026, ['delta_horas'])
    expect(out.delta_horas['2026-06']).toBeUndefined()
  })

  it('proyectos_nuevos: cuenta altas por mes de creación y lista los nombres', async () => {
    prisma.project.findMany.mockResolvedValue([
      { id: 1, name: 'Cliente A', createdAt: '2026-03-05T10:00:00-03:00' },
      { id: 2, name: 'Cliente B', createdAt: '2026-03-20T10:00:00-03:00' },
      { id: 3, name: 'Cliente C (junio)', createdAt: '2026-06-02T10:00:00-03:00' }, // mes en curso → excluido
    ])
    const out = await computeAutoScorecardYear(1, TZ, 2026, ['proyectos_nuevos'])
    expect(out.proyectos_nuevos['2026-03']).toMatchObject({ value: 2 })
    expect(out.proyectos_nuevos['2026-03'].top3.map(p => p.name)).toEqual(['Cliente A', 'Cliente B'])
    expect(out.proyectos_nuevos['2026-06']).toBeUndefined()
  })

  it('proyectos_perdidos: cuenta bajas por mes de lostAt', async () => {
    prisma.project.findMany.mockResolvedValue([
      { id: 1, name: 'Perdido X', lostAt: '2026-04-10T10:00:00-03:00' },
      { id: 2, name: 'Nunca perdido', lostAt: null },
    ])
    const out = await computeAutoScorecardYear(1, TZ, 2026, ['proyectos_perdidos'])
    expect(out.proyectos_perdidos['2026-04']).toMatchObject({ value: 1 })
    expect(out.proyectos_perdidos['2026-04'].top3[0].name).toBe('Perdido X')
  })

  it('equipo: lee activeMembers del histórico de RRHH por mes', async () => {
    prisma.rrhhMetricSnapshot.findMany.mockResolvedValue([
      { month: '2026-04', value: 7 },
      { month: '2026-05', value: 8 },
    ])
    const out = await computeAutoScorecardYear(1, TZ, 2026, ['equipo'])
    expect(out.equipo).toEqual({ '2026-04': { value: 7 }, '2026-05': { value: 8 } })
  })

  it('mensuales vacías para un año futuro (sin meses cerrados)', async () => {
    const out = await computeAutoScorecardYear(1, TZ, 2027, ['equipo', 'proyectos_nuevos'])
    expect(out.equipo).toEqual({})
    expect(out.proyectos_nuevos).toEqual({})
  })
})
