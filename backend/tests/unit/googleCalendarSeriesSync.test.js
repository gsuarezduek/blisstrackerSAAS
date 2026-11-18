/**
 * El bug: cada ocurrencia de una reunión recurrente se empujaba a Google como un
 * evento suelto con sendUpdates=all, y como las ocurrencias se materializan cuando
 * alguien abre un rango del Calendario, abrir diciembre le mandaba a cada invitado
 * un mail por fecha. Acá se cuida que la serie viaje como UN evento recurrente: una
 * invitación al principio, y las ocurrencias solo se VINCULAN a sus instancias.
 */
jest.mock('../../src/lib/prisma', () => ({
  calendarEvent: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  calendarEventRecurrence: { findUnique: jest.fn(), update: jest.fn() },
  calendarEventException: { findMany: jest.fn() },
  googleCalendarConnection: { findUnique: jest.fn() },
  user: { findMany: jest.fn() },
  workspace: { findUnique: jest.fn() },
}))
jest.mock('axios')
jest.mock('../../src/services/googleCalendarToken.service', () => ({
  getValidAccessToken: jest.fn().mockResolvedValue('tok'),
}))

const axios = require('axios')
const prisma = require('../../src/lib/prisma')
const sync = require('../../src/services/googleCalendarSync.service')

const TZ = 'America/Argentina/Buenos_Aires'
const REC = {
  id: 9, workspaceId: 1, organizerId: 1, title: 'Reunión seguimiento', notes: null, meetLink: null,
  startTime: '13:00', durationMins: 30, participantIds: '[2]', frequency: 'weekly', weekdays: '[3]',
  startDate: '2026-12-09', endDate: null, active: true, googleEventId: null, googleStartDate: null,
  workspace: { timezone: TZ },
}
const DATES = ['2026-12-09', '2026-12-16', '2026-12-23', '2026-12-30']

let recState
let occurrences

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers({ now: Date.parse('2026-12-01T12:00:00Z'), doNotFake: ['setImmediate', 'nextTick'] })
  recState = { ...REC }
  occurrences = DATES.map((date, i) => ({ id: 100 + i, date, recurrenceId: 9, organizerId: 1, workspaceId: 1, googleEventId: null }))

  prisma.googleCalendarConnection.findUnique.mockResolvedValue({ status: 'active' })
  prisma.calendarEventRecurrence.findUnique.mockImplementation(async () => ({ ...recState }))
  prisma.calendarEventRecurrence.update.mockImplementation(async ({ data }) => { Object.assign(recState, data); return recState })
  prisma.calendarEvent.findUnique.mockImplementation(async ({ where }) => occurrences.find(o => o.id === where.id))
  prisma.calendarEvent.findFirst.mockResolvedValue(null)
  prisma.calendarEvent.findMany.mockImplementation(async ({ where }) => occurrences.filter(o =>
    (typeof where.date === 'string' ? o.date === where.date : o.date >= where.date.gte)
    && (where.googleEventId?.not !== null || o.googleEventId != null)))
  prisma.calendarEvent.update.mockImplementation(async ({ where, data }) => Object.assign(occurrences.find(o => o.id === where.id), data))
  prisma.calendarEventException.findMany.mockResolvedValue([])
  prisma.user.findMany.mockResolvedValue([{ id: 2, email: 'gaston@bliss.ar' }])

  axios.post.mockResolvedValue({ data: { id: 'master1' } })
  axios.get.mockResolvedValue({ data: { items: DATES.map(d => ({
    id: `master1_${d.replace(/-/g, '')}T160000Z`,
    originalStartTime: { dateTime: `${d}T13:00:00-03:00` },
  })) } })
  axios.patch.mockResolvedValue({ data: {} })
  axios.delete.mockResolvedValue({ data: {} })
})

afterEach(() => jest.useRealTimers())

