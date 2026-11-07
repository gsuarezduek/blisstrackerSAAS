/**
 * Calendarios de afuera traídos a BlissTracker: el alta por URL iCal, el refresco
 * del Google ya conectado y la lectura del cache.
 *
 * Lo que se cuida acá: que la URL del ICS nunca salga de vuelta (es la llave del
 * calendario), que nadie toque los calendarios de otra persona, que el título de la
 * agenda ajena no se filtre, y que las reuniones que NOSOTROS empujamos a Google no
 * vuelvan como "externas" y se vean dos veces.
 */
jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  externalCalendar: {
    findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(),
    create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn(),
  },
  externalCalendarEvent: { findMany: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
  googleCalendarConnection: { findUnique: jest.fn() },
  calendarEvent: { findMany: jest.fn() },
  $transaction: jest.fn(ops => Promise.all(ops)),
}))
jest.mock('axios')
jest.mock('../../src/lib/safeUrl', () => ({ assertPublicUrl: jest.fn().mockResolvedValue(undefined) }))
jest.mock('../../src/services/googleCalendarToken.service', () => ({
  getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const axios   = require('axios')
const prisma  = require('../../src/lib/prisma')
const { assertPublicUrl } = require('../../src/lib/safeUrl')
const { decrypt } = require('../../src/lib/encryption')
const app     = require('../../src/app')

const SECRET = process.env.JWT_SECRET
const SLUG = 'bliss'
const WS = 1
const ME = 7
const OTHER = 8

function authHeader(userId = ME) {
  return `Bearer ${jwt.sign({ userId, workspaceId: WS, role: 'member', isSuperAdmin: false, name: 'Test', email: 't@t.com' }, SECRET)}`
}

function req(method, path, userId = ME) {
  return request(app)[method](`/api/calendar${path}`)
    .set('Authorization', authHeader(userId))
    .set('X-Workspace', SLUG)
}

const ICS_BODY = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', 'X-WR-CALNAME:Agenda del estudio',
  'BEGIN:VEVENT',
  'DTSTART;TZID=America/Argentina/Buenos_Aires:20261110T090000',
  'DTEND;TZID=America/Argentina/Buenos_Aires:20261110T100000',
  'UID:uno@x', 'SUMMARY:Clase de inglés',
  'END:VEVENT', 'END:VCALENDAR',
].join('\r\n')

const ICS_URL = 'https://calendar.google.com/calendar/ical/abc/private-secreto/basic.ics'

function mockWorkspace() {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WS, slug: SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]', moduleAccess: null, timezone: 'America/Argentina/Buenos_Aires',
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WS, userId: ME, role: 'member', active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'calendario', enabledGlobally: true, enabledWorkspaceIds: '[]' })
}

function calendar(over = {}) {
  return {
    id: 50, workspaceId: WS, userId: ME, source: 'ics', name: 'Agenda del estudio',
    icsUrl: null, icsHost: 'calendar.google.com', googleCalendarId: null, color: null,
    showDetails: false, active: true, lastSyncAt: null, lastSyncError: null, lastSyncCount: null,
    createdAt: new Date(), updatedAt: new Date(), _count: { events: 1 }, ...over,
  }
}

beforeEach(() => {
  mockWorkspace()
  prisma.googleCalendarConnection.findUnique.mockResolvedValue(null)
  prisma.externalCalendar.findMany.mockResolvedValue([])
  prisma.externalCalendar.count.mockResolvedValue(0)
  prisma.externalCalendarEvent.findMany.mockResolvedValue([])
  prisma.externalCalendarEvent.deleteMany.mockResolvedValue({ count: 0 })
  prisma.externalCalendarEvent.createMany.mockResolvedValue({ count: 0 })
  prisma.calendarEvent.findMany.mockResolvedValue([])
  // Prisma devuelve promesas: el servicio hace `update(...).catch(...)` para que un
  // error al registrar el fallo de sync no tape el error original.
  prisma.externalCalendar.update.mockResolvedValue(calendar())
  axios.get.mockReset()
})

