const { flattenJsonLd, extractPageData, buildPrompt } = require('../../src/services/geoAudit.service')

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

describe('extractPageData — orgFields (campos reales del Organization/LocalBusiness, para que la IA no los invente)', () => {
  function htmlWithJsonLd(scripts) {
    const blocks = scripts.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n')
    return `<html><head><title>Test</title>${blocks}</head><body><h1>Hola</h1></body></html>`
  }

  it('null cuando no hay ningún schema Organization/LocalBusiness', () => {
    const html = htmlWithJsonLd([{ '@type': 'FAQPage' }])
    expect(extractPageData(html, 'https://x.com/').orgFields).toBeNull()
  })

  it('reporta true solo en los campos que realmente están presentes (caso real: Organization completo de mdzrentacar.com)', () => {
    const html = htmlWithJsonLd([{
      '@context': 'https://schema.org',
      '@graph': [{
        '@type': ['AutoRental', 'Organization'],
        name: 'MDZ Rent a Car',
        logo: { '@type': 'ImageObject', url: 'https://x.com/logo.png' },
        email: 'contacto@x.com',
        telephone: '+54 9 261 230-6787',
        address: { '@type': 'PostalAddress', streetAddress: 'Martín Zapata 355' },
        sameAs: ['https://facebook.com/x', 'https://instagram.com/x'],
        foundingDate: '2003',
        aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.5' },
      }],
    }])
    expect(extractPageData(html, 'https://x.com/').orgFields).toEqual({
      name: true, logo: true, email: true, telephone: true,
      address: true, sameAs: true, foundingDate: true, aggregateRating: true,
    })
  })

  it('reporta false en los campos que realmente faltan, sin inventar', () => {
    const html = htmlWithJsonLd([{ '@type': 'Organization', name: 'Acme' }])
    expect(extractPageData(html, 'https://x.com/').orgFields).toEqual({
      name: true, logo: false, email: false, telephone: false,
      address: false, sameAs: false, foundingDate: false, aggregateRating: false,
    })
  })

  it('un sameAs vacío ([]) cuenta como ausente, no presente', () => {
    const html = htmlWithJsonLd([{ '@type': 'Organization', name: 'Acme', sameAs: [] }])
    expect(extractPageData(html, 'https://x.com/').orgFields.sameAs).toBe(false)
  })

  it('también reconoce LocalBusiness, no solo Organization', () => {
    const html = htmlWithJsonLd([{ '@type': 'LocalBusiness', name: 'Acme', telephone: '123' }])
    const fields = extractPageData(html, 'https://x.com/').orgFields
    expect(fields.name).toBe(true)
    expect(fields.telephone).toBe(true)
  })
})

describe('buildPrompt — AUTORÍA se agrega entre el home y las páginas extra (caso real: mdzrentacar.com)', () => {
  const NO_AUTHOR_HTML = '<html><head><title>Home</title></head><body><h1>Hola</h1></body></html>'
  const AUTHOR_HTML = '<html><head><title>Post</title></head><body><h1>Post</h1><span class="byline">Por Gastón</span></body></html>'
  const robotsData = { citation: [], training: [] }
  const llmsData = { exists: false, content: '' }
  const aiDiscovery = { sitemap: { exists: true, status: 200 } }

  it('el home sin autoría pero una página extra CON autoría: el prompt dice "detectada"', () => {
    const home = extractPageData(NO_AUTHOR_HTML, 'https://x.com/')
    const post = extractPageData(AUTHOR_HTML, 'https://x.com/post-real/')
    const prompt = buildPrompt('https://x.com/', home, robotsData, llmsData, aiDiscovery, '', null, [post], [])
    expect(prompt).toMatch(/AUTORÍA: detectada/)
  })

  it('ni el home ni las páginas extra tienen autoría: el prompt dice "NO detectada"', () => {
    const home = extractPageData(NO_AUTHOR_HTML, 'https://x.com/')
    const otherPage = extractPageData(NO_AUTHOR_HTML, 'https://x.com/otra/')
    const prompt = buildPrompt('https://x.com/', home, robotsData, llmsData, aiDiscovery, '', null, [otherPage], [])
    expect(prompt).toMatch(/AUTORÍA: NO detectada/)
  })

  it('sin páginas extra, usa solo el dato del home (comportamiento previo intacto)', () => {
    const home = extractPageData(AUTHOR_HTML, 'https://x.com/')
    const prompt = buildPrompt('https://x.com/', home, robotsData, llmsData, aiDiscovery, '', null, [], [])
    expect(prompt).toMatch(/AUTORÍA: detectada/)
  })
})
