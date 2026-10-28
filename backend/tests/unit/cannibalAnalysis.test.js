const {
  detectLanguage, classifyJunkUrl, pickMainUrl, normalizeUrlForCompare,
  calcSeverity, groupConflicts,
} = require('../../src/lib/cannibalAnalysis')

describe('detectLanguage', () => {
  it('detecta idioma por prefijo de ruta reconocido', () => {
    expect(detectLanguage('https://mdzrentacar.com/en/cars')).toBe('en')
    expect(detectLanguage('https://mdzrentacar.com/pt/carros')).toBe('pt')
    expect(detectLanguage('https://mdzrentacar.com/en-us/cars')).toBe('en')
  })

  it('sin prefijo reconocido devuelve default', () => {
    expect(detectLanguage('https://mdzrentacar.com/autos')).toBe('default')
    expect(detectLanguage('https://mdzrentacar.com/')).toBe('default')
  })

  it('no confunde un segmento no-idioma con un prefijo', () => {
    expect(detectLanguage('https://mdzrentacar.com/xx/cars')).toBe('default')
  })

  it('URL inválida devuelve default sin lanzar', () => {
    expect(detectLanguage('no-es-una-url')).toBe('default')
  })
})

describe('classifyJunkUrl', () => {
  it('detecta URLs con parámetros de query', () => {
    const r = classifyJunkUrl('https://mdzrentacar.com/?page_id=0')
    expect(r).not.toBeNull()
    expect(r.reason).toMatch(/parámetros/i)
  })

  it('detecta slugs numéricos', () => {
    const r = classifyJunkUrl('https://mdzrentacar.com/en/19947-2/')
    expect(r).not.toBeNull()
    expect(r.reason).toMatch(/numérico/i)
  })

  it('detecta feeds y paginación', () => {
    expect(classifyJunkUrl('https://mdzrentacar.com/feed/')).not.toBeNull()
    expect(classifyJunkUrl('https://mdzrentacar.com/blog/page/3/')).not.toBeNull()
  })

  it('no marca URLs de contenido normales', () => {
    expect(classifyJunkUrl('https://mdzrentacar.com/autos')).toBeNull()
    expect(classifyJunkUrl('https://mdzrentacar.com/en/cars')).toBeNull()
  })

  it('URL inválida devuelve null sin lanzar', () => {
    expect(classifyJunkUrl('no-es-una-url')).toBeNull()
  })
})

describe('calcSeverity', () => {
  it('mantiene el comportamiento original (score aditivo 0-100)', () => {
    const urls = [{ position: 5, ctr: 0.01 }, { position: 8, ctr: 0.03 }]
    const { label, score } = calcSeverity(urls, 1000)
    expect(score).toBeGreaterThan(0)
    expect(['Alta', 'Media', 'Baja']).toContain(label)
  })
})

describe('normalizeUrlForCompare', () => {
  it('ignora mayúsculas de host y slash final', () => {
    expect(normalizeUrlForCompare('https://MDZrentacar.com/autos/'))
      .toBe(normalizeUrlForCompare('https://mdzrentacar.com/autos'))
  })

  it('distingue paths distintos', () => {
    expect(normalizeUrlForCompare('https://mdzrentacar.com/autos'))
      .not.toBe(normalizeUrlForCompare('https://mdzrentacar.com/flota'))
  })
})

describe('pickMainUrl', () => {
  it('elige la de más clics', () => {
    const urls = [
      { url: 'a', clicks: 5, impressions: 100, position: 3 },
      { url: 'b', clicks: 20, impressions: 80, position: 5 },
    ]
    const { url, reason } = pickMainUrl(urls)
    expect(url).toBe('b')
    expect(reason).toMatch(/clics/)
  })

  it('empate en clics decide por impresiones', () => {
    const urls = [
      { url: 'a', clicks: 0, impressions: 50, position: 3 },
      { url: 'b', clicks: 0, impressions: 200, position: 5 },
    ]
    const { url, reason } = pickMainUrl(urls)
    expect(url).toBe('b')
    expect(reason).toMatch(/impresiones/)
  })
})

// ─── groupConflicts: escenario sintético tipo MDZ Rent a Car (ES default + /en/ + /pt/, Polylang) ───

function row(query, page, { country = 'arg', clicks = 0, impressions = 0, ctr = 0, position = 10 } = {}) {
  return { query, page, country, clicks, impressions, ctr, position }
}