describe('POST /api/calendar/external-calendars — agregar por URL', () => {
  it('guarda la URL CIFRADA y nunca la devuelve', async () => {
    axios.get.mockResolvedValue({ data: ICS_BODY, headers: {} })
    prisma.externalCalendar.create.mockImplementation(({ data }) => Promise.resolve(calendar(data.icsUrl ? { ...data, id: 50 } : data)))
    prisma.externalCalendar.findUnique.mockResolvedValue(calendar())

    const res = await req('post', '/external-calendars').send({ url: ICS_URL })
    expect(res.status).toBe(201)

    const saved = prisma.externalCalendar.create.mock.calls[0][0].data
    expect(saved.icsUrl).not.toContain('private-secreto')
    expect(decrypt(saved.icsUrl)).toBe(ICS_URL)
    expect(saved.icsHost).toBe('calendar.google.com')
    expect(JSON.stringify(res.body)).not.toContain('private-secreto')
    expect(res.body.icsHost).toBe('calendar.google.com')
  })

  it('toma el nombre que declara el archivo si no le dan uno', async () => {
    axios.get.mockResolvedValue({ data: ICS_BODY, headers: {} })
    prisma.externalCalendar.create.mockResolvedValue(calendar())
    prisma.externalCalendar.findUnique.mockResolvedValue(calendar())

    await req('post', '/external-calendars').send({ url: ICS_URL })
    expect(prisma.externalCalendar.create.mock.calls[0][0].data.name).toBe('Agenda del estudio')
  })

  it('acepta webcal:// (así lo ofrecen Google y Apple)', async () => {
    axios.get.mockResolvedValue({ data: ICS_BODY, headers: {} })
    prisma.externalCalendar.create.mockResolvedValue(calendar())
    prisma.externalCalendar.findUnique.mockResolvedValue(calendar())

    const res = await req('post', '/external-calendars').send({ url: 'webcal://calendar.google.com/calendar/ical/abc/basic.ics' })
    expect(res.status).toBe(201)
    expect(decrypt(prisma.externalCalendar.create.mock.calls[0][0].data.icsUrl)).toMatch(/^https:\/\//)
  })

  it('carga los eventos en el momento, sin esperar al cron', async () => {
    axios.get.mockResolvedValue({ data: ICS_BODY, headers: {} })
    prisma.externalCalendar.create.mockResolvedValue(calendar({ icsUrl: require('../../src/lib/encryption').encrypt(ICS_URL) }))
    prisma.externalCalendar.findUnique.mockResolvedValue(calendar())

    await req('post', '/external-calendars').send({ url: ICS_URL })
    const rows = prisma.externalCalendarEvent.createMany.mock.calls[0][0].data
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'Clase de inglés', date: '2026-11-10', startTime: '09:00', calendarId: 50, userId: ME })
  })

  it('una URL que no devuelve un calendario falla en el momento, no en silencio', async () => {
    axios.get.mockResolvedValue({ data: '<html>no soy un ics</html>', headers: {} })
    const res = await req('post', '/external-calendars').send({ url: ICS_URL })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('ICS_UNREADABLE')
    expect(prisma.externalCalendar.create).not.toHaveBeenCalled()
  })

  it('rechaza una URL que no es http(s)', async () => {
    const res = await req('post', '/external-calendars').send({ url: 'file:///etc/passwd' })
    expect(res.status).toBe(400)
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('valida la URL contra la red interna antes de bajarla (SSRF)', async () => {
    assertPublicUrl.mockRejectedValueOnce(new Error('apunta a una IP privada'))
    const res = await req('post', '/external-calendars').send({ url: 'http://169.254.169.254/latest/meta-data/' })
    expect(res.status).toBe(400)
    expect(prisma.externalCalendar.create).not.toHaveBeenCalled()
  })

  it('topea cuántos se pueden agregar', async () => {
    prisma.externalCalendar.count.mockResolvedValue(10)
    const res = await req('post', '/external-calendars').send({ url: ICS_URL })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/máximo/i)
  })
})

describe('Son de cada persona, no del workspace', () => {
  it('no se puede editar el calendario de otro', async () => {
    prisma.externalCalendar.findFirst.mockResolvedValue(null) // la query ya filtra por userId
    const res = await req('patch', '/external-calendars/50').send({ name: 'Mío ahora' })
    expect(res.status).toBe(404)
    expect(prisma.externalCalendar.update).not.toHaveBeenCalled()
  })

  it('la lista se busca siempre scopeada a quien pregunta', async () => {
    await req('get', '/external-calendars')
    expect(prisma.externalCalendar.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: WS, userId: ME },
    }))
  })

  it('borrar saca la suscripción (el cache se va en cascada)', async () => {
    prisma.externalCalendar.findFirst.mockResolvedValue(calendar())
    prisma.externalCalendar.delete.mockResolvedValue(calendar())
    const res = await req('delete', '/external-calendars/50')
    expect(res.status).toBe(200)
    expect(prisma.externalCalendar.delete).toHaveBeenCalledWith({ where: { id: 50 } })
  })
})

