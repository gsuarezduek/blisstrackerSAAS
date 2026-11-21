const {
  parseHtmlSignals, sameTarget, liveVerdict, hreflangVerdict,
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
  function page(url, language, hreflang) {
    return { url, language, check: { url, status: 200, error: null, hreflang } }
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
