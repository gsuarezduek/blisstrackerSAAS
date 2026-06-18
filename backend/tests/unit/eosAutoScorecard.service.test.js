jest.mock('../../src/lib/prisma', () => ({
  workspace:        { findUnique: jest.fn() },
  workspaceMember:  { findMany: jest.fn() },
  userLogin:        { findMany: jest.fn() },
  vacationRequest:  { findMany: jest.fn() },
  task:             { findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { computeAutoScorecardYear, isoWeekPeriodOf } = require('../../src/services/eosAutoScorecard.service')

const TZ = 'America/Argentina/Buenos_Aires' // UTC-3

function resetAll() {
  prisma.workspace.findUnique.mockReset()
  prisma.workspaceMember.findMany.mockReset()
  prisma.userLogin.findMany.mockReset()
  prisma.vacationRequest.findMany.mockReset()
  prisma.task.findMany.mockReset()
  // defaults
  prisma.workspace.findUnique.mockResolvedValue({ attendanceTrackingEnabled: true, lateToleranceMins: 0 })
  prisma.workspaceMember.findMany.mockResolvedValue([])
  prisma.userLogin.findMany.mockResolvedValue([])
  prisma.vacationRequest.findMany.mockResolvedValue([])
  prisma.task.findMany.mockResolvedValue([])
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