describe('GET /api/calendar/external-events', () => {
  function cachedRow(over = {}) {
    return {
      id: 1, userId: ME, calendarId: 50, title: 'Clase de inglés',
      date: '2026-11-10', endDate: '2026-11-10', startTime: '09:00', durationMins: 60,
      allDay: false, busy: true, location: 'Zoom', url: 'https://x',
      calendar: { id: 50, name: 'Agenda del estudio', color: null, source: 'ics', showDetails: false },
      ...over,
    }
  }

  it('devuelve lo propio con título', async () => {
    prisma.externalCalendarEvent.findMany.mockResolvedValue([cachedRow()])
    const res = await req('get', '/external-events?from=2026-11-01&to=2026-11-30')
    expect(res.status).toBe(200)
    expect(res.body[0]).toMatchObject({ title: 'Clase de inglés', kind: 'external', startTime: '09:00' })
  })

  it('el título de la agenda de OTRA persona no se filtra', async () => {
    prisma.externalCalendarEvent.findMany.mockResolvedValue([cachedRow({ userId: OTHER })])
    const res = await req('get', `/external-events?from=2026-11-01&to=2026-11-30&userIds=${OTHER}`)
    expect(res.body[0].title).toBe('Ocupado')
    expect(res.body[0].location).toBeNull()
    expect(res.body[0].url).toBeNull()
  })

  it('salvo que esa persona lo haya habilitado', async () => {
    prisma.externalCalendarEvent.findMany.mockResolvedValue([
      cachedRow({ userId: OTHER, calendar: { id: 50, name: 'Google', color: null, source: 'google', showDetails: true } }),
    ])
    const res = await req('get', `/external-events?from=2026-11-01&to=2026-11-30&userIds=${OTHER}`)
    expect(res.body[0].title).toBe('Clase de inglés')
  })

  it('lo propio trae los detalles para poder leer de qué era', async () => {
    prisma.externalCalendarEvent.findMany.mockResolvedValue([cachedRow({
      description: 'Repasamos los números', meetLink: 'https://meet.google.com/x', organizer: 'Jefa',
      attendees: [{ name: 'Ana', email: 'ana@x.com', status: 'accepted' }], attendeeCount: 1,
    })])
    const res = await req('get', '/external-events?from=2026-11-01&to=2026-11-30')
    expect(res.body[0]).toMatchObject({
      description: 'Repasamos los números', meetLink: 'https://meet.google.com/x',
      organizer: 'Jefa', canSeeDetail: true,
      attendees: [{ name: 'Ana', email: 'ana@x.com', status: 'accepted' }], attendeeCount: 1,
    })
  })

  it('de la agenda ajena NUNCA sale el cuerpo de la invitación, ni con showDetails', async () => {
    // "El equipo ve de qué se trata" no es "el equipo ve todo el contenido": la
    // descripción es justo donde viven los links de acceso y las notas personales.
    prisma.externalCalendarEvent.findMany.mockResolvedValue([cachedRow({
      userId: OTHER, description: 'Link de acceso: https://meet.google.com/privado', meetLink: 'https://meet.google.com/privado',
      organizer: 'Jefa', attendees: [{ email: 'privado@x.com', status: 'accepted' }], attendeeCount: 1,
      calendar: { id: 50, name: 'Google', color: null, source: 'google', showDetails: true },
    })])
    const res = await req('get', `/external-events?from=2026-11-01&to=2026-11-30&userIds=${OTHER}`)
    expect(res.body[0].title).toBe('Clase de inglés')   // de qué se trata, sí
    expect(res.body[0].organizer).toBe('Jefa')
    expect(res.body[0].description).toBeNull()          // el contenido, no
    expect(res.body[0].meetLink).toBeNull()
    expect(res.body[0].attendees).toBeNull()            // ni quiénes van
    expect(JSON.stringify(res.body)).not.toContain('privado')
  })

  it('exige un rango de fechas válido', async () => {
    const res = await req('get', '/external-events?from=noviembre&to=2026-11-30')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/calendar/external-events/:id — abrir un evento de la grilla', () => {
  function cachedRow(over = {}) {
    return {
      id: 1, userId: ME, calendarId: 50, title: 'Clase de inglés',
      date: '2026-11-10', endDate: '2026-11-10', startTime: '09:00', durationMins: 60,
      allDay: false, busy: true, location: 'Zoom', url: 'https://x',
      description: 'Traer el material', meetLink: null, organizer: null,
      calendar: { id: 50, name: 'Agenda del estudio', color: null, source: 'ics', showDetails: false },
      ...over,
    }
  }

  it('devuelve el detalle del evento propio', async () => {
    prisma.externalCalendarEvent.findFirst.mockResolvedValue(cachedRow())
    const res = await req('get', '/external-events/1')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ title: 'Clase de inglés', description: 'Traer el material', canSeeDetail: true })
  })

  it('el de otra persona sin showDetails es solo "Ocupado"', async () => {
    prisma.externalCalendarEvent.findFirst.mockResolvedValue(cachedRow({ userId: OTHER }))
    const res = await req('get', '/external-events/1')
    expect(res.body).toMatchObject({ title: 'Ocupado', description: null, location: null, canSeeDetail: false })
  })

  it('404 si no existe en este workspace', async () => {
    prisma.externalCalendarEvent.findFirst.mockResolvedValue(null)
    expect((await req('get', '/external-events/999')).status).toBe(404)
  })
})

