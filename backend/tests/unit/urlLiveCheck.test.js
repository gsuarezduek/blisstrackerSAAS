const {
  parseHtmlSignals, sameTarget, liveVerdict, hreflangVerdict, selfDeclaredLang, readHeadFromStream,
} = require('../../src/lib/urlLiveCheck')

const BASE = 'https://mdzrentacar.com'

describe('parseHtmlSignals', () => {
  it('lee canonical, noindex y hreflang, resolviendo URLs relativas', () => {
    const html = `
      <html><head>
        <link rel="canonical" href="/autos/" />
        <meta name="robots" content="index, follow" />
        <link rel="alternate" hreflang="es" href="/autos/" />
        <link rel="alternate" hreflang="en" href="https://mdzrentacar.com/en/cars/" />
        <link rel="alternate" hreflang="x-default" href="/autos/" />
      </head><body></body></html>`
    const out = parseHtmlSignals(html, `${BASE}/autos/`)
    expect(out.canonical).toBe(`${BASE}/autos/`)
    expect(out.noindex).toBe(false)
    expect(out.hreflang.map(h => h.lang)).toEqual(['es', 'en', 'x-default'])
    expect(out.hreflang[0].href).toBe(`${BASE}/autos/`)
  })

  it('detecta noindex, también el de googlebot', () => {
    expect(parseHtmlSignals('<meta name="robots" content="noindex,follow">', BASE).noindex).toBe(true)
    expect(parseHtmlSignals('<meta name="googlebot" content="noindex">', BASE).noindex).toBe(true)
  })

  it('un HTML vacío o basura no lanza', () => {
    expect(parseHtmlSignals('', BASE).canonical).toBeNull()
    expect(parseHtmlSignals(null, BASE).hreflang).toEqual([])
  })
})

describe('sameTarget', () => {
  it('ignora esquema, www, barra final y mayúsculas de host', () => {
    expect(sameTarget('https://mdzrentacar.com/autos', 'http://www.MDZrentacar.com/autos/')).toBe(true)
  })
  it('distingue paths distintos', () => {
    expect(sameTarget(`${BASE}/autos`, `${BASE}/flota`)).toBe(false)
  })
})

describe('liveVerdict', () => {
  const otherUrls = [`${BASE}/autos`]

  it('un 301 hacia la principal marca el conflicto como ya arreglado', () => {
    // El caso reportado: la URL redirige desde hace 40 días y el sistema la seguía
    // recomendando porque Search Console mira hacia atrás.
    const v = liveVerdict({ url: `${BASE}/flota`, status: 301, redirectedTo: `${BASE}/autos` }, { otherUrls })
    expect(v.state).toBe('redirect_to_other')
    expect(v.fixed).toBe(true)
    expect(v.target).toBe(`${BASE}/autos`)
  })

  it('un redirect a otra parte también está arreglado, pero se dice a dónde fue', () => {
    const v = liveVerdict({ url: `${BASE}/flota`, status: 302, redirectedTo: `${BASE}/otra` }, { otherUrls })
    expect(v.state).toBe('redirect_elsewhere')
    expect(v.fixed).toBe(true)
  })

  it('un 404 o 410 ya no es un pendiente', () => {
    expect(liveVerdict({ status: 404 }, { otherUrls }).fixed).toBe(true)
    expect(liveVerdict({ status: 410 }, { otherUrls }).fixed).toBe(true)
  })

  it('un canonical hacia la principal cuenta como resuelto', () => {
    const v = liveVerdict({ url: `${BASE}/flota`, status: 200, canonical: `${BASE}/autos` }, { otherUrls })
    expect(v.state).toBe('canonical_to_other')
    expect(v.fixed).toBe(true)
  })

  it('un canonical hacia una tercera página se informa pero NO se da por resuelto', () => {
    const v = liveVerdict({ url: `${BASE}/flota`, status: 200, canonical: `${BASE}/tercera` }, { otherUrls })
    expect(v.state).toBe('canonical_elsewhere')
    expect(v.fixed).toBe(false)
  })

  it('un canonical a sí misma es lo normal, no un hallazgo', () => {
    const v = liveVerdict({ url: `${BASE}/flota`, status: 200, canonical: `${BASE}/flota/` }, { otherUrls })
    expect(v.state).toBe('live')
  })

  it('noindex cuenta como resuelto', () => {
    expect(liveVerdict({ url: `${BASE}/flota`, status: 200, noindex: true }, { otherUrls }).fixed).toBe(true)
  })

  it('un 500 no se da por arreglado: no se sabe', () => {
    const v = liveVerdict({ url: `${BASE}/flota`, status: 503 }, { otherUrls })
    expect(v.state).toBe('server_error')
    expect(v.fixed).toBe(false)
  })

  it('si el chequeo falló, no se concluye nada', () => {
    const v = liveVerdict({ url: `${BASE}/flota`, error: 'timeout' }, { otherUrls })
    expect(v.state).toBe('unknown')
    expect(v.fixed).toBe(false)
  })
})

