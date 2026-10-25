const { extractPageData, pickExtraSeeds } = require('../../src/services/geoAudit.service')

describe('extractPageData — descubrimiento de enlaces internos', () => {
  it('detecta links que viven SOLO en <nav>/<header>/<footer> (ej. "Contacto" del menú) — antes se perdían porque se extraían después de limpiar esos tags', () => {
    const html = `<html><head><title>x</title></head><body>
      <header><nav><a href="/contacto/">Contacto</a><a href="/sobre-nosotros/">Sobre nosotros</a></nav></header>
      <main><h1>Inicio</h1><p>${'contenido '.repeat(40)}</p></main>
      <footer><a href="/condiciones/">Condiciones</a></footer>
      </body></html>`
    const data = extractPageData(html, 'https://x.com/')
    expect(data.internalLinks).toEqual(expect.arrayContaining([
      'https://x.com/contacto/',
      'https://x.com/sobre-nosotros/',
      'https://x.com/condiciones/',
    ]))
  })

  it('colapsa variantes de query string de la misma página en una sola entrada (ej. ?view=cardetails&carid=N)', () => {
    const links = Array.from({ length: 28 }, (_, i) => `<a href="/autos/?view=cardetails&carid=${i}">Auto ${i}</a>`).join('')
    const html = `<html><head><title>x</title></head><body><h1>Inicio</h1>${links}<a href="/sobre-nosotros/">Sobre nosotros</a></body></html>`
    const data = extractPageData(html, 'https://x.com/')
    expect(data.internalLinks).toEqual(['https://x.com/autos/', 'https://x.com/sobre-nosotros/'])
  })

  it('quita el hash de los links internos (no cuenta #section1 y #section2 como páginas distintas)', () => {
    const html = `<html><head><title>x</title></head><body><h1>Inicio</h1>
      <a href="/pagina#section1">A</a><a href="/pagina#section2">B</a></body></html>`
    const data = extractPageData(html, 'https://x.com/')
    expect(data.internalLinks).toEqual(['https://x.com/pagina'])
  })
})

describe('pickExtraSeeds', () => {
  const seedUrl = 'https://x.com/'
  const origin  = 'https://x.com'

  it('prioriza páginas que matchean el patrón NAP (contacto/sobre-nosotros) sobre el resto', () => {
    const links = ['https://x.com/flota/', 'https://x.com/contacto/', 'https://x.com/promos/']
    expect(pickExtraSeeds(links, seedUrl, origin, 2)).toEqual([
      'https://x.com/contacto',
      'https://x.com/flota',
    ])
  })

  it('no desperdicia un slot repitiendo el propio home como candidato', () => {
    const links = ['https://x.com/', 'https://x.com/contacto/', 'https://x.com/flota/']
    const seeds = pickExtraSeeds(links, seedUrl, origin, 2)
    expect(seeds).not.toContain('https://x.com/')
    expect(seeds).toEqual(['https://x.com/contacto', 'https://x.com/flota'])
  })

  it('respeta el tope `max`', () => {
    const links = ['https://x.com/a/', 'https://x.com/b/', 'https://x.com/c/', 'https://x.com/contacto/']
    expect(pickExtraSeeds(links, seedUrl, origin, 1)).toEqual(['https://x.com/contacto'])
  })
})