describe('Refresco del Google ya conectado', () => {
  it('las reuniones que empujamos a Google no vuelven como externas', async () => {
    prisma.googleCalendarConnection.findUnique.mockResolvedValue({
      id: 1, userId: ME, workspaceId: WS, accountEmail: 'yo@x.com',
      accessToken: null, refreshToken: null, expiresAt: new Date(Date.now() + 3600_000),
    })
    prisma.externalCalendar.findFirst.mockResolvedValue(null)
    prisma.externalCalendar.create.mockResolvedValue(calendar({
      id: 60, source: 'google', googleCalendarId: 'primary', name: 'yo@x.com', showDetails: true, icsHost: null,
    }))
    prisma.externalCalendar.findMany.mockResolvedValue([calendar({
      id: 60, source: 'google', googleCalendarId: 'primary', lastSyncAt: null, icsHost: null,
    })])
    // Una reunión agendada EN BlissTracker, ya espejada en Google.
    prisma.calendarEvent.findMany.mockResolvedValue([{ googleEventId: 'espejo-de-bliss' }])
    axios.get.mockResolvedValue({
      data: {
        items: [
          { id: 'espejo-de-bliss', summary: 'Kickoff (agendada en BlissTracker)', start: { dateTime: '2026-11-10T15:00:00-03:00' }, end: { dateTime: '2026-11-10T16:00:00-03:00' } },
          { id: 'solo-en-google', summary: 'Dentista', start: { dateTime: '2026-11-10T09:00:00-03:00' }, end: { dateTime: '2026-11-10T10:00:00-03:00' } },
        ],
      },
    })

    await req('get', '/external-events?from=2026-11-01&to=2026-11-30')

    const rows = prisma.externalCalendarEvent.createMany.mock.calls[0][0].data
    expect(rows.map(r => r.externalId)).toEqual(['solo-en-google'])
  })

  it('tampoco vuelven las reuniones que organizó OTRA persona y a mí me invitaron', async () => {
    // Al empujar, los participantes viajan como attendees: Google pone el evento
    // también en MI calendario, con el mismo id. Si el filtro mirara solo lo que yo
    // organicé, los invitados —la mayoría de los participantes— verían todo doble.
    prisma.googleCalendarConnection.findUnique.mockResolvedValue({
      id: 1, userId: ME, workspaceId: WS, accountEmail: 'yo@x.com',
      accessToken: null, refreshToken: null, expiresAt: new Date(Date.now() + 3600_000),
    })
    prisma.externalCalendar.findFirst.mockResolvedValue(calendar({ id: 60, source: 'google', lastSyncAt: null }))
    prisma.externalCalendar.findMany.mockResolvedValue([calendar({ id: 60, source: 'google', lastSyncAt: null })])
    prisma.calendarEvent.findMany.mockResolvedValue([{ googleEventId: 'reunion-de-otro' }])
    axios.get.mockResolvedValue({
      data: {
        items: [{
          id: 'reunion-de-otro', summary: 'Reunión cierre semanal',
          start: { dateTime: '2026-11-10T15:00:00-03:00' }, end: { dateTime: '2026-11-10T16:00:00-03:00' },
          attendees: [{ self: true, responseStatus: 'accepted' }, { email: 'jefe@x.com', organizer: true }],
        }],
      },
    })

    await req('get', '/external-events?from=2026-11-01&to=2026-11-30')

    expect(prisma.externalCalendarEvent.createMany.mock.calls[0][0].data).toEqual([])
    // Y la búsqueda no se acota al organizador.
    expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ organizerId: expect.anything() }),
    }))
  })

  it('da de alta sola la fila del Google que ya estaba conectado', async () => {
    prisma.googleCalendarConnection.findUnique.mockResolvedValue({
      id: 1, userId: ME, workspaceId: WS, accountEmail: 'yo@x.com', accessToken: null, refreshToken: null, expiresAt: null,
    })
    prisma.externalCalendar.findFirst.mockResolvedValue(null)
    prisma.externalCalendar.create.mockResolvedValue(calendar({ id: 60, source: 'google' }))

    await req('get', '/external-calendars')
    expect(prisma.externalCalendar.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ source: 'google', googleCalendarId: 'primary', showDetails: true }),
    }))
  })

  it('si Google falla, el error queda registrado y la respuesta no se cae', async () => {
    prisma.googleCalendarConnection.findUnique.mockResolvedValue({
      id: 1, userId: ME, workspaceId: WS, accountEmail: 'yo@x.com', accessToken: null, refreshToken: null, expiresAt: new Date(Date.now() + 3600_000),
    })
    prisma.externalCalendar.findFirst.mockResolvedValue(calendar({ id: 60, source: 'google', lastSyncAt: null }))
    prisma.externalCalendar.findMany.mockResolvedValue([calendar({ id: 60, source: 'google', lastSyncAt: null })])
    axios.get.mockRejectedValue(Object.assign(new Error('Request failed with status code 403'), {
      response: { data: { error: { message: 'Insufficient permission' } } },
    }))

    const res = await req('get', '/external-events?from=2026-11-01&to=2026-11-30')
    expect(res.status).toBe(200)
    expect(prisma.externalCalendar.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastSyncError: 'Insufficient permission' }),
    }))
  })
})