describe('hreflangVerdict', () => {
  function page(url, language, hreflang, canonical) {
    return { url, language, check: { url, status: 200, error: null, hreflang, canonical: canonical ?? url } }
  }

  const es = `${BASE}/autos`
  const en = `${BASE}/en/cars`

  it('etiquetas correctas y recíprocas: NO es un hallazgo', () => {
    const v = hreflangVerdict([
      page(es, 'default', [{ lang: 'es', href: es }, { lang: 'en', href: en }]),
      page(en, 'en',      [{ lang: 'es', href: es }, { lang: 'en', href: en }]),
    ])
    expect(v.checked).toBe(true)
    expect(v.ok).toBe(true)
    expect(v.problems).toEqual([])
  })

  it('detecta la falta de autorreferencia', () => {
    const v = hreflangVerdict([
      page(es, 'default', [{ lang: 'en', href: en }]),
      page(en, 'en',      [{ lang: 'es', href: es }, { lang: 'en', href: en }]),
    ])
    expect(v.problems.some(p => p.type === 'no_self' && p.url === es)).toBe(true)
  })

  it('detecta el vínculo que no vuelve', () => {
    const v = hreflangVerdict([
      page(es, 'default', [{ lang: 'es', href: es }, { lang: 'en', href: en }]),
      page(en, 'en',      [{ lang: 'en', href: en }]),
    ])
    expect(v.ok).toBe(false)
    expect(v.problems.some(p => p.type === 'not_reciprocal' || p.type === 'not_declared')).toBe(true)
  })

  it('sin etiquetas en una versión, el problema es "falta"', () => {
    const v = hreflangVerdict([
      page(es, 'default', []),
      page(en, 'en',      [{ lang: 'es', href: es }, { lang: 'en', href: en }]),
    ])
    expect(v.problems.some(p => p.type === 'missing' && p.url === es)).toBe(true)
  })

  it('si no se pudieron leer las dos páginas, no se afirma nada', () => {
    const v = hreflangVerdict([page(es, 'default', []), { url: en, language: 'en', check: { error: 'timeout' } }])
    expect(v.checked).toBe(false)
    expect(v.problems).toEqual([])
  })
})


// ─────────────────────────────────────────────────────────────────────────────
//  hreflang: los falsos positivos reportados
// ─────────────────────────────────────────────────────────────────────────────

