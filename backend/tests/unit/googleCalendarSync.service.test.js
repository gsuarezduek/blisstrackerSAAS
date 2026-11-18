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

// ─── Series recurrentes: un evento recurrente en Google, no uno por ocurrencia ──
const { buildRecurrenceRule, wallToUtc, isInstanceOf } = require('../../src/services/googleCalendarSync.service')
const TZ = 'America/Argentina/Buenos_Aires'

describe('wallToUtc', () => {
  it('hora de pared de Buenos Aires (UTC-3) → instante UTC', () => {
    expect(wallToUtc('2026-12-07', '11:00', TZ).toISOString()).toBe('2026-12-07T14:00:00.000Z')
  })
  it('respeta el horario de verano de la zona', () => {
    expect(wallToUtc('2026-07-01', '09:00', 'Europe/Madrid').toISOString()).toBe('2026-07-01T07:00:00.000Z')
    expect(wallToUtc('2026-01-15', '09:00', 'Europe/Madrid').toISOString()).toBe('2026-01-15T08:00:00.000Z')
  })
})

describe('buildRecurrenceRule', () => {
  const base = { startTime: '11:00', startDate: '2026-12-07', endDate: null }

  it('semanal multi-día con los días de la semana de la serie (0 = domingo)', () => {
    const rec = { ...base, frequency: 'weekly', weekdays: '[1,3]' }
    expect(buildRecurrenceRule(rec, { tz: TZ, startDate: '2026-12-07' })).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE'])
  })

  it('diaria', () => {
    expect(buildRecurrenceRule({ ...base, frequency: 'daily' }, { tz: TZ, startDate: '2026-12-07' }))
      .toEqual(['RRULE:FREQ=DAILY'])
  })

  it('mensual el 31 cae el último día en los meses cortos, igual que nextOccurrenceOnOrAfter', () => {
    const rec = { ...base, frequency: 'monthly', dayOfMonth: 31, startDate: '2026-12-31' }
    expect(buildRecurrenceRule(rec, { tz: TZ, startDate: '2026-12-31' }))
      .toEqual(['RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1'])
  })

  it('mensual un día ≤ 28 va directo', () => {
    const rec = { ...base, frequency: 'monthly', dayOfMonth: 7 }
    expect(buildRecurrenceRule(rec, { tz: TZ, startDate: '2026-12-07' })).toEqual(['RRULE:FREQ=MONTHLY;BYMONTHDAY=7'])
  })

  it('anual con mes y día', () => {
    const rec = { ...base, frequency: 'annual', month: 3, dayOfMonth: 15 }
    expect(buildRecurrenceRule(rec, { tz: TZ, startDate: '2027-03-15' })).toEqual(['RRULE:FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=15'])
  })

  it('UNTIL = fin del último día en la tz del workspace, expresado en UTC', () => {
    const rec = { ...base, frequency: 'daily', endDate: '2026-12-31' }
    // 31/12 23:59:59 en Buenos Aires = 1/1 02:59:59 UTC: una reunión de las 22hs
    // del último día tiene que quedar adentro.
    expect(buildRecurrenceRule(rec, { tz: TZ, startDate: '2026-12-07' }))
      .toEqual(['RRULE:FREQ=DAILY;UNTIL=20270101T025959Z'])
  })

  it('el corte de "esta y las siguientes" gana si es anterior al endDate de la serie', () => {
    const rec = { ...base, frequency: 'daily', endDate: '2027-06-30' }
    expect(buildRecurrenceRule(rec, { tz: TZ, startDate: '2026-12-07', untilDate: '2026-12-20' })[0])
      .toBe('RRULE:FREQ=DAILY;UNTIL=20261221T025959Z')
  })

  it('las ocurrencias borradas sueltas van como EXDATE en hora de pared con TZID (solo las del rango)', () => {
    const rec = { ...base, frequency: 'weekly', weekdays: '[1]', endDate: '2026-12-31' }
    const rules = buildRecurrenceRule(rec, {
      tz: TZ, startDate: '2026-12-07', exceptionDates: ['2026-12-21', '2026-11-30', '2027-01-04', '2026-12-14'],
    })
    expect(rules[1]).toBe(`EXDATE;TZID=${TZ}:20261214T110000,20261221T110000`)
  })
})

describe('isInstanceOf', () => {
  it('reconoce las instancias del evento recurrente por prefijo', () => {
    expect(isInstanceOf('abc123_20261207T140000Z', 'abc123')).toBe(true)
    expect(isInstanceOf('abc123', 'abc123')).toBe(true)
    expect(isInstanceOf('abc1234_20261207T140000Z', 'abc123')).toBe(false)
    expect(isInstanceOf(null, 'abc123')).toBe(false)
    expect(isInstanceOf('abc123_x', null)).toBe(false)
  })
})
