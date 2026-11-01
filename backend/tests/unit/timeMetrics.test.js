// `taskMins` es la fuente de verdad de "cuánto llevó una tarea": alimenta las horas
// usadas vs contratadas, Productividad, el Scorecard de EOS y el informe al cliente.
// No tenía un solo test propio.
const { taskMins, fmtMins, buildCompletedAtWhere, getProductivityPeriod, addDays } = require('../../src/lib/timeMetrics')

const TZ = 'America/Argentina/Buenos_Aires'

describe('taskMins', () => {
  it('mide del inicio al completado', () => {
    expect(taskMins({ startedAt: '2026-10-20T10:00:00Z', completedAt: '2026-10-20T10:45:00Z' })).toBe(45)
  })

  it('descuenta las pausas', () => {
    expect(taskMins({
      startedAt: '2026-10-20T10:00:00Z', completedAt: '2026-10-20T11:00:00Z', pausedMinutes: 20,
    })).toBe(40)
  })

  it('topea en 8h el reloj de pared (alguien que se olvidó de pausar)', () => {
    expect(taskMins({ startedAt: '2026-10-20T00:00:00Z', completedAt: '2026-10-20T20:00:00Z' })).toBe(480)
  })

  it('minutesOverride manda y NO pasa por el tope de 8h', () => {
    // Load-bearing: es la única vía por la que un agente de IA registra su tiempo
    // (task_set_duration), así que el tope de lo declarado vive en la escritura
    // (lifecycle.controller.js#setDuration), no acá. Bajarlo en lectura cambiaría
    // también las duraciones que las personas editan a mano con el mismo campo.
    expect(taskMins({ minutesOverride: 600, startedAt: '2026-10-20T10:00:00Z', completedAt: '2026-10-20T10:05:00Z' })).toBe(600)
    expect(taskMins({ minutesOverride: 0,   startedAt: '2026-10-20T10:00:00Z', completedAt: '2026-10-20T12:00:00Z' })).toBe(0)
  })

  it('nunca devuelve negativo', () => {
    expect(taskMins({ startedAt: '2026-10-20T10:00:00Z', completedAt: '2026-10-20T10:10:00Z', pausedMinutes: 99 })).toBe(0)
  })

  it('devuelve 0 sin datos suficientes', () => {
    expect(taskMins({})).toBe(0)
    expect(taskMins({ startedAt: '2026-10-20T10:00:00Z' })).toBe(0)
    expect(taskMins({ completedAt: '2026-10-20T10:00:00Z' })).toBe(0)
  })
})

describe('fmtMins', () => {
  it('formatea sin espacio entre horas y minutos (backend)', () => {
    expect(fmtMins(0)).toBe('0m')
    expect(fmtMins(45)).toBe('45m')
    expect(fmtMins(60)).toBe('1h')
    expect(fmtMins(90)).toBe('1h30m')
    expect(fmtMins(480)).toBe('8h')
  })
})

