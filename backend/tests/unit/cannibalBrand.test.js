const {
  suggestBrandTerms, isBrandQuery, splitBrandConflicts, brandNameTokens,
} = require('../../src/lib/cannibalBrand')

const PROJECT = { projectName: 'MDZ Rent a Car', websiteUrl: 'https://mdzrentacar.com' }

describe('brandNameTokens', () => {
  it('junta los tokens del nombre y del dominio', () => {
    expect(brandNameTokens(PROJECT)).toEqual(expect.arrayContaining(['mdz', 'rent', 'car', 'mdzrentacar']))
  })

  it('sin nombre ni dominio devuelve vacío', () => {
    expect(brandNameTokens({})).toEqual([])
  })
})

describe('suggestBrandTerms', () => {
  const rows = [
    { query: 'mdz rent a car',        impressions: 400 },
    { query: 'mdzrentacar',           impressions: 150 },
    { query: 'mdz rentacar mendoza',  impressions: 60 },
    { query: 'alquiler de autos mendoza', impressions: 2000 },
    { query: 'rent a car mendoza',    impressions: 900 },
    { query: 'mdz',                   impressions: 293 },
  ]

  it('sugiere las frases que contienen el nombre del negocio, con sus impresiones', () => {
    const out = suggestBrandTerms(rows, PROJECT)
    const terms = out.map(s => s.term)
    expect(terms).toContain('mdz rent a car')
    expect(terms).toContain('mdzrentacar')
    expect(out.find(s => s.term === 'mdz rent a car').impressions).toBe(400)
  })

  it('NO sugiere la búsqueda genérica del rubro', () => {
    const terms = suggestBrandTerms(rows, PROJECT).map(s => s.term)
    expect(terms).not.toContain('alquiler de autos mendoza')
    expect(terms).not.toContain('rent a car mendoza')
  })

  it('"mdz" solo NO se sugiere: es el código IATA del aeropuerto y sinónimo de Mendoza', () => {
    // Corrección explícita del caso reportado: "mdz" no es la marca. Si se cargara como
    // término de marca, se perdería del análisis una búsqueda genérica del rubro.
    const terms = suggestBrandTerms(rows, PROJECT).map(s => s.term)
    expect(terms).not.toContain('mdz')
  })

  it('las frases más inequívocas van primero', () => {
    const out = suggestBrandTerms(rows, PROJECT)
    expect(out[0].term).toBe('mdz rent a car')
    expect(out.every(s => s.doubtful === false)).toBe(true)
  })

  it('una marca corta y distintiva sí se sugiere, pero marcada como dudosa', () => {
    // "kai" no es genérica, pero una palabra de 3 letras puede ser cualquier cosa:
    // la decisión queda en la persona.
    const out = suggestBrandTerms(
      [{ query: 'kai', impressions: 500 }, { query: 'kai muebles', impressions: 120 }],
      { projectName: 'Kai', websiteUrl: 'https://kai.com.ar' },
    )
    const kai = out.find(s => s.term === 'kai')
    expect(kai.doubtful).toBe(true)
    expect(out[0].doubtful).toBe(false) // "kai muebles" primero
  })

  it('no repite lo ya confirmado', () => {
    const terms = suggestBrandTerms(rows, { ...PROJECT, existing: ['MDZ Rent a Car'] }).map(s => s.term)
    expect(terms).not.toContain('mdz rent a car')
  })

  it('un nombre enteramente genérico no produce sugerencias (no hay token distintivo)', () => {
    const out = suggestBrandTerms(rows, { projectName: 'Rent a Car', websiteUrl: 'https://rentacar.com' })
    expect(out).toEqual([])
  })
})

describe('isBrandQuery', () => {
  const terms = ['mdz rent a car', 'mdzrentacar']

  it('la marca sola es búsqueda de marca', () => {
    expect(isBrandQuery('mdz rent a car', terms)).toBe(true)
    expect(isBrandQuery('MDZ Rent a Car', terms)).toBe(true)
    expect(isBrandQuery('mdzrentacar', terms)).toBe(true)
  })

  it('la marca + intención propia NO es búsqueda de marca', () => {
    expect(isBrandQuery('mdz rent a car aeropuerto', terms)).toBe(false)
    expect(isBrandQuery('mdz rent a car opiniones', terms)).toBe(false)
  })

  it('una búsqueda sin la marca no es de marca', () => {
    expect(isBrandQuery('alquiler de autos mendoza', terms)).toBe(false)
  })

  it('sin términos cargados, nada es de marca', () => {
    expect(isBrandQuery('mdz rent a car', [])).toBe(false)
  })

  it('quita primero los términos largos (un término corto no tapa al largo)', () => {
    expect(isBrandQuery('mdz rent a car', ['car', 'mdz rent a car'])).toBe(true)
  })
})

describe('splitBrandConflicts', () => {
  const BASE = 'https://mdzrentacar.com'
  function conflict(query, urls) {
    return {
      query, language: 'default', totalImpressions: urls.reduce((s, u) => s + u.impressions, 0),
      urls: urls.map(u => ({ ...u, clicks: 0, position: 5 })),
    }
  }
  const brandTerms = ['mdz rent a car']

  it('saca las de marca de la lista de conflictos', () => {
    const marca   = conflict('mdz rent a car', [{ url: `${BASE}/`, impressions: 300 }, { url: `${BASE}/contacto`, impressions: 100 }])
    const normal  = conflict('alquiler de autos', [{ url: `${BASE}/autos`, impressions: 400 }, { url: `${BASE}/flota`, impressions: 300 }])
    const { conflicts, brandQueries } = splitBrandConflicts([marca, normal], { brandTerms })
    expect(conflicts).toEqual([normal])
    expect(brandQueries).toHaveLength(1)
    expect(brandQueries[0].query).toBe('mdz rent a car')
  })

  it('con URL de marca esperada, avisa si gana otra', () => {
    const marca = conflict('mdz rent a car', [{ url: `${BASE}/contacto`, impressions: 300 }, { url: `${BASE}/`, impressions: 100 }])
    const { brandQueries } = splitBrandConflicts([marca], { brandTerms, brandUrl: `${BASE}/` })
    expect(brandQueries[0].ok).toBe(false)
    expect(brandQueries[0].note).toMatch(/en lugar de la URL esperada/)
    expect(brandQueries[0].note).not.toMatch(/301|consolidar en/i)
  })

  it('si gana la esperada, no hay nada que hacer', () => {
    const marca = conflict('mdz rent a car', [{ url: `${BASE}/`, impressions: 300 }, { url: `${BASE}/contacto`, impressions: 100 }])
    const { brandQueries } = splitBrandConflicts([marca], { brandTerms, brandUrl: `${BASE}` })
    expect(brandQueries[0].ok).toBe(true)
    expect(brandQueries[0].note).toMatch(/Nada que hacer/)
  })

  it('nunca recomienda consolidar ni canonical en una búsqueda de marca', () => {
    const marca = conflict('mdz rent a car', [{ url: `${BASE}/`, impressions: 300 }, { url: `${BASE}/contacto`, impressions: 100 }])
    const { brandQueries } = splitBrandConflicts([marca], { brandTerms })
    expect(brandQueries[0].note).not.toMatch(/canonical|301|noindex/i)
  })

  it('sin términos cargados no cambia nada', () => {
    const normal = conflict('alquiler de autos', [{ url: `${BASE}/autos`, impressions: 400 }, { url: `${BASE}/flota`, impressions: 300 }])
    const out = splitBrandConflicts([normal], { brandTerms: [] })
    expect(out.conflicts).toEqual([normal])
    expect(out.brandQueries).toEqual([])
  })
})
