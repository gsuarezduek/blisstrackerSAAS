/**
 * Calendarios traídos de afuera: el paso de un instante UTC a la hora de pared del
 * workspace, y el mapeo de lo que devuelven Google y un ICS.
 *
 * Es la parte con bordes de toda la feature: Google manda instantes con offset, los
 * días completos vienen con el fin EXCLUSIVO, un ICS trae series sin expandir, y
 * cualquiera de esas tres cosas mal leída corre un evento un día o una hora.
 */
const ical = require('node-ical')
const {
  wallInTz, ymdLocal, mapGoogleEvent, normalizeIcsUrl, mapIcsEvent, clampDuration, cleanTitle,
  MAX_DURATION_MINS,
} = require('../../src/lib/externalCalendar')

const TZ = 'America/Argentina/Buenos_Aires'

describe('wallInTz — instante UTC → hora de pared', () => {
  it('traduce a la hora local del workspace', () => {
    expect(wallInTz(new Date('2026-11-10T12:00:00Z'), TZ)).toEqual({ date: '2026-11-10', time: '09:00' })
  })

  it('un evento de la noche queda en SU día, no en el del UTC', () => {
    // 22:00 del 6 en Buenos Aires es la 01:00 del 7 en UTC.
    expect(wallInTz(new Date('2026-11-07T01:00:00Z'), TZ)).toEqual({ date: '2026-11-06', time: '22:00' })
  })

  it('la medianoche es 00:00 y no 24:00', () => {
    expect(wallInTz(new Date('2026-11-07T03:00:00Z'), TZ).time).toBe('00:00')
  })

  it('la misma hora cambia de día según la timezone', () => {
    const instant = new Date('2026-11-10T02:00:00Z')
    expect(wallInTz(instant, TZ).date).toBe('2026-11-09')
    expect(wallInTz(instant, 'Europe/Madrid').date).toBe('2026-11-10')
  })
})

describe('ymdLocal — el día de un "todo el día" de un ICS', () => {
  it('toma los componentes locales, para que el día no dependa de dónde corra el server', () => {
    const d = new Date(2026, 10, 12, 0, 0, 0) // 12 de noviembre, medianoche local
    expect(ymdLocal(d)).toBe('2026-11-12')
  })
})

describe('mapGoogleEvent', () => {
  const timed = (over = {}) => ({
    id: 'ev1', summary: 'Dentista',
    start: { dateTime: '2026-11-10T09:00:00-03:00' },
    end:   { dateTime: '2026-11-10T10:00:00-03:00' },
    ...over,
  })

  it('un evento con hora queda con su día, hora y duración', () => {
    expect(mapGoogleEvent(timed(), TZ)).toMatchObject({
      externalId: 'ev1', title: 'Dentista', date: '2026-11-10', endDate: '2026-11-10',
      startTime: '09:00', durationMins: 60, allDay: false, busy: true,
    })
  })

  it('el día completo corrige el fin EXCLUSIVO de Google', () => {
    // Google describe un viaje del 12 al 14 como start 12 / end 15.
    const row = mapGoogleEvent({ id: 'v', summary: 'Viaje', start: { date: '2026-11-12' }, end: { date: '2026-11-15' } }, TZ)
    expect(row).toMatchObject({ date: '2026-11-12', endDate: '2026-11-14', allDay: true, startTime: null })
  })

  it('un día completo no ocupa franja', () => {
    const row = mapGoogleEvent({ id: 'v', summary: 'Feriado', start: { date: '2026-11-12' }, end: { date: '2026-11-13' } }, TZ)
    expect(row.busy).toBe(false)
  })

  it('"Mostrar como libre" no ocupa franja, pero se ve', () => {
    const row = mapGoogleEvent(timed({ transparency: 'transparent' }), TZ)
    expect(row.busy).toBe(false)
    expect(row.title).toBe('Dentista')
  })

  it('lo que rechacé no se trae', () => {
    expect(mapGoogleEvent(timed({ attendees: [{ self: true, responseStatus: 'declined' }] }), TZ)).toBeNull()
  })

  it('lo que rechazó OTRO invitado sí se trae', () => {
    expect(mapGoogleEvent(timed({ attendees: [{ email: 'otro@x.com', responseStatus: 'declined' }] }), TZ)).not.toBeNull()
  })

  it('descarta cancelados y los carteles de Google que no son citas', () => {
    expect(mapGoogleEvent(timed({ status: 'cancelled' }), TZ)).toBeNull()
    expect(mapGoogleEvent(timed({ eventType: 'workingLocation' }), TZ)).toBeNull()
    expect(mapGoogleEvent({ id: 'b', summary: 'Cumple', eventType: 'birthday', start: { date: '2026-11-12' }, end: { date: '2026-11-13' } }, TZ)).toBeNull()
  })

  it('un evento que cruza la medianoche termina al día siguiente', () => {
    const row = mapGoogleEvent(timed({
      start: { dateTime: '2026-11-06T22:00:00-03:00' },
      end:   { dateTime: '2026-11-07T01:00:00-03:00' },
    }), TZ)
    expect(row).toMatchObject({ date: '2026-11-06', endDate: '2026-11-07', startTime: '22:00', durationMins: 180 })
  })

  it('un evento sin título no queda sin nombre', () => {
    expect(mapGoogleEvent(timed({ summary: undefined }), TZ).title).toBe('Ocupado')
  })

  it('una duración absurda se recorta en vez de tapar la grilla entera', () => {
    const row = mapGoogleEvent(timed({
      start: { dateTime: '2026-11-10T09:00:00-03:00' },
      end:   { dateTime: '2026-12-10T09:00:00-03:00' },
    }), TZ)
    expect(row.durationMins).toBe(MAX_DURATION_MINS)
  })
})

