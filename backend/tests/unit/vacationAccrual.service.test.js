jest.mock('../../src/lib/prisma', () => ({
  workspace:           { findMany: jest.fn() },
  workspaceMember:     { findMany: jest.fn(), update: jest.fn() },
  vacationAdjustment:  { create: jest.fn() },
  $transaction:        jest.fn((arr) => Promise.all(arr)),
}))

const prisma = require('../../src/lib/prisma')
const { runVacationAccrualCheck, addMonthsClamped, nextAccrualDate } = require('../../src/services/vacationAccrual.service')

describe('addMonthsClamped', () => {
  test('suma meses en un caso simple', () => {
    const d = addMonthsClamped(new Date('2026-03-15T00:00:00Z'), 1)
    expect(d.toISOString().slice(0, 10)).toBe('2026-04-15')
  })
  test('clampea fin de mes: 31/ene + 1 mes → 28/feb (2026 no es bisiesto)', () => {
    const d = addMonthsClamped(new Date('2026-01-31T00:00:00Z'), 1)
    expect(d.toISOString().slice(0, 10)).toBe('2026-02-28')
  })
  test('clampea fin de mes en año bisiesto: 31/ene + 1 mes → 29/feb (2028)', () => {
    const d = addMonthsClamped(new Date('2028-01-31T00:00:00Z'), 1)
    expect(d.toISOString().slice(0, 10)).toBe('2028-02-29')
  })
  test('suma trimestral sin desborde', () => {
    const d = addMonthsClamped(new Date('2026-01-31T00:00:00Z'), 3)
    expect(d.toISOString().slice(0, 10)).toBe('2026-04-30')
  })
})

describe('nextAccrualDate', () => {
  test('primera ocurrencia después de la activación, mensual', () => {
    const anchor = new Date('2026-01-10T00:00:00Z')     // se unió el 10/ene
    const notBefore = new Date('2026-01-15T00:00:00Z')  // activación 15/ene
    const d = nextAccrualDate(anchor, 1, notBefore)
    // 10/feb es el primer aniversario mensual que cae en o después del 15/ene
    expect(d.toISOString().slice(0, 10)).toBe('2026-02-10')
  })
  test('salta varios períodos si la activación es muy posterior al ingreso', () => {
    const anchor = new Date('2020-01-10T00:00:00Z')
    const notBefore = new Date('2026-06-01T00:00:00Z')
    const d = nextAccrualDate(anchor, 12, notBefore) // regla anual
    // El último aniversario (10/ene/2026) ya pasó respecto a la activación (jun/2026);
    // el próximo que cae en o después es el del año siguiente.
    expect(d.getUTCFullYear()).toBe(2027)
    expect(d.toISOString().slice(5, 10)).toBe('01-10')
  })
})

describe('runVacationAccrualCheck', () => {
  const now = new Date('2026-06-15T00:00:00Z')

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers().setSystemTime(now.getTime())
  })
  afterEach(() => jest.useRealTimers())

  test('primera corrida (sin nextVacationAccrualAt): calcula la fecha, no acumula todavía', async () => {
    prisma.workspace.findMany.mockResolvedValue([
      { id: 1, vacationAccrualDays: 1, vacationAccrualIntervalMonths: 1, vacationAccrualActivatedAt: new Date('2026-06-01T00:00:00Z') },
    ])
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 10, joinedAt: new Date('2026-01-05T00:00:00Z'), vacationDays: 5, nextVacationAccrualAt: null },
    ])

    await runVacationAccrualCheck()

    expect(prisma.workspaceMember.update).toHaveBeenCalledTimes(1)
    const call = prisma.workspaceMember.update.mock.calls[0][0]
    expect(call.data.vacationDays).toBeUndefined() // no toca el saldo en la primera corrida
    // Ancla día 05, activación 01/jun → el 05/jun ya cae en o después de la activación.
    expect(call.data.nextVacationAccrualAt.toISOString().slice(0, 10)).toBe('2026-06-05')
    expect(prisma.vacationAdjustment.create).not.toHaveBeenCalled()
  })

  test('acumula un período vencido y avanza la próxima fecha', async () => {
    prisma.workspace.findMany.mockResolvedValue([
      { id: 1, vacationAccrualDays: 2, vacationAccrualIntervalMonths: 1, vacationAccrualActivatedAt: new Date('2026-01-01T00:00:00Z') },
    ])
    prisma.workspaceMember.findMany.mockResolvedValue([
      { userId: 10, joinedAt: new Date('2026-01-05T00:00:00Z'), vacationDays: 5, nextVacationAccrualAt: new Date('2026-06-05T00:00:00Z') },
    ])

    await runVacationAccrualCheck()

    expect(prisma.vacationAdjustment.create).toHaveBeenCalledTimes(1)
    const adjData = prisma.vacationAdjustment.create.mock.calls[0][0].data
    expect(adjData).toMatchObject({ workspaceId: 1, userId: 10, adminId: null, prevDays: 5, newDays: 7 })

    const updateData = prisma.workspaceMember.update.mock.calls[0][0].data
    expect(updateData.vacationDays).toBe(7)
    expect(updateData.nextVacationAccrualAt.toISOString().slice(0, 10)).toBe('2026-07-05')
  })

  test('recupera varios períodos atrasados si el cron estuvo caído', async () => {
    prisma.workspace.findMany.mockResolvedValue([
      { id: 1, vacationAccrualDays: 1, vacationAccrualIntervalMonths: 1, vacationAccrualActivatedAt: new Date('2026-01-01T00:00:00Z') },
    ])
    prisma.workspaceMember.findMany.mockResolvedValue([
      // Atrasado desde marzo: mar/abr/may/jun (05/jun también ya pasó respecto de "hoy" = 15/jun/2026) → 4 períodos
      { userId: 10, joinedAt: new Date('2026-01-05T00:00:00Z'), vacationDays: 0, nextVacationAccrualAt: new Date('2026-03-05T00:00:00Z') },
    ])

    await runVacationAccrualCheck()

    expect(prisma.vacationAdjustment.create).toHaveBeenCalledTimes(4)
    const lastUpdate = prisma.workspaceMember.update.mock.calls.at(-1)[0].data
    expect(lastUpdate.vacationDays).toBe(4)
    expect(lastUpdate.nextVacationAccrualAt.toISOString().slice(0, 10)).toBe('2026-07-05')
  })

  test('workspaces sin vacationAccrualEnabled no se consultan (filtro en la query)', async () => {
    prisma.workspace.findMany.mockResolvedValue([])
    await runVacationAccrualCheck()
    expect(prisma.workspace.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ vacationAccrualEnabled: true }),
    }))
    expect(prisma.workspaceMember.findMany).not.toHaveBeenCalled()
  })
})