describe('El cache es exactamente la ventana', () => {
  it('cada refresco reemplaza TODAS las filas del calendario, no solo el rango traído', async () => {
    // Si solo se borrara el rango que se vuelve a pedir, una fila vieja de afuera de
    // la ventana no la tocaría nunca nadie: ni se refresca, ni se borra, ni se
    // arregla si quedó duplicada.
    axios.get.mockResolvedValue({ data: ICS_BODY, headers: {} })
    prisma.externalCalendar.create.mockResolvedValue(calendar({ icsUrl: require('../../src/lib/encryption').encrypt(ICS_URL) }))
    prisma.externalCalendar.findUnique.mockResolvedValue(calendar())

    await req('post', '/external-calendars').send({ url: ICS_URL })

    expect(prisma.externalCalendarEvent.deleteMany).toHaveBeenCalledWith({ where: { calendarId: 50 } })
  })
})

describe('Nadie espera a la fuente', () => {
  it('si Google tarda más que el deadline, se responde con el cache y el refresco sigue solo', async () => {
    jest.useFakeTimers()
    try {
      const { syncIfStale, INTERACTIVE_DEADLINE_MS } = require('../../src/services/externalCalendar.service')
      prisma.googleCalendarConnection.findUnique.mockResolvedValue({
        id: 1, userId: ME, workspaceId: WS, accountEmail: 'yo@x.com',
        accessToken: null, refreshToken: null, expiresAt: new Date(Date.now() + 3600_000),
      })
      prisma.externalCalendar.findFirst.mockResolvedValue(calendar({ id: 60, source: 'google', lastSyncAt: null }))
      prisma.externalCalendar.findMany.mockResolvedValue([calendar({ id: 60, source: 'google', lastSyncAt: null })])
      // Google que nunca contesta.
      axios.get.mockReturnValue(new Promise(() => {}))

      const promise = syncIfStale({ workspaceId: WS, userId: ME, tz: 'America/Argentina/Buenos_Aires' })
      await jest.advanceTimersByTimeAsync(INTERACTIVE_DEADLINE_MS + 10)
      await expect(promise).resolves.toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })
})
