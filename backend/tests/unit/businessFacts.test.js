const { buildBusinessFacts, formatBusinessFactsBlock } = require('../../src/lib/businessFacts')

const project = { name: 'MDZ Rent a Car', websiteUrl: 'https://mdzrentacar.com' }

describe('buildBusinessFacts', () => {
  it('toma los datos duros del brief de Marca y del de SEO/SEM', () => {
    const facts = buildBusinessFacts({
      project,
      briefs: [
        { type: 'marca',   answers: { direccion: 'Av. San Martín 100', telefono: '+54 261 555' } },
        { type: 'seo_sem', answers: { zona_geografica: 'Mendoza' } },
      ],
    })
    const byKey = Object.fromEntries(facts.fields.map(f => [f.key, f.value]))
    expect(byKey.direccion).toBe('Av. San Martín 100')
    expect(byKey.telefono).toBe('+54 261 555')
    expect(byKey.zona_geografica).toBe('Mendoza')
    expect(byKey.autor_experto).toBeNull()
  })

  it('horarios y reseñas quedan en null mientras no exista el módulo de Google Mi Negocio', () => {
    const facts = buildBusinessFacts({ project, briefs: [] })
    expect(facts.hours).toBeNull()
    expect(facts.reviews).toBeNull()
  })

  it('cuando llegue Google Mi Negocio, horarios y reseñas entran por ahí', () => {
    const facts = buildBusinessFacts({
      project, briefs: [],
      gbp: { hours: 'Lun a Vie 9-18', reviews: { count: 412, rating: 4.6 } },
    })
    expect(facts.hours).toBe('Lun a Vie 9-18')
    expect(facts.reviews).toEqual({ count: 412, rating: 4.6 })
  })

  it('el NAP del sitio viaja aparte del brief, y descarta filas vacías', () => {
    const facts = buildBusinessFacts({
      project, briefs: [],
      napRows: [
        { url: 'https://mdzrentacar.com', name: 'MDZ Rent a Car', telephone: '+54 261 555', address: 'Mendoza' },
        { url: 'https://mdzrentacar.com/contacto', name: null, telephone: null, address: null },
      ],
    })
    expect(facts.napFromSite).toHaveLength(1)
    expect(facts.napFromSite[0].name).toBe('MDZ Rent a Car')
  })

  it('sin briefs ni NAP no lanza', () => {
    const facts = buildBusinessFacts({})
    expect(facts.name).toBeNull()
    expect(facts.napFromSite).toEqual([])
  })
})

describe('formatBusinessFactsBlock', () => {
  it('separa lo cargado de lo que no se sabe, y prohíbe inventar', () => {
    const block = formatBusinessFactsBlock(buildBusinessFacts({
      project,
      briefs: [{ type: 'marca', answers: { telefono: '+54 261 555' } }],
    }))
    expect(block).toContain('+54 261 555')
    expect(block).toContain('SIN CARGAR')
    expect(block).toContain('Dirección')
    expect(block).toMatch(/Horarios de atención: NO DISPONIBLES/)
    expect(block).toMatch(/Reseñas \(cantidad y promedio\): NO DISPONIBLES/)
    expect(block).toContain('{{HORARIO}}')
  })

  it('avisa explícitamente que un dato sin cargar no es un dato ausente del sitio', () => {
    const block = formatBusinessFactsBlock(buildBusinessFacts({ project, briefs: [] }))
    expect(block).toMatch(/no que el sitio no lo tenga/)
  })
})
