const {
  addDaysYMD, weekdayOf, maxYMD,
  nextOccurrenceOnOrAfter, firstScheduledDate, buildRecurrenceParams,
} = require('../../src/services/recurrence.service')

describe('helpers de fecha', () => {
  it('addDaysYMD cruza fin de mes y año', () => {
    expect(addDaysYMD('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysYMD('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysYMD('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('weekdayOf devuelve 0=domingo … 6=sábado', () => {
    expect(weekdayOf('2026-06-07')).toBe(0) // domingo
    expect(weekdayOf('2026-06-08')).toBe(1) // lunes
  })

  it('maxYMD devuelve el más reciente', () => {
    expect(maxYMD('2026-01-01', '2026-02-01')).toBe('2026-02-01')
    expect(maxYMD(null, '2026-02-01')).toBe('2026-02-01')
  })
})

describe('nextOccurrenceOnOrAfter', () => {
  it('daily: devuelve la misma fecha', () => {
    const rec = { frequency: 'daily' }
    expect(nextOccurrenceOnOrAfter(rec, '2026-06-10')).toBe('2026-06-10')
  })

  it('weekly: encuentra el próximo día de la semana elegido', () => {
    // lunes(1) y miércoles(3). 2026-06-07 es domingo.
    const rec = { frequency: 'weekly', weekdays: '[1,3]' }
    expect(nextOccurrenceOnOrAfter(rec, '2026-06-07')).toBe('2026-06-08') // lunes
    expect(nextOccurrenceOnOrAfter(rec, '2026-06-09')).toBe('2026-06-10') // martes→miércoles
    expect(nextOccurrenceOnOrAfter(rec, '2026-06-11')).toBe('2026-06-15') // jueves→lunes sig.
  })

  it('weekly sin días devuelve null', () => {
    expect(nextOccurrenceOnOrAfter({ frequency: 'weekly', weekdays: '[]' }, '2026-06-07')).toBeNull()
  })

  it('monthly: mismo mes si el día no pasó, sino el siguiente', () => {
    const rec = { frequency: 'monthly', dayOfMonth: 15 }
    expect(nextOccurrenceOnOrAfter(rec, '2026-06-10')).toBe('2026-06-15')
    expect(nextOccurrenceOnOrAfter(rec, '2026-06-20')).toBe('2026-07-15')
  })

  it('monthly: clampea el día 31 a meses cortos', () => {
    const rec = { frequency: 'monthly', dayOfMonth: 31 }
    expect(nextOccurrenceOnOrAfter(rec, '2026-02-01')).toBe('2026-02-28')
  })

  it('annual: respeta mes y día, salta de año', () => {
    const rec = { frequency: 'annual', month: 3, dayOfMonth: 10 }
    expect(nextOccurrenceOnOrAfter(rec, '2026-01-01')).toBe('2026-03-10')
    expect(nextOccurrenceOnOrAfter(rec, '2026-06-01')).toBe('2027-03-10')
  })

  it('respeta endDate (devuelve null si la ocurrencia cae después)', () => {
    const rec = { frequency: 'daily', endDate: '2026-06-09' }
    expect(nextOccurrenceOnOrAfter(rec, '2026-06-10')).toBeNull()
    expect(nextOccurrenceOnOrAfter(rec, '2026-06-09')).toBe('2026-06-09')
  })
})

describe('firstScheduledDate', () => {
  it('weekly: primera ocurrencia >= startDate', () => {
    const rec = { frequency: 'weekly', weekdays: '[1]', startDate: '2026-06-07' }
    expect(firstScheduledDate(rec)).toBe('2026-06-08') // próximo lunes
  })
  it('daily: la startDate misma', () => {
    expect(firstScheduledDate({ frequency: 'daily', startDate: '2026-06-07' })).toBe('2026-06-07')
  })
})

describe('buildRecurrenceParams', () => {
  it('weekly normaliza, ordena y deduplica weekdays', () => {
    const p = buildRecurrenceParams({ frequency: 'weekly', weekdays: [3, 1, 1], startDate: '2026-06-07' })
    expect(p.weekdays).toBe('[1,3]')
  })
  it('weekly sin días usa el día de la semana de startDate', () => {
    const p = buildRecurrenceParams({ frequency: 'weekly', weekdays: [], startDate: '2026-06-08' })
    expect(p.weekdays).toBe('[1]') // lunes
  })
  it('monthly deriva dayOfMonth de startDate', () => {
    const p = buildRecurrenceParams({ frequency: 'monthly', startDate: '2026-06-15' })
    expect(p.dayOfMonth).toBe(15)
    expect(p.month).toBeNull()
  })
  it('annual deriva dayOfMonth y month de startDate', () => {
    const p = buildRecurrenceParams({ frequency: 'annual', startDate: '2026-03-10' })
    expect(p.dayOfMonth).toBe(10)
    expect(p.month).toBe(3)
  })
  it('monthly usa el dayOfMonth elegido por el usuario (no startDate)', () => {
    const p = buildRecurrenceParams({ frequency: 'monthly', startDate: '2026-06-15', dayOfMonth: 28 })
    expect(p.dayOfMonth).toBe(28)
    expect(p.month).toBeNull()
  })
  it('annual usa el dayOfMonth y month elegidos por el usuario (no startDate)', () => {
    const p = buildRecurrenceParams({ frequency: 'annual', startDate: '2026-06-15', dayOfMonth: 25, month: 12 })
    expect(p.dayOfMonth).toBe(25)
    expect(p.month).toBe(12)
  })
})
