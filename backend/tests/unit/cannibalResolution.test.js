const {
  conflictKey, postFixWindow, proratedMinImpressions, verifyResolution,
  splitByResolution, publicResolution, MIN_VERIFY_DAYS,
} = require('../../src/lib/cannibalResolution')
const { summarizeConflicts } = require('../../src/lib/cannibalAnalysis')

const SITE = 'https://mdzrentacar.com'

function conflict(over = {}) {
  return {
    query: 'alquiler de autos',
    language: 'default',
    severity: 'Alta',
    severityScore: 70,
    totalImpressions: 1200,
    urls: [{ url: `${SITE}/alquiler-autos` }, { url: `${SITE}/blog/alquiler-autos` }],
    ...over,
  }
}

function resolution(over = {}) {
  return {
    id: 1,
    query: 'alquiler de autos',
    language: 'default',
    action: '301',
    note: '301 hecho',
    status: 'resolved',
    resolvedAt: new Date('2026-10-01T12:00:00Z'),
    urls: JSON.stringify([`${SITE}/alquiler-autos`, `${SITE}/blog/alquiler-autos`]),
    reopenCount: 0,
    ...over,
  }
}

describe('conflictKey', () => {
  it('iguala la misma keyword escrita distinto, y separa por idioma', () => {
    expect(conflictKey('  Alquiler de Autos ', 'default')).toBe(conflictKey('alquiler de autos', 'default'))
    expect(conflictKey('alquiler de autos', 'en')).not.toBe(conflictKey('alquiler de autos', 'default'))
  })

  it('sin idioma asume el principal (default), como el análisis', () => {
    expect(conflictKey('x', null)).toBe(conflictKey('x', 'default'))
    expect(conflictKey('x', '')).toBe(conflictKey('x', 'default'))
  })
})

describe('postFixWindow', () => {
  it('arranca el día DESPUÉS del arreglo — el día del arreglo está mezclado', () => {
    const w = postFixWindow(new Date('2026-10-01T12:00:00Z'), '2026-10-31')
    expect(w.startDate).toBe('2026-10-02')
    expect(w.endDate).toBe('2026-10-31')
    expect(w.days).toBe(30)
  })

  it('devuelve null si el arreglo es posterior a la ventana de datos', () => {
    expect(postFixWindow(new Date('2026-11-05T00:00:00Z'), '2026-10-31')).toBeNull()
  })

  it('devuelve null con fechas inválidas', () => {
    expect(postFixWindow('cualquier cosa', '2026-10-31')).toBeNull()
    expect(postFixWindow(new Date('2026-10-01'), null)).toBeNull()
  })
})

describe('proratedMinImpressions', () => {
  it('prorratea el corte de volumen a la ventana posterior al arreglo', () => {
    // Sin esto, 10 días de datos contra un análisis de 90 nunca llegarían a las 50
    // impresiones del corte original y TODO parecería resuelto para siempre.
    expect(proratedMinImpressions(90, 90)).toBe(50)
    expect(proratedMinImpressions(45, 90)).toBe(25)
  })

  it('nunca baja del piso, por corta que sea la ventana', () => {
    expect(proratedMinImpressions(7, 180)).toBe(10)
    expect(proratedMinImpressions(1, 180)).toBe(10)
  })

  it('una ventana más larga que el rango no sube el corte', () => {
    expect(proratedMinImpressions(120, 90)).toBe(50)
  })
})