describe('hreflangVerdict — falsos positivos reportados', () => {
  const ES  = `${BASE}/alquiler-autos-mendoza/`
  const EN1 = `${BASE}/en/car-rental-mendoza/`
  const EN2 = `${BASE}/en/mendoza-airport-car-rental/`
  const TAGS = [{ lang: 'es', href: ES }, { lang: 'en', href: EN1 }]

  function page(url, language, hreflang, canonical) {
    return { url, language, check: { url, status: 200, error: null, hreflang, canonical: canonical ?? url } }
  }

  it('dos URLs del MISMO idioma no se exigen hreflang entre sí', () => {
    // El caso reportado: decía que /en/car-rental-mendoza/ no declara
    // /en/mendoza-airport-car-rental/ — y no tiene por qué: no son traducciones entre sí,
    // son dos páginas en inglés. Que compitan por la keyword es canibalización.
    const v = hreflangVerdict([
      page(ES, 'default', TAGS),
      page(EN1, 'en', TAGS),
      page(EN2, 'en', [{ lang: 'en', href: EN2 }]),
    ])
    expect(v.checked).toBe(true)
    expect(v.ok).toBe(true)
    expect(v.problems).toEqual([])
  })

  it('una página con canonical hacia otra URL se saltea, con el motivo', () => {
    // El otro caso reportado: /alquilar-autos-en-mendoza/ tiene canonical a / a propósito,
    // así que no es la versión canónica y no se le exige hreflang.
    const v = hreflangVerdict([
      page(ES, 'default', TAGS),
      page(`${BASE}/alquilar-autos-en-mendoza/`, 'default', [], `${BASE}/`),
    ])
    expect(v.problems).toEqual([])
    expect(v.skipped).toHaveLength(1)
    expect(v.skipped[0].reason).toMatch(/canonical/)
  })

  it('declarar el idioma del otro pero hacia otra URL es una nota, no un problema', () => {
    const otraEn = `${BASE}/en/otra-pagina/`
    const v = hreflangVerdict([
      page(ES, 'default', TAGS),
      page(otraEn, 'en', [{ lang: 'en', href: otraEn }, { lang: 'es', href: `${BASE}/otra/` }]),
    ])
    expect(v.problems.filter(p => p.type === 'lang_not_declared')).toEqual([])
    expect(v.notes.some(n => n.type === 'points_elsewhere')).toBe(true)
  })

  it('un problema real sigue saliendo: no declara ninguna versión en ese idioma', () => {
    const v = hreflangVerdict([
      page(ES, 'default', TAGS),
      page(EN1, 'en', [{ lang: 'fr', href: `${BASE}/fr/` }]),
    ])
    expect(v.ok).toBe(false)
    expect(v.problems.map(p => p.type)).toContain('lang_not_declared')
  })

  it('el idioma del grupo "default" se deduce de su propia autorreferencia', () => {
    expect(selfDeclaredLang(page(ES, 'default', TAGS))).toBe('es')
    expect(selfDeclaredLang(page(ES, 'default', [{ lang: 'x-default', href: ES }]))).toBeNull()
  })
})


describe('readHeadFromStream — por qué no se usa maxContentLength', () => {
  const { Readable } = require('stream')

  it('corta en </head> sin esperar el resto del documento', async () => {
    // De la red el cuerpo llega en varios chunks, y el corte pasa entre chunks: con el
    // documento entero en uno solo no hay nada que cortar.
    const head = '<html><head><link rel="canonical" href="/x"></head>'
    const resto = Array.from({ length: 20 }, () => 'a'.repeat(1000))
    const out = await readHeadFromStream(Readable.from([head, ...resto]))
    expect(out).toContain('</head>')
    expect(out.length).toBeLessThan(head.length + 20_000)
  })

  it('un documento más grande que el tope NO lanza: devuelve lo leído', async () => {
    // maxContentLength de axios lanza en vez de truncar: con un tope de 400 KB la home
    // de 452 KB fallaba siempre y quedaba como status null → veredicto unknown.
    const big = '<html><body>' + 'b'.repeat(900) // sin </head>
    const out = await readHeadFromStream(Readable.from([big]), 500)
    expect(out.length).toBeGreaterThan(0)
  })

  it('un stream que falla a mitad no pierde lo ya leído', async () => {
    const stream = new Readable({ read() { this.push('<html><head>'); this.destroy(new Error('socket')) } })
    await expect(readHeadFromStream(stream)).resolves.toContain('<head>')
  })
})
