// Conexión de Google Calendar caída: en producción 3 conexiones caídas dejaban ~1400
// líneas de log en 5 días (el cron reintentaba cada 15 min para siempre) y la
// persona no se enteraba — el error solo se veía dentro de "Mis calendarios", que
// además no tenía botón para reconectar.
//
// Lo que se fija acá:
//  - la transición a caída es atómica y avisa UNA vez (campana + socket);
//  - el 403 "insufficient authentication scopes" se reconoce y marca missing_scope;
//  - una conexión ya caída no vuelve a pegarle a Google;
//  - el cron saltea los calendarios de conexiones caídas;
//  - el callback de OAuth no guarda una conexión sin el permiso del calendario.
jest.mock('../../src/lib/prisma', () => ({
  googleCalendarConnection: { updateMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
  notification:             { create: jest.fn(), updateMany: jest.fn() },
  externalCalendar:         { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  externalCalendarEvent:    { deleteMany: jest.fn(), createMany: jest.fn() },
  calendarEvent:            { findMany: jest.fn().mockResolvedValue([]) },
  calendarEventRecurrence:  { findMany: jest.fn().mockResolvedValue([]) },
  $transaction: jest.fn(ops => Promise.all(ops)),
}))
jest.mock('../../src/lib/socket', () => ({ emitTo: jest.fn() }))
jest.mock('axios')
jest.mock('google-auth-library', () => {
  const getToken = jest.fn()
  const OAuth2Client = jest.fn().mockImplementation(() => ({ getToken, refreshAccessToken: jest.fn() }))
  OAuth2Client.__getToken = getToken
  return { OAuth2Client }
})

const axios  = require('axios')
const prisma = require('../../src/lib/prisma')
const { emitTo } = require('../../src/lib/socket')
const { OAuth2Client } = require('google-auth-library')
const { encrypt } = require('../../src/lib/encryption')
const {
  markNeedsReconnect, isMissingScopeError, getValidAccessToken,
} = require('../../src/services/googleCalendarToken.service')
const { syncAllDue } = require('../../src/services/externalCalendar.service')
const { signState } = require('../../src/lib/oauthState')
const { handleCallback } = require('../../src/controllers/googleCalendarAuth.controller')

const CONN = { id: 7, userId: 3, workspaceId: 1, status: 'active', refreshToken: null, accessToken: null, expiresAt: null }

function scopeError() {
  const err = new Error('Request failed with status code 403')
  err.isAxiosError = true
  err.response = {
    status: 403,
    data: { error: { code: 403, message: 'Request had insufficient authentication scopes.', status: 'PERMISSION_DENIED',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } },
  }
  return err
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

describe('markNeedsReconnect', () => {
  it('pasa la conexión de activa a caída y le avisa a su dueño una vez', async () => {
    prisma.googleCalendarConnection.updateMany.mockResolvedValue({ count: 1 })

    await markNeedsReconnect(CONN, 'missing_scope')

    expect(prisma.googleCalendarConnection.updateMany).toHaveBeenCalledWith({
      where: { id: 7, status: 'active' }, data: { status: 'missing_scope' },
    })
    expect(prisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 3, workspaceId: 1, type: 'CALENDAR_CONNECTION', message: expect.stringMatching(/sin permiso/),
    }) })
    expect(emitTo).toHaveBeenCalledWith('user:3', 'notification:new', { type: 'CALENDAR_CONNECTION' })
  })

  it('si ya estaba caída (otro proceso ganó la transición) no vuelve a avisar', async () => {
    prisma.googleCalendarConnection.updateMany.mockResolvedValue({ count: 0 })

    await markNeedsReconnect(CONN, 'expired')

    expect(prisma.notification.create).not.toHaveBeenCalled()
    expect(emitTo).not.toHaveBeenCalled()
  })
})

describe('isMissingScopeError', () => {
  it('reconoce el 403 de scope insuficiente', () => {
    expect(isMissingScopeError(scopeError())).toBe(true)
  })
  it('no confunde otro 403 ni un 500', () => {
    const other = { response: { status: 403, data: { error: { message: 'The caller does not have permission' } } } }
    expect(isMissingScopeError(other)).toBe(false)
    expect(isMissingScopeError({ response: { status: 500, data: { error: { message: 'boom' } } } })).toBe(false)
    expect(isMissingScopeError(new Error('ECONNRESET'))).toBe(false)
  })
})