it('materializar 4 ocurrencias en paralelo crea UN evento recurrente (una invitación) y vincula las 4', async () => {
  await Promise.all(occurrences.map(o => sync.syncOccurrence(o.id)))

  expect(axios.post).toHaveBeenCalledTimes(1)
  const [url, payload] = axios.post.mock.calls[0]
  expect(url).toContain('sendUpdates=all')
  expect(payload.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=WE'])
  expect(payload.start).toEqual({ dateTime: '2026-12-09T13:00:00', timeZone: TZ })
  expect(payload.attendees).toEqual([{ email: 'gaston@bliss.ar' }])
  expect(recState).toMatchObject({ googleEventId: 'master1', googleStartDate: '2026-12-09' })
  expect(occurrences.map(o => o.googleEventId)).toEqual(DATES.map(d => `master1_${d.replace(/-/g, '')}T160000Z`))
  // Vincular no escribe nada en Google.
  expect(axios.patch).not.toHaveBeenCalled()
})

it('una ocurrencia nueva de una serie que ya está en Google solo se vincula: no manda nada', async () => {
  Object.assign(recState, { googleEventId: 'master1', googleStartDate: '2026-12-09' })
  await sync.syncOccurrence(103)
  expect(axios.post).not.toHaveBeenCalled()
  expect(axios.patch).not.toHaveBeenCalled()
  expect(occurrences[3].googleEventId).toBe('master1_20261230T160000Z')
})

it('una serie con ocurrencias ya empujadas sueltas arranca el recurrente DESPUÉS de la última (no las duplica)', async () => {
  prisma.calendarEvent.findFirst.mockResolvedValue({ date: '2026-12-16' })
  await sync.syncOccurrence(103)
  expect(axios.post).toHaveBeenCalledTimes(1)
  expect(axios.post.mock.calls[0][1].start.dateTime).toBe('2026-12-23T13:00:00')
  expect(recState.googleStartDate).toBe('2026-12-23')
})

it('no empuja reuniones pasadas: el recurrente arranca hoy en adelante', async () => {
  jest.setSystemTime(Date.parse('2026-12-20T12:00:00Z'))
  await sync.syncOccurrence(100)
  expect(axios.post.mock.calls[0][1].start.dateTime).toBe('2026-12-23T13:00:00')
})

it('sin Google conectado no hace nada', async () => {
  prisma.googleCalendarConnection.findUnique.mockResolvedValue(null)
  await sync.syncOccurrence(100)
  expect(axios.post).not.toHaveBeenCalled()
  expect(axios.get).not.toHaveBeenCalled()
})

it('editar la serie desde su arranque es UN patch al evento recurrente', async () => {
  Object.assign(recState, { googleEventId: 'master1', googleStartDate: '2026-12-09', title: 'Nuevo título' })
  await sync.updateSeries(9, '2026-12-09')
  expect(axios.patch).toHaveBeenCalledTimes(1)
  expect(axios.patch.mock.calls[0][0]).toContain('/events/master1?sendUpdates=all')
  expect(axios.patch.mock.calls[0][1]).toMatchObject({ summary: 'Nuevo título', recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=WE'] })
  expect(axios.post).not.toHaveBeenCalled()
})

it('editar "esta y las siguientes" a mitad de serie corta el recurrente y crea otro (2 cambios, no N)', async () => {
  Object.assign(recState, { googleEventId: 'master1', googleStartDate: '2026-12-09' })
  axios.post.mockResolvedValue({ data: { id: 'master2' } })
  axios.get.mockResolvedValue({ data: { items: ['2026-12-23', '2026-12-30'].map(d => ({
    id: `master2_${d}`, originalStartTime: { dateTime: `${d}T13:00:00-03:00` },
  })) } })

  await sync.updateSeries(9, '2026-12-23')

  expect(axios.patch).toHaveBeenCalledTimes(1)
  expect(axios.patch.mock.calls[0][1]).toEqual({ recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20261223T025959Z'] })
  expect(axios.post).toHaveBeenCalledTimes(1)
  expect(axios.post.mock.calls[0][1].start.dateTime).toBe('2026-12-23T13:00:00')
  expect(recState).toMatchObject({ googleEventId: 'master2', googleStartDate: '2026-12-23' })
})

it('cancelar la serie desde su arranque borra el evento recurrente (una cancelación)', async () => {
  const rec = { ...REC, googleEventId: 'master1', googleStartDate: '2026-12-09' }
  const deleted = occurrences.map(o => ({ ...o, googleEventId: `master1_${o.date}` }))
  await sync.endSeries(rec, '2026-12-09', deleted)
  expect(axios.delete).toHaveBeenCalledTimes(1)
  expect(axios.delete.mock.calls[0][0]).toContain('/events/master1?sendUpdates=all')
})

it('cancelar "esta y las siguientes" a mitad de serie le pone UNTIL al recurrente (un cambio)', async () => {
  const rec = { ...REC, googleEventId: 'master1', googleStartDate: '2026-12-09' }
  prisma.workspace.findUnique.mockResolvedValue({ timezone: TZ })
  const deleted = occurrences.slice(2).map(o => ({ ...o, googleEventId: `master1_${o.date}` }))
  await sync.endSeries(rec, '2026-12-23', deleted)
  expect(axios.delete).not.toHaveBeenCalled()
  expect(axios.patch).toHaveBeenCalledTimes(1)
  expect(axios.patch.mock.calls[0][1]).toEqual({ recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20261223T025959Z'] })
})

it('las ocurrencias que ya se habían empujado sueltas se siguen cancelando una por una', async () => {
  const rec = { ...REC }
  const deleted = [{ ...occurrences[0], googleEventId: 'suelto-1' }, { ...occurrences[1], googleEventId: null }]
  await sync.endSeries(rec, '2026-12-09', deleted)
  expect(axios.delete).toHaveBeenCalledTimes(1)
  expect(axios.delete.mock.calls[0][0]).toContain('/events/suelto-1?')
})