describe('normalizeIcsUrl', () => {
  it('acepta webcal:// y lo pasa a https', () => {
    expect(normalizeIcsUrl('webcal://calendar.google.com/calendar/ical/x/basic.ics'))
      .toBe('https://calendar.google.com/calendar/ical/x/basic.ics')
  })

  it('deja pasar https tal cual y recorta los espacios de un pegado', () => {
    expect(normalizeIcsUrl('  https://outlook.office365.com/owa/calendar/x/reachcalendar.ics  '))
      .toBe('https://outlook.office365.com/owa/calendar/x/reachcalendar.ics')
  })

  it('rechaza lo que no es una URL o no es http(s)', () => {
    expect(() => normalizeIcsUrl('')).toThrow(/Pegá la URL/)
    expect(() => normalizeIcsUrl('no es una url')).toThrow(/no es una URL válida/i)
    expect(() => normalizeIcsUrl('file:///etc/passwd')).toThrow(/https/)
  })
})

describe('mapIcsEvent', () => {
  const ICS = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN',
    'BEGIN:VEVENT',
    'DTSTART;TZID=America/Argentina/Buenos_Aires:20261109T090000',
    'DTEND;TZID=America/Argentina/Buenos_Aires:20261109T100000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO',
    'EXDATE;TZID=America/Argentina/Buenos_Aires:20261123T090000',
    'UID:serie@x', 'SUMMARY:Standup semanal', 'LOCATION:Sala 2',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;TZID=America/Argentina/Buenos_Aires:20261106T220000',
    'DTEND;TZID=America/Argentina/Buenos_Aires:20261107T000000',
    'UID:nocturno@x', 'SUMMARY:Cierre nocturno',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261112', 'DTEND;VALUE=DATE:20261115',
    'UID:viaje@x', 'SUMMARY:Viaje', 'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;TZID=America/Argentina/Buenos_Aires:20261118T150000',
    'DTEND;TZID=America/Argentina/Buenos_Aires:20261118T160000',
    'UID:cancel@x', 'SUMMARY:Cancelada', 'STATUS:CANCELLED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;TZID=America/Argentina/Buenos_Aires:20250301T100000',
    'DTEND;TZID=America/Argentina/Buenos_Aires:20250301T110000',
    'UID:viejo@x', 'SUMMARY:Del año pasado',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  function run(from = '2026-11-01', to = '2026-11-30') {
    const parsed = ical.parseICS(ICS)
    return Object.values(parsed).flatMap(v => mapIcsEvent(v, { tz: TZ, from, to }))
  }

  it('expande la serie y saltea la fecha excluida (EXDATE)', () => {
    const serie = run().filter(r => r.externalId.startsWith('serie@x'))
    expect(serie.map(r => r.date)).toEqual(['2026-11-09', '2026-11-16', '2026-11-30'])
    expect(serie.every(r => r.startTime === '09:00' && r.durationMins === 60)).toBe(true)
  })

  it('cada ocurrencia es una fila con id propio (el upsert es por ocurrencia)', () => {
    const ids = run().filter(r => r.externalId.startsWith('serie@x')).map(r => r.externalId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('serie@x#2026-11-09')
  })

  it('un evento que cruza la medianoche termina al día siguiente', () => {
    expect(run().find(r => r.externalId === 'nocturno@x')).toMatchObject({
      date: '2026-11-06', endDate: '2026-11-07', startTime: '22:00', durationMins: 120,
    })
  })

  it('un "todo el día" de varios días no ocupa franja y termina el último día', () => {
    expect(run().find(r => r.externalId === 'viaje@x')).toMatchObject({
      date: '2026-11-12', endDate: '2026-11-14', allDay: true, startTime: null, busy: false,
    })
  })

  it('descarta los cancelados y lo que cae fuera del rango', () => {
    const ids = run().map(r => r.externalId)
    expect(ids).not.toContain('cancel@x')
    expect(ids).not.toContain('viejo@x')
  })

  it('el rango recorta la serie sin tocar su hora', () => {
    const serie = run('2026-11-15', '2026-11-20').filter(r => r.externalId.startsWith('serie@x'))
    expect(serie.map(r => r.date)).toEqual(['2026-11-16'])
  })
})

describe('clampDuration / cleanTitle', () => {
  it('una duración inválida cae al default y nunca es negativa', () => {
    expect(clampDuration(null)).toBe(60)
    expect(clampDuration(-10)).toBe(60)
    expect(clampDuration(45)).toBe(45)
  })

  it('el título se normaliza y se recorta', () => {
    expect(cleanTitle('  Reunión   con   el   cliente ')).toBe('Reunión con el cliente')
    expect(cleanTitle('')).toBe('Ocupado')
    expect(cleanTitle('x'.repeat(500)).length).toBe(300)
  })
})

describe('dedupeExternalRows — el mismo evento por dos calendarios', () => {
  const { dedupeExternalRows } = require('../../src/lib/externalCalendar')

  const row = (over = {}) => ({
    id: 1, userId: 7, title: 'Reunión cierre semanal',
    date: '2026-11-10', endDate: '2026-11-10', startTime: '15:00', ...over,
  })

  it('colapsa el mismo compromiso traído por dos suscripciones distintas', () => {
    // Pasa apenas alguien conecta su Google y además pega la URL iCal de ese mismo
    // calendario: cada fuente le pone su propio externalId.
    const out = dedupeExternalRows([row({ id: 1 }), row({ id: 2 })])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe(1)
  })

  it('no colapsa dos eventos distintos de la misma persona a la misma hora', () => {
    expect(dedupeExternalRows([row(), row({ id: 2, title: 'Otra cosa' })])).toHaveLength(2)
  })

  it('no colapsa el mismo título a horas distintas, ni entre personas distintas', () => {
    expect(dedupeExternalRows([row(), row({ id: 2, startTime: '16:00' })])).toHaveLength(2)
    expect(dedupeExternalRows([row(), row({ id: 2, userId: 8 })])).toHaveLength(2)
  })

  it('ignora mayúsculas y espacios de más en el título', () => {
    expect(dedupeExternalRows([row(), row({ id: 2, title: '  reunión cierre semanal ' })])).toHaveLength(1)
  })

  it('los de día completo se comparan por su rango, no por hora', () => {
    const viaje = { id: 1, userId: 7, title: 'Viaje', date: '2026-11-12', endDate: '2026-11-14', startTime: null }
    expect(dedupeExternalRows([viaje, { ...viaje, id: 2 }])).toHaveLength(1)
    expect(dedupeExternalRows([viaje, { ...viaje, id: 2, endDate: '2026-11-15' }])).toHaveLength(2)
  })
})