describe('getValidAccessToken', () => {
  it('una conexión ya caída falla sin tocar a Google ni volver a marcarla', async () => {
    await expect(getValidAccessToken({ ...CONN, status: 'missing_scope' }))
      .rejects.toMatchObject({ code: 'TOKEN_EXPIRED', message: expect.stringMatching(/permiso del calendario/) })
    expect(OAuth2Client).not.toHaveBeenCalled()
    expect(prisma.googleCalendarConnection.updateMany).not.toHaveBeenCalled()
  })

  it('sin refresh token marca expired (y avisa por markNeedsReconnect)', async () => {
    prisma.googleCalendarConnection.updateMany.mockResolvedValue({ count: 1 })
    await expect(getValidAccessToken(CONN)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' })
    expect(prisma.notification.create).toHaveBeenCalledTimes(1)
  })
})

describe('syncAllDue', () => {
  it('saltea en la query los calendarios de Google de conexiones caídas', async () => {
    prisma.googleCalendarConnection.findMany.mockResolvedValue([{ userId: 3, workspaceId: 1 }])
    prisma.externalCalendar.findMany.mockResolvedValue([])

    await syncAllDue()

    const where = prisma.externalCalendar.findMany.mock.calls[0][0].where
    expect(where.active).toBe(true)
    expect(where.NOT).toEqual([{ source: 'google', userId: 3, workspaceId: 1 }])
  })

  it('el 403 de scope marca la conexión y el sync no se loguea como error', async () => {
    prisma.googleCalendarConnection.findMany.mockResolvedValue([])
    const accessToken = encrypt('tok')
    prisma.externalCalendar.findMany.mockResolvedValue([{
      id: 6, userId: 3, workspaceId: 1, source: 'google', googleCalendarId: 'primary', lastSyncAt: null,
      workspace: { timezone: 'America/Argentina/Buenos_Aires' },
    }])
    prisma.googleCalendarConnection.findUnique.mockResolvedValue({
      ...CONN, accessToken, expiresAt: new Date(Date.now() + 3600e3),
    })
    prisma.googleCalendarConnection.updateMany.mockResolvedValue({ count: 1 })
    prisma.externalCalendar.update.mockResolvedValue({})
    axios.get.mockRejectedValue(scopeError())

    const res = await syncAllDue()

    expect(res.synced).toBe(0)
    expect(prisma.googleCalendarConnection.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'missing_scope' } }))
    expect(prisma.externalCalendar.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastSyncError: expect.stringMatching(/permiso del calendario/) }),
    }))
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('handleCallback — permiso del calendario', () => {
  const state = () => signState({ workspaceId: 1, slug: 'bliss', userId: 3 })
  const run = async () => {
    const res = { redirect: jest.fn() }
    await handleCallback({ query: { code: 'c', state: state() } }, res, jest.fn())
    return res.redirect.mock.calls[0][0]
  }

  it('si Google no otorgó calendar.events no guarda nada y explica qué pasó', async () => {
    OAuth2Client.__getToken.mockResolvedValue({ tokens: { access_token: 'a', refresh_token: 'r', scope: 'openid https://www.googleapis.com/auth/userinfo.email' } })

    const url = await run()

    expect(url).toMatch(/oauth-result\?error=/)
    expect(decodeURIComponent(url)).toMatch(/No diste permiso al calendario/)
    expect(prisma.googleCalendarConnection.upsert).not.toHaveBeenCalled()
  })

  it('con el scope guarda, marca leídos los avisos y fuerza el refresco de su calendario', async () => {
    OAuth2Client.__getToken.mockResolvedValue({ tokens: { access_token: 'a', refresh_token: 'r', scope: 'openid https://www.googleapis.com/auth/calendar.events' } })
    prisma.googleCalendarConnection.upsert.mockResolvedValue({})
    prisma.notification.updateMany.mockResolvedValue({ count: 1 })
    prisma.externalCalendar.updateMany.mockResolvedValue({ count: 1 })

    const url = await run()

    expect(url).toMatch(/success=true/)
    expect(prisma.googleCalendarConnection.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: 'active' }),
    }))
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 3, workspaceId: 1, type: 'CALENDAR_CONNECTION', read: false }, data: { read: true },
    })
    expect(prisma.externalCalendar.updateMany).toHaveBeenCalledWith({
      where: { userId: 3, workspaceId: 1, source: 'google' }, data: { lastSyncAt: null },
    })
  })
})