describe('buildCompletedAtWhere', () => {
  // El rango tiene que abarcar el DÍA LOCAL del workspace, no el día UTC. Antes el
  // argumento `tz` no se aplicaba (el offset salía siempre 0), así que en ART lo
  // completado entre las 21:00 y las 23:59 se atribuía al día siguiente — y el trabajo de
  // la noche del último día del mes desaparecía de la pestaña Horas del proyecto: quedaba
  // fuera del rango de la query y el bucketing por mes local no tenía dónde ponerlo.
  const wall = (d, tz) => d.toLocaleString('sv-SE', { timeZone: tz })

  it('abarca el día local completo en ART (UTC-3)', () => {
    const w = buildCompletedAtWhere('2026-10-20', '2026-10-20', TZ)
    expect(w.gte.toISOString()).toBe('2026-10-20T03:00:00.000Z')
    expect(w.lte.toISOString()).toBe('2026-10-21T02:59:59.999Z')
  })

  it('aplica la timezone de verdad: cada zona da un rango distinto', () => {
    const day = '2026-10-20'
    const madrid = buildCompletedAtWhere(day, day, 'Europe/Madrid')
    const tokyo  = buildCompletedAtWhere(day, day, 'Asia/Tokyo')
    const utc    = buildCompletedAtWhere(day, day, 'UTC')
    expect(madrid.gte.toISOString()).toBe('2026-10-19T22:00:00.000Z') // +02
    expect(tokyo.gte.toISOString()).toBe('2026-10-19T15:00:00.000Z')  // +09
    expect(utc.gte.toISOString()).toBe('2026-10-20T00:00:00.000Z')
  })

  it('una tarea completada 22:00 ART cae en SU día, no en el siguiente', () => {
    const completedAt = new Date('2026-10-20T22:00:00-03:00')
    const suDia   = buildCompletedAtWhere('2026-10-20', '2026-10-20', TZ)
    const elOtro  = buildCompletedAtWhere('2026-10-21', '2026-10-21', TZ)
    expect(completedAt >= suDia.gte && completedAt <= suDia.lte).toBe(true)
    expect(completedAt >= elOtro.gte && completedAt <= elOtro.lte).toBe(false)
  })

  it('lo trabajado la noche del último día del mes queda DENTRO del mes', () => {
    const completedAt = new Date('2026-10-31T22:30:00-03:00') // = 2026-11-01T01:30Z
    const octubre = buildCompletedAtWhere('2026-10-01', '2026-10-31', TZ)
    expect(completedAt >= octubre.gte && completedAt <= octubre.lte).toBe(true)
  })

  it('acepta un rango abierto de un solo lado (antes el lte salía Invalid Date sin `from`)', () => {
    const soloTo = buildCompletedAtWhere(null, '2026-10-31', TZ)
    expect(soloTo.gte).toBeUndefined()
    expect(soloTo.lte.toISOString()).toBe('2026-11-01T02:59:59.999Z')

    const soloFrom = buildCompletedAtWhere('2026-10-01', null, TZ)
    expect(soloFrom.lte).toBeUndefined()
    expect(soloFrom.gte.toISOString()).toBe('2026-10-01T03:00:00.000Z')
  })

  // ── Horario de verano: el offset no es fijo, y los bordes del día son justo donde
  // algunas zonas cambian la hora.
  it('un día con cambio de hora dura 23h o 25h, con los bordes en la hora local correcta', () => {
    const adelanta = buildCompletedAtWhere('2026-03-29', '2026-03-29', 'Europe/Madrid')
    expect((adelanta.lte - adelanta.gte + 1) / 3600000).toBe(23)
    expect(wall(adelanta.gte, 'Europe/Madrid')).toBe('2026-03-29 00:00:00')

    const atrasa = buildCompletedAtWhere('2026-10-25', '2026-10-25', 'Europe/Madrid')
    expect((atrasa.lte - atrasa.gte + 1) / 3600000).toBe(25)
    expect(wall(atrasa.lte, 'Europe/Madrid')).toBe('2026-10-25 23:59:59')
  })

  it('si la medianoche local no existe (Chile adelanta a las 00:00), arranca en el primer instante que sí', () => {
    // Sin esto el día arrancaría a las 23:00 del día anterior y contaría dos veces esa hora.
    const tz = 'America/Santiago'
    const w = buildCompletedAtWhere('2026-09-06', '2026-09-06', tz)
    expect(wall(w.gte, tz)).toBe('2026-09-06 01:00:00')
  })

  it('días consecutivos empalman exacto: sin solaparse ni dejar huecos', () => {
    for (const [tz, a, b] of [
      [TZ, '2026-10-20', '2026-10-21'],
      ['Europe/Madrid', '2026-10-25', '2026-10-26'],   // día del cambio
      ['America/Santiago', '2026-09-05', '2026-09-06'], // cambio a medianoche
    ]) {
      const d1 = buildCompletedAtWhere(a, a, tz)
      const d2 = buildCompletedAtWhere(b, b, tz)
      expect(d2.gte - d1.lte).toBe(1) // 1 ms: el siguiente instante, sin agujero
    }
  })
})

describe('getProductivityPeriod', () => {
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ })

  it('"current" nunca incluye hoy: el día en curso daría una comparación engañosa', () => {
    const p = getProductivityPeriod('current', TZ)
    expect(p.curEnd < today() || p.curEnd === today()).toBe(true)
    expect(p.curStart.endsWith('-01')).toBe(true)
    expect(p.prevStart < p.curStart).toBe(true)
  })

  it('"previous" compara dos meses completos', () => {
    const p = getProductivityPeriod('previous', TZ)
    expect(p.curStart.endsWith('-01')).toBe(true)
    expect(p.prevStart.endsWith('-01')).toBe(true)
    expect(p.prevEnd < p.curStart).toBe(true)
  })

  it('"custom" compara contra el período inmediatamente anterior de igual duración', () => {
    const p = getProductivityPeriod('custom', TZ, { from: '2026-09-01', to: '2026-09-10' })
    expect(p.curStart).toBe('2026-09-01')
    expect(p.curEnd).toBe('2026-09-10')
    expect(p.prevEnd).toBe('2026-08-31')
    expect(p.prevStart).toBe('2026-08-22') // 10 días, igual que el actual
  })

  it('"custom" recorta a ayer un rango que se mete en el futuro', () => {
    const p = getProductivityPeriod('custom', TZ, { from: '2026-09-01', to: '2099-01-01' })
    expect(p.curEnd).toBe(addDays(today(), -1))
  })
})