describe('groupConflicts — escenario MDZ (ES default + /en/ + /pt/)', () => {
  const BASE = 'https://mdzrentacar.com'

  it('agrupa canibalización real solo entre URLs del mismo idioma', () => {
    const rows = [
      row('alquiler de autos mendoza', `${BASE}/autos`,  { clicks: 30, impressions: 400, ctr: 0.075, position: 3 }),
      row('alquiler de autos mendoza', `${BASE}/flota`,  { clicks: 10, impressions: 300, ctr: 0.033, position: 6 }),
    ]
    const { conflicts, hreflangIssues } = groupConflicts(rows)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].query).toBe('alquiler de autos mendoza')
    expect(conflicts[0].language).toBe('default')
    expect(hreflangIssues).toHaveLength(0)
  })

  it('separa URLs de distinto idioma como hallazgo de hreflang, no canibalización', () => {
    const rows = [
      row('car rental mendoza', `${BASE}/autos`,    { clicks: 15, impressions: 300, position: 4 }), // default/ES
      row('car rental mendoza', `${BASE}/en/cars`,  { clicks: 25, impressions: 350, position: 2 }), // en
    ]
    const { conflicts, hreflangIssues } = groupConflicts(rows)
    expect(conflicts).toHaveLength(0)
    expect(hreflangIssues).toHaveLength(1)
    expect(hreflangIssues[0].urls.map(u => u.language).sort()).toEqual(['default', 'en'])
  })

  it('detecta cannibalización same-language anidada dentro de un hallazgo de hreflang', () => {
    const rows = [
      row('aluguel de carros mendoza', `${BASE}/autos`,         { clicks: 5,  impressions: 200, position: 8 }), // default
      row('aluguel de carros mendoza', `${BASE}/pt/carros`,     { clicks: 20, impressions: 300, position: 2 }), // pt
      row('aluguel de carros mendoza', `${BASE}/pt/carros-2`,   { clicks: 8,  impressions: 150, position: 5 }), // pt también
    ]
    const { conflicts, hreflangIssues } = groupConflicts(rows)
    expect(hreflangIssues).toHaveLength(1) // default vs pt
    expect(conflicts).toHaveLength(1) // las 2 URLs /pt/ compiten entre sí
    expect(conflicts[0].language).toBe('pt')
    expect(conflicts[0].urls).toHaveLength(2)
  })

  it('excluye ?page_id=0 y slugs numéricos como URLs indexadas por error, fuera de severidad/impresiones en riesgo', () => {
    const rows = [
      row('mdz rent a car', `${BASE}/?page_id=0`,       { clicks: 2, impressions: 500, position: 15 }),
      row('mdz rent a car', `${BASE}/en/19947-2/`,      { clicks: 1, impressions: 450, position: 20 }),
      row('mdz rent a car', `${BASE}/autos`,            { clicks: 40, impressions: 600, position: 2 }),
    ]
    const { conflicts, indexedByMistake, trafficAtRisk } = groupConflicts(rows)
    const junkUrls = indexedByMistake.map(j => j.url)
    expect(junkUrls).toContain(`${BASE}/?page_id=0`)
    expect(junkUrls).toContain(`${BASE}/en/19947-2/`)
    // Con las junk URLs afuera, "mdz rent a car" queda con una sola URL real → no es conflicto.
    expect(conflicts.find(c => c.query === 'mdz rent a car')).toBeUndefined()
    expect(trafficAtRisk).not.toBeGreaterThanOrEqual(500) // las impresiones de las junk no cuentan
  })

  it('descarta queries con menos de 50 impresiones totales', () => {
    const rows = [
      row('query rara', `${BASE}/a`, { clicks: 1, impressions: 10, position: 10 }),
      row('query rara', `${BASE}/b`, { clicks: 1, impressions: 10, position: 12 }),
    ]
    const { conflicts, hreflangIssues } = groupConflicts(rows)
    expect(conflicts).toHaveLength(0)
    expect(hreflangIssues).toHaveLength(0)
  })

  it('URL protegida entre las secundarias: no se recomienda 301/noindex para ella', () => {
    const rows = [
      row('alquiler de autos mendoza', `${BASE}/autos`,  { clicks: 30, impressions: 400, position: 3 }),
      row('alquiler de autos mendoza', `${BASE}/flota`,  { clicks: 10, impressions: 300, position: 6 }),
    ]
    const { conflicts } = groupConflicts(rows, { protectedUrls: [`${BASE}/flota`] })
    expect(conflicts).toHaveLength(1)
    const { recommendation } = conflicts[0]
    expect(recommendation.mainUrl).toBe(`${BASE}/autos`)
    expect(recommendation.protectedUrls).toContain(`${BASE}/flota`)
    expect(recommendation.steps.some(s => /301.*flota/.test(s))).toBe(false)
    expect(recommendation.steps.some(s => /protegida/i.test(s))).toBe(true)
  })

  it('con languageFilter activo, restringe conflictos a ese idioma y no genera hreflang', () => {
    const rows = [
      row('car rental mendoza', `${BASE}/autos`,       { clicks: 15, impressions: 300, position: 4 }), // default
      row('car rental mendoza', `${BASE}/en/cars`,     { clicks: 25, impressions: 350, position: 2 }), // en
      row('car rental mendoza', `${BASE}/en/cars-2`,   { clicks: 10, impressions: 200, position: 5 }), // en también
    ]
    const { conflicts, hreflangIssues } = groupConflicts(rows, { languageFilter: 'en' })
    expect(hreflangIssues).toHaveLength(0)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].language).toBe('en')
    expect(conflicts[0].urls).toHaveLength(2)
  })

  it('respeta languageOverrides (ej. idioma detectado por fetch de html lang) en vez de default', () => {
    const rows = [
      row('aluguel carros', `${BASE}/sem-prefixo`,  { clicks: 20, impressions: 300, position: 2 }),
      row('aluguel carros', `${BASE}/pt/carros`,    { clicks: 10, impressions: 250, position: 4 }),
    ]
    const languageOverrides = new Map([[`${BASE}/sem-prefixo`, 'pt']])
    const { conflicts, hreflangIssues } = groupConflicts(rows, { languageOverrides })
    // Ambas quedan como 'pt' gracias al override → conflicto real, no hreflang.
    expect(hreflangIssues).toHaveLength(0)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].language).toBe('pt')
  })
})