describe('verifyResolution', () => {
  const base = { windowDays: 30, rangeDays: 90, language: 'default' }

  it('reabre cuando dos URLs vuelven a llevarse la keyword después del arreglo', () => {
    const r = verifyResolution({
      ...base,
      rows: [
        { url: `${SITE}/alquiler-autos`, impressions: 400, clicks: 20 },
        { url: `${SITE}/blog/alquiler-autos`, impressions: 300, clicks: 10 },
      ],
    })
    expect(r.decision).toBe('reopen')
    expect(r.urls).toHaveLength(2)
    expect(r.urls[0].share).toBeCloseTo(0.57, 1)
  })

  it('NO reabre por las impresiones residuales de la URL redirigida', () => {
    // Un 301 no borra la URL vieja de Search Console de un día para otro: Google
    // tarda semanas en dejar de servirla. Esas migajas no son "volvió".
    const r = verifyResolution({
      ...base,
      rows: [
        { url: `${SITE}/alquiler-autos`, impressions: 900, clicks: 60 },
        { url: `${SITE}/blog/alquiler-autos`, impressions: 12, clicks: 0 },
      ],
    })
    expect(r.decision).toBe('holds')
  })

  it('NO reabre si la keyword no tiene volumen suficiente en la ventana', () => {
    const r = verifyResolution({
      ...base, windowDays: 10,
      rows: [
        { url: `${SITE}/alquiler-autos`, impressions: 4, clicks: 0 },
        { url: `${SITE}/blog/alquiler-autos`, impressions: 3, clicks: 0 },
      ],
    })
    expect(r.decision).toBe('holds')
    expect(r.totalImpressions).toBe(7)
    expect(r.minImpressions).toBe(10)
  })

  it('reabre si apareció una URL nueva compitiendo con la principal', () => {
    const r = verifyResolution({
      ...base,
      rows: [
        { url: `${SITE}/alquiler-autos`, impressions: 500, clicks: 30 },
        { url: `${SITE}/promos/alquiler-autos`, impressions: 450, clicks: 25 },
      ],
    })
    expect(r.decision).toBe('reopen')
    expect(r.urls.map(u => u.url)).toContain(`${SITE}/promos/alquiler-autos`)
  })

  it('ignora URLs de otro idioma — ese es otro conflicto', () => {
    const r = verifyResolution({
      ...base,
      rows: [
        { url: `${SITE}/alquiler-autos`, impressions: 500, clicks: 30 },
        { url: `${SITE}/en/car-rental`, impressions: 450, clicks: 25 },
      ],
    })
    expect(r.decision).toBe('holds')
  })

  it('cuenta las URLs del conflicto original aunque su idioma venga de un fetch', () => {
    // El idioma de algunas URLs se resolvió leyendo <html lang> en el run original; la
    // verificación no repite esos fetches, así que las URLs ya conocidas cuentan igual.
    const r = verifyResolution({
      windowDays: 30, rangeDays: 90, language: 'en',
      knownUrls: [`${SITE}/car-rental`, `${SITE}/blog/car-rental`],
      rows: [
        { url: `${SITE}/car-rental`, impressions: 500, clicks: 30 },
        { url: `${SITE}/blog/car-rental`, impressions: 400, clicks: 20 },
      ],
    })
    expect(r.decision).toBe('reopen')
  })

  it('una sola URL dominante no es canibalización', () => {
    const r = verifyResolution({
      ...base,
      rows: [{ url: `${SITE}/alquiler-autos`, impressions: 1000, clicks: 80 }],
    })
    expect(r.decision).toBe('holds')
  })

  it('suma las filas de una misma URL si vienen partidas', () => {
    const r = verifyResolution({
      ...base,
      rows: [
        { url: `${SITE}/alquiler-autos`, impressions: 200, clicks: 10 },
        { url: `${SITE}/alquiler-autos`, impressions: 200, clicks: 10 },
        { url: `${SITE}/blog/alquiler-autos`, impressions: 300, clicks: 5 },
      ],
    })
    expect(r.decision).toBe('reopen')
    expect(r.urls.find(u => u.url === `${SITE}/alquiler-autos`).impressions).toBe(400)
  })

  it('sin datos post-arreglo no reabre', () => {
    expect(verifyResolution({ ...base, rows: [] }).decision).toBe('holds')
  })
})

describe('splitByResolution', () => {
  it('saca de la lista los conflictos resueltos y les pega el detalle del arreglo', () => {
    const { open, resolved } = splitByResolution(
      [conflict(), conflict({ query: 'autos en mendoza' })],
      [resolution()],
    )
    expect(open.map(c => c.query)).toEqual(['autos en mendoza'])
    expect(resolved).toHaveLength(1)
    expect(resolved[0].resolution.action).toBe('301')
    expect(resolved[0].resolution.urls).toHaveLength(2)
  })

  it('un conflicto REABIERTO sigue abierto, con el historial del arreglo anterior', () => {
    const { open, resolved } = splitByResolution(
      [conflict()],
      [resolution({ status: 'reopened', reopenedAt: new Date('2026-10-20'), reopenCount: 1 })],
    )
    expect(resolved).toHaveLength(0)
    expect(open).toHaveLength(1)
    expect(open[0].resolution.status).toBe('reopened')
    expect(open[0].resolution.reopenCount).toBe(1)
  })

  it('la resolución de un idioma no tapa el conflicto del otro', () => {
    const { open, resolved } = splitByResolution(
      [conflict(), conflict({ language: 'en' })],
      [resolution({ language: 'en' })],
    )
    expect(open).toHaveLength(1)
    expect(open[0].language).toBe('default')
    expect(resolved[0].language).toBe('en')
  })

  it('no modifica los conflictos que no tienen resolución', () => {
    const { open } = splitByResolution([conflict()], [])
    expect(open[0].resolution).toBeUndefined()
  })

  it('los conteos recalculados sobre los abiertos descuentan lo resuelto', () => {
    const conflicts = [
      conflict({ severity: 'Alta', totalImpressions: 1000 }),
      conflict({ query: 'b', severity: 'Media', totalImpressions: 500 }),
      conflict({ query: 'c', severity: 'Baja', totalImpressions: 60 }),
    ]
    const { open } = splitByResolution(conflicts, [resolution()]) // resuelve la Alta
    expect(summarizeConflicts(open)).toEqual({
      criticalCount: 0, warningCount: 1, lowCount: 1, trafficAtRisk: 500,
    })
  })
})

describe('publicResolution', () => {
  it('parsea los JSON y resuelve el autor (persona o agente)', () => {
    const r = publicResolution(resolution({
      resolvedBy: { name: 'Gastón' },
      resolvedByAgentName: 'SEO',
      reopenEvidence: JSON.stringify({ from: '2026-10-02', to: '2026-10-31', urls: [] }),
    }))
    expect(r.resolvedBy).toBe('Gastón')
    expect(r.agent).toBe('SEO')
    expect(r.urls).toHaveLength(2)
    expect(r.reopenEvidence.from).toBe('2026-10-02')
  })

  it('tolera JSON corrupto sin lanzar', () => {
    const r = publicResolution(resolution({ urls: '{roto', reopenEvidence: 'nada' }))
    expect(r.urls).toEqual([])
    expect(r.reopenEvidence).toBeNull()
  })
})

describe('MIN_VERIFY_DAYS', () => {
  it('exige al menos una semana de datos posteriores al arreglo', () => {
    // Search Console publica con 2-3 días de atraso: decidir antes sería decir
    // "volvió" por falta de datos.
    expect(MIN_VERIFY_DAYS).toBeGreaterThanOrEqual(7)
  })
})
