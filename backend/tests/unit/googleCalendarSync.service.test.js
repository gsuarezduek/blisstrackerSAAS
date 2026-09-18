const { endDateTime, buildEventPayload } = require('../../src/services/googleCalendarSync.service')

describe('endDateTime', () => {
  it('suma la duración dentro del mismo día', () => {
    expect(endDateTime('2026-09-21', '14:00', 30)).toEqual({ endDate: '2026-09-21', endTime: '14:30' })
  })

  it('cruza la medianoche y avanza la fecha', () => {
    expect(endDateTime('2026-09-21', '23:30', 60)).toEqual({ endDate: '2026-09-22', endTime: '00:30' })
  })

  it('duración máxima (8h) desde la mañana no cruza el día', () => {
    expect(endDateTime('2026-09-21', '09:00', 8 * 60)).toEqual({ endDate: '2026-09-21', endTime: '17:00' })
  })
})

describe('buildEventPayload', () => {
  const baseEvent = {
    title: 'Sync semanal',
    date: '2026-09-21',
    startTime: '10:00',
    durationMins: 30,
    organizerId: 1,
    notes: null,
    meetLink: null,
    participants: [
      { userId: 1, user: { id: 1, email: 'organizador@bliss.ar' } },
      { userId: 2, user: { id: 2, email: 'invitado@bliss.ar' } },
    ],
  }

  it('arma start/end en la timezone del workspace sin aritmética de UTC', () => {
    const payload = buildEventPayload(baseEvent, 'America/Argentina/Buenos_Aires')
    expect(payload.start).toEqual({ dateTime: '2026-09-21T10:00:00', timeZone: 'America/Argentina/Buenos_Aires' })
    expect(payload.end).toEqual({ dateTime: '2026-09-21T10:30:00', timeZone: 'America/Argentina/Buenos_Aires' })
  })

  it('excluye al organizador de los attendees (solo invitados)', () => {
    const payload = buildEventPayload(baseEvent, 'America/Argentina/Buenos_Aires')
    expect(payload.attendees).toEqual([{ email: 'invitado@bliss.ar' }])
  })

  it('arma la descripción con notas + link de Meet cuando existen', () => {
    const event = { ...baseEvent, notes: 'Traer el brief', meetLink: 'https://meet.google.com/abc' }
    const payload = buildEventPayload(event, 'America/Argentina/Buenos_Aires')
    expect(payload.description).toBe('Traer el brief\n\nMeet: https://meet.google.com/abc')
    expect(payload.location).toBe('https://meet.google.com/abc')
  })

  it('sin notas ni link, description/location quedan undefined (no strings vacíos)', () => {
    const payload = buildEventPayload(baseEvent, 'America/Argentina/Buenos_Aires')
    expect(payload.description).toBeUndefined()
    expect(payload.location).toBeUndefined()
  })

  it('un participante sin email cargado no rompe y simplemente no se agrega', () => {
    const event = { ...baseEvent, participants: [...baseEvent.participants, { userId: 3, user: { id: 3, email: null } }] }
    const payload = buildEventPayload(event, 'America/Argentina/Buenos_Aires')
    expect(payload.attendees).toEqual([{ email: 'invitado@bliss.ar' }])
  })
})
