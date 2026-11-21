const {
  impliedTypes, expandTypes, hasSchemaType, missingSchemaTypes, isOrgLikeSchema,
} = require('../../src/lib/schemaOrgTypes')

describe('impliedTypes', () => {
  it('un subtipo de LocalBusiness implica LocalBusiness y Organization', () => {
    // El caso real: mdzrentacar.com declara AutoRental y el análisis reportaba
    // "no se detectó ningún schema de negocio".
    expect(impliedTypes('AutoRental')).toEqual(['AutoRental', 'LocalBusiness', 'Organization'])
  })

  it('LocalBusiness implica Organization', () => {
    expect(impliedTypes('LocalBusiness')).toEqual(['LocalBusiness', 'Organization'])
  })

  it('un subtipo de Organization que no es LocalBusiness no implica LocalBusiness', () => {
    const t = impliedTypes('NGO')
    expect(t).toContain('Organization')
    expect(t).not.toContain('LocalBusiness')
  })

  it('BlogPosting implica Article', () => {
    expect(impliedTypes('BlogPosting')).toContain('Article')
  })

  it('Car implica Product', () => {
    expect(impliedTypes('Car')).toContain('Product')
  })

  it('un tipo desconocido se devuelve solo, sin inventar jerarquía', () => {
    expect(impliedTypes('TipoRaro')).toEqual(['TipoRaro'])
  })

  it('vacío o nulo no lanza', () => {
    expect(impliedTypes('')).toEqual([])
    expect(impliedTypes(null)).toEqual([])
  })
})

describe('hasSchemaType / missingSchemaTypes', () => {
  it('reconoce el tipo puesto con un subtipo más específico', () => {
    expect(hasSchemaType(['AutoRental', 'WebSite'], 'LocalBusiness')).toBe(true)
    expect(hasSchemaType(['AutoRental', 'WebSite'], 'Organization')).toBe(true)
  })

  it('no reconoce lo que efectivamente no está', () => {
    expect(hasSchemaType(['AutoRental'], 'FAQPage')).toBe(false)
  })

  it('los faltantes salen sin los que están cubiertos por subtipo', () => {
    const missing = missingSchemaTypes(
      ['AutoRental', 'WebSite', 'BlogPosting'],
      ['Organization', 'WebSite', 'Article', 'FAQPage', 'BreadcrumbList', 'LocalBusiness'],
    )
    expect(missing).toEqual(['FAQPage', 'BreadcrumbList'])
  })

  it('sin ningún tipo detectado, faltan todos', () => {
    expect(missingSchemaTypes([], ['Organization', 'WebSite'])).toEqual(['Organization', 'WebSite'])
  })
})

describe('isOrgLikeSchema', () => {
  it('detecta la entidad del negocio por subtipo', () => {
    expect(isOrgLikeSchema({ '@type': 'AutoRental', name: 'MDZ' })).toBe(true)
    expect(isOrgLikeSchema({ '@type': ['Organization', 'LocalBusiness'] })).toBe(true)
    expect(isOrgLikeSchema({ '@type': 'Hotel' })).toBe(true)
  })

  it('no confunde otros nodos del @graph', () => {
    expect(isOrgLikeSchema({ '@type': 'WebSite' })).toBe(false)
    expect(isOrgLikeSchema({ '@type': 'BreadcrumbList' })).toBe(false)
    expect(isOrgLikeSchema({})).toBe(false)
    expect(isOrgLikeSchema(null)).toBe(false)
  })
})

describe('expandTypes', () => {
  it('acepta un string suelto además de un array', () => {
    expect([...expandTypes('AutoRental')]).toContain('Organization')
  })
})
