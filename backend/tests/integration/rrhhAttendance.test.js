jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn(), findMany: jest.fn() },
  workDay:         { findMany: jest.fn() },
  vacationRequest: { findMany: jest.fn() },
  userLogin:       { findMany: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET
const SLUG = 'bliss'
const WS = 1

const token = (role = 'admin') => `Bearer ${jwt.sign(
  { userId: 1, workspaceId: WS, role, isSuperAdmin: false, name: 'Admin', email: 'admin@bliss.ar' }, SECRET)}`

// Equipo de 2 con horario 09:00–18:00. El mes de prueba está cerrado (2026-09)
// para que el recorte "hasta hoy" no mueva el rango.
const MEMBERS = [
  { userId: 1, workStartTime: '09:00', workEndTime: '18:00' },
  { userId: 2, workStartTime: '09:00', workEndTime: '18:00' },
]

// Dos días laborables: los dos se loguearon (>50% del equipo). Beto llega 09:40
// el segundo día (tarde, tolerancia 0) y Ana no abre jornada ese día (ausencia
// sin aviso, porque no tiene licencia que la justifique).
const DAY1 = '2026-09-07', DAY2 = '2026-09-08'
const at = (day, hhmm) => new Date(`${day}T${hhmm}:00-03:00`)

function mockBase() {
  prisma.workspace.findUnique.mockImplementation(({ select }) => Promise.resolve(
    select?.attendanceTrackingEnabled !== undefined
      ? { attendanceTrackingEnabled: true, lateToleranceMins: 0 }
      : { id: WS, slug: SLUG, status: 'active', name: 'Bliss', timezone: 'America/Argentina/Buenos_Aires' },
  ))
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WS, userId: 1, role: 'admin', active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'rrhh', enabledGlobally: true, enabledWorkspaceIds: '[]' })
  prisma.workspaceMember.findMany.mockResolvedValue(MEMBERS)
  prisma.workDay.findMany.mockResolvedValue([
    { userId: 1, date: DAY1 }, { userId: 2, date: DAY1 }, { userId: 2, date: DAY2 },
  ])
  prisma.vacationRequest.findMany.mockResolvedValue([])
  prisma.userLogin.findMany.mockResolvedValue([
    { userId: 1, loginAt: at(DAY1, '09:00') },
    { userId: 2, loginAt: at(DAY1, '08:50') },
    { userId: 1, loginAt: at(DAY2, '08:50') },
    { userId: 2, loginAt: at(DAY2, '09:40') },
  ])
}

const get = (qs = '?month=2026-09') => request(app)
  .get(`/api/admin/rrhh/attendance${qs}`)
  .set('Authorization', token())
  .set('X-Workspace', SLUG)

describe('GET /api/admin/rrhh/attendance', () => {
  beforeEach(() => { jest.clearAllMocks(); mockBase() })

  it('devuelve una fila por persona con el mismo cálculo que Productividad', async () => {
    const res = await get()
    expect(res.status).toBe(200)

    const byId = Object.fromEntries(res.body.rows.map(r => [r.userId, r]))
    // Ana trabajó el día 1 y no el 2 → una ausencia sin aviso; llegó a horario los dos días.
    expect(byId[1]).toMatchObject({ businessDays: 2, daysPresent: 1, absentDays: 1, lateDays: 0 })
    // Beto estuvo los dos días pero llegó 09:40 el segundo.
    expect(byId[2]).toMatchObject({ daysPresent: 2, absentDays: 0, lateDays: 1 })
  })

  it('la hora promedio de llegada sale de las mismas llegadas que las tardanzas', async () => {
    const byId = Object.fromEntries((await get()).body.rows.map(r => [r.userId, r]))
    // Ana: 09:00 y 08:50 → 08:55. Beto: 08:50 y 09:40 → 09:15.
    expect(byId[1]).toMatchObject({ arrivalDays: 2, avgArrivalMins: 535 })
    expect(byId[2]).toMatchObject({ arrivalDays: 2, avgArrivalMins: 555 })
  })

  it('el resumen del mes se arma con esas mismas filas', async () => {
    const { summary } = (await get()).body
    // 4 llegadas, 1 tarde → 75% de puntualidad.
    expect(summary).toMatchObject({ arrivalDays: 4, lateDays: 1, punctualityPct: 75, absentDays: 1, leaveDays: 0 })
  })

  it('rechaza un mes mal formado', async () => {
    expect((await get('?month=2026-13')).status).toBe(400)
    expect((await get('?month=septiembre')).status).toBe(400)
  })

  it('pide acceso al módulo RRHH', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WS, userId: 1, role: 'member', active: true })
    const res = await request(app)
      .get('/api/admin/rrhh/attendance?month=2026-09')
      .set('Authorization', token('member'))
      .set('X-Workspace', SLUG)
    expect(res.status).toBe(403)
  })
})
