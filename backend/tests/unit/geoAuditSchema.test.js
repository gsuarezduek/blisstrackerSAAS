const { flattenJsonLd, extractPageData } = require('../../src/services/geoAudit.service')

describe('flattenJsonLd', () => {
  it('un objeto plano (sin @graph) se devuelve tal cual, envuelto en array', () => {
    const obj = { '@type': 'FAQPage', '@context': 'https://schema.org' }
    expect(flattenJsonLd(obj)).toEqual([obj])
  })

  it('desarma un wrapper @graph (Yoast/RankMath/AIOSEO) en sus entidades individuales', () => {
    const org = { '@type': ['AutoRental', 'Organization'], name: 'MDZ Rent a Car' }
    const site = { '@type': 'WebSite', name: 'MDZ Rent a Car' }
    const wrapper = { '@context': 'https://schema.org', '@graph': [org, site] }
    expect(flattenJsonLd(wrapper)).toEqual([org, site])
  })

  it('tolera un array en el nivel superior, mezclando objetos planos y con @graph', () => {
    const faq = { '@type': 'FAQPage' }
    const org = { '@type': 'Organization' }
    const wrapper = { '@graph': [org] }
    expect(flattenJsonLd([faq, wrapper])).toEqual([faq, org])
  })

  it('tolera entradas null/undefined dentro del array', () => {
    expect(flattenJsonLd([null, { '@type': 'WebSite' }])).toEqual([{ '@type': 'WebSite' }])
  })
})

describe('extractPageData — detección de schemas JSON-LD', () => {
  function htmlWithJsonLd(scripts) {
    const blocks = scripts.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n')
    return `<html><head><title>Test</title>${blocks}</head><body><h1>Hola</h1><p>${'palabra '.repeat(60)}</p></body></html>`
  }

  it('detecta Organization/WebSite/Person aunque vengan dentro de un wrapper @graph (caso real: mdzrentacar.com)', () => {
    const html = htmlWithJsonLd([
      {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': ['AutoRental', 'Organization'], '@id': 'https://x.com/#organization', name: 'MDZ Rent a Car', aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.5' } },
          { '@type': 'WebSite', '@id': 'https://x.com/#website', name: 'MDZ Rent a Car' },
          { '@type': 'Person', '@id': 'https://x.com/author/gaston/', name: 'Gastón' },
        ],
      },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [] },
    ])

    const data = extractPageData(html, 'https://x.com/')

    expect(data.schemaTypes).toEqual(expect.arrayContaining(['AutoRental', 'Organization', 'WebSite', 'Person', 'FAQPage']))
    // 4 entidades del @graph + 1 FAQPage suelto = 5 schemas, no 2 (los 2 <script> originales)
    expect(data.schemas).toHaveLength(4)
  })

  it('sigue funcionando con el formato "clásico" (un @type por bloque, sin @graph)', () => {
    const html = htmlWithJsonLd([
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme' },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [] },
    ])

    const data = extractPageData(html, 'https://x.com/')

    expect(data.schemaTypes).toEqual(expect.arrayContaining(['Organization', 'FAQPage']))
    expect(data.schemas).toHaveLength(2)
  })

  it('sin JSON-LD no rompe, devuelve arrays vacíos', () => {
    const data = extractPageData('<html><head><title>x</title></head><body><h1>Hola</h1></body></html>', 'https://x.com/')
    expect(data.schemas).toEqual([])
    expect(data.schemaTypes).toEqual([])
  })

  it('un bloque JSON-LD roto no tira abajo la extracción (try/catch por bloque)', () => {
    const html = `<html><head><title>x</title>
      <script type="application/ld+json">{ esto no es json }</script>
      <script type="application/ld+json">${JSON.stringify({ '@type': 'WebSite' })}</script>
      </head><body><h1>Hola</h1></body></html>`
    const data = extractPageData(html, 'https://x.com/')
    expect(data.schemaTypes).toEqual(['WebSite'])
  })
})
