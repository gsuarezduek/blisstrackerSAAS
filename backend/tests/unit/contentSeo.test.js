const {
  normalizeUrl, normalizeKeyword, languageFromUrl, titleFromUrl,
  expectedCtr, deltaPct, trendOf, buildKeywordOwners, computeAlerts,
  parseSitemap, normalizeWpPosts, decodeEntities,
} = require('../../src/lib/contentSeo')

// Métricas de una ventana de 28 días, con los defaults de una nota sana.
const win = (over = {}) => ({ clicks: 0, impressions: 0, ctr: 0, position: 0, ...over })

describe('contentSeo — identidad de una URL', () => {
  it('iguala la misma URL escrita distinto (barra final, mayúsculas del host)', () => {
    expect(normalizeUrl('https://MDZ.com/blog/nota/')).toBe(normalizeUrl('https://mdz.com/blog/nota'))
  })

  it('NO iguala dos notas distintas que comparten prefijo', () => {
    expect(normalizeUrl('https://x.com/blog/nota')).not.toBe(normalizeUrl('https://x.com/blog/nota-2'))
  })

  it('distingue los idiomas de la misma nota (es /en/ es otra URL)', () => {
    expect(normalizeUrl('https://x.com/nota')).not.toBe(normalizeUrl('https://x.com/en/nota'))
  })
})

describe('contentSeo — idioma de una URL', () => {
  it('lee el prefijo de la ruta', () => {
    expect(languageFromUrl('https://x.com/en/alquiler', 'es')).toBe('en')
    expect(languageFromUrl('https://x.com/pt-br/alquiler', 'es')).toBe('pt')
  })

  it('una URL sin prefijo es el idioma principal del sitio, que lo decide el sitio', () => {
    expect(languageFromUrl('https://x.com/alquiler', 'es')).toBe('es')
    expect(languageFromUrl('https://x.com/alquiler', 'en')).toBe('en')
    expect(languageFromUrl('https://x.com/alquiler', null)).toBeNull()
  })

  it('deja el idioma vacío en vez de etiquetar mal lo que no está en el catálogo', () => {
    expect(languageFromUrl('https://x.com/fr/voiture', 'es')).toBeNull()
  })
})

describe('contentSeo — título desde el slug', () => {
  it('convierte el slug en algo legible', () => {
    expect(titleFromUrl('https://x.com/blog/alquiler-de-autos-en-mendoza/')).toBe('Alquiler de autos en mendoza')
  })

  it('aguanta extensiones, guiones bajos y URLs escapadas', () => {
    expect(titleFromUrl('https://x.com/posts/mi_nota.html')).toBe('Mi nota')
    expect(titleFromUrl('https://x.com/blog/c%C3%B3mo-viajar')).toBe('Cómo viajar')
  })
})

describe('contentSeo — CTR esperado por posición', () => {
  it('baja a medida que baja la posición', () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(3))
    expect(expectedCtr(3)).toBeGreaterThan(expectedCtr(9))
  })

  it('fuera de las dos primeras páginas no hay expectativa: el CTR bajo es la posición', () => {
    expect(expectedCtr(15)).toBeGreaterThan(0)
    expect(expectedCtr(34)).toBe(0)
    expect(expectedCtr(0)).toBe(0)
  })
})

describe('contentSeo — variación y tendencia', () => {
  it('sin período anterior no hay variación (y no es 0%)', () => {
    expect(deltaPct(50, null)).toBeNull()
    expect(trendOf({ clicks: 50, prevClicks: null })).toBe('nuevo')
  })

  it('una nota que no existía y ahora tiene clics es +100%, no una división por cero', () => {
    expect(deltaPct(50, 0)).toBe(100)
    expect(deltaPct(0, 0)).toBe(0)
  })

  it('una variación chica es estable: la ventana es móvil y se mueve sola', () => {
    expect(trendOf({ clicks: 103, prevClicks: 100 })).toBe('estable')
    expect(trendOf({ clicks: 140, prevClicks: 100 })).toBe('sube')
    expect(trendOf({ clicks: 60,  prevClicks: 100 })).toBe('baja')
  })
})

describe('contentSeo — alerta de pérdida de tráfico', () => {
  const codes = alerts => alerts.map(a => a.code)

  it('avisa cuando los clics se caen', () => {
    const alerts = computeAlerts({
      pieceId: 1,
      current:  win({ clicks: 20, impressions: 900, ctr: 0.022, position: 6 }),
      previous: win({ clicks: 60, impressions: 950, ctr: 0.063, position: 5 }),
    })
    const losing = alerts.find(a => a.code === 'losing_traffic')
    expect(losing).toBeTruthy()
    expect(losing.severity).toBe('critical') // -66%
    expect(losing.message).toContain('menos de clics')
  })

  it('no avisa por una caída sobre números irrelevantes (2 clics → 1)', () => {
    const alerts = computeAlerts({
      pieceId: 1,
      current:  win({ clicks: 1, impressions: 20, ctr: 0.05, position: 8 }),
      previous: win({ clicks: 2, impressions: 25, ctr: 0.08, position: 8 }),
    })
    expect(codes(alerts)).not.toContain('losing_traffic')
  })

  it('avisa cuando pierde posiciones estando en juego', () => {
    const alerts = computeAlerts({
      pieceId: 1,
      current:  win({ clicks: 12, impressions: 600, ctr: 0.02, position: 11 }),
      previous: win({ clicks: 14, impressions: 580, ctr: 0.024, position: 4 }),
    })
    const losing = alerts.find(a => a.code === 'losing_traffic')
    expect(losing.message).toContain('posiciones')
    expect(losing.severity).toBe('critical')
  })

  it('caer de la 45 a la 60 no es noticia: nunca estuvo en juego', () => {
    const alerts = computeAlerts({
      pieceId: 1,
      current:  win({ clicks: 0, impressions: 300, ctr: 0, position: 60 }),
      previous: win({ clicks: 0, impressions: 320, ctr: 0, position: 45 }),
    })
    expect(codes(alerts)).not.toContain('losing_traffic')
  })

  it('una nota recién publicada no figura como si hubiera caído', () => {
    const alerts = computeAlerts({
      pieceId: 1,
      current:  win({ clicks: 3, impressions: 120, ctr: 0.025, position: 12 }),
      previous: null,
    })
    expect(codes(alerts)).not.toContain('losing_traffic')
  })
})

describe('contentSeo — alerta de CTR bajo', () => {
  it('avisa con muchas impresiones y CTR muy por debajo del esperado para su posición', () => {
    const alerts = computeAlerts({
      pieceId: 1,
      current: win({ clicks: 8, impressions: 1200, ctr: 0.0066, position: 3 }),
    })
    const low = alerts.find(a => a.code === 'low_ctr')
    expect(low).toBeTruthy()
    expect(low.severity).toBe('critical')
    expect(low.message).toContain('reescribir título y meta')
  })

  it('un 2% en la posición 9 es normal: no se avisa', () => {
    const alerts = computeAlerts({
      pieceId: 1,
      current: win({ clicks: 6, impressions: 300, ctr: 0.02, position: 9 }),
    })
    expect(alerts.map(a => a.code)).not.toContain('low_ctr')
  })

  it('no avisa sin volumen de impresiones, aunque el CTR sea 0', () => {
    const alerts = computeAlerts({
      pieceId: 1,
      current: win({ clicks: 0, impressions: 40, ctr: 0, position: 4 }),
    })
    expect(alerts.map(a => a.code)).not.toContain('low_ctr')
  })

  it('no avisa en la página 4: ahí el problema es la posición, no el título', () => {
    const alerts = computeAlerts({
      pieceId: 1,
      current: win({ clicks: 1, impressions: 2000, ctr: 0.0005, position: 38 }),
    })
    expect(alerts.map(a => a.code)).not.toContain('low_ctr')
  })
})

describe('contentSeo — solapamiento de keywords', () => {
  const pieces = [
    { id: 1, title: 'Alquiler de autos en Mendoza', seoKeyword: 'Alquiler de autos en Mendoza', seoKeywords: ['rent a car mendoza'] },
    { id: 2, title: 'Autos para alquilar en Mendoza', seoKeyword: 'alquiler de autos mendoza', seoKeywords: [] },
  ]
  const owners = buildKeywordOwners(pieces)

  it('empareja la keyword escrita a mano con la consulta de Google, tildes y mayúsculas aparte', () => {
    expect(normalizeKeyword('Alquiler de Autós  en Mendoza')).toBe('alquiler de autos en mendoza')
    expect(owners.get('alquiler de autos en mendoza').pieceId).toBe(1)
    expect(owners.get('rent a car mendoza').primary).toBe(false)
  })

  it('avisa cuando una nota aparece para la keyword de otra', () => {
    const alerts = computeAlerts({
      pieceId: 2,
      current: win({ clicks: 5, impressions: 400, ctr: 0.012, position: 9 }),
      topQueries: [{ query: 'alquiler de autos en mendoza', impressions: 300 }],
      ownKeywords: ['alquiler de autos mendoza'],
      keywordOwner: owners,
    })
    const overlap = alerts.find(a => a.code === 'keyword_overlap')
    expect(overlap).toBeTruthy()
    expect(overlap.data.otherPieceId).toBe(1)
    expect(overlap.message).toContain('canibalizando')
  })

  it('no se avisa de solaparse consigo misma', () => {
    const alerts = computeAlerts({
      pieceId: 1,
      current: win({ clicks: 90, impressions: 800, ctr: 0.11, position: 2 }),
      topQueries: [{ query: 'alquiler de autos en mendoza', impressions: 700 }],
      ownKeywords: ['alquiler de autos en mendoza'],
      keywordOwner: owners,
    })
    expect(alerts.map(a => a.code)).not.toContain('keyword_overlap')
  })

  it('una consulta con 3 impresiones no es una disputa', () => {
    const alerts = computeAlerts({
      pieceId: 2,
      current: win({ clicks: 1, impressions: 50, ctr: 0.02, position: 9 }),
      topQueries: [{ query: 'alquiler de autos en mendoza', impressions: 3 }],
      keywordOwner: owners,
    })
    expect(alerts.map(a => a.code)).not.toContain('keyword_overlap')
  })

  it('dos notas con la MISMA keyword declarada se avisan sin esperar datos de Google', () => {
    const owners2 = buildKeywordOwners([
      { id: 1, title: 'Nota vieja', seoKeyword: 'seguro de auto', seoKeywords: [] },
      { id: 2, title: 'Nota nueva', seoKeyword: 'seguro de auto', seoKeywords: [] },
    ])
    const alerts = computeAlerts({
      pieceId: 2,
      current: win(),
      ownKeywords: ['seguro de auto'],
      keywordOwner: owners2,
    })
    const overlap = alerts.find(a => a.code === 'keyword_overlap')
    expect(overlap.data.declared).toBe(true)
    expect(overlap.data.otherPieceTitle).toBe('Nota vieja')
  })

  it('lo que ya se resolvió en Canibalización no se vuelve a pedir', () => {
    const alerts = computeAlerts({
      pieceId: 2,
      current: win({ clicks: 5, impressions: 400, ctr: 0.012, position: 9 }),
      topQueries: [{ query: 'alquiler de autos en mendoza', impressions: 300 }],
      keywordOwner: owners,
      resolvedQueries: new Set(['alquiler de autos en mendoza']),
    })
    expect(alerts.map(a => a.code)).not.toContain('keyword_overlap')
  })

  it('las alertas salen ordenadas por gravedad', () => {
    const alerts = computeAlerts({
      pieceId: 2,
      current:  win({ clicks: 4, impressions: 1500, ctr: 0.0026, position: 4 }),
      previous: win({ clicks: 40, impressions: 1400, ctr: 0.028, position: 4 }),
      topQueries: [{ query: 'alquiler de autos en mendoza', impressions: 900 }],
      keywordOwner: owners,
    })
    const severities = alerts.map(a => a.severity)
    expect(severities[0]).toBe('critical')
    expect(severities).toEqual([...severities].sort((a, b) => (a === 'critical' ? -1 : 1)))
  })
})

describe('contentSeo — lectura de un sitemap', () => {
  it('lee las URLs de un urlset', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://x.com/blog/a</loc><lastmod>2026-02-01</lastmod></url>
        <url><loc>https://x.com/en/blog/a</loc></url>
      </urlset>`
    const { urls, sitemaps } = parseSitemap(xml)
    expect(sitemaps).toEqual([])
    expect(urls).toEqual([
      { url: 'https://x.com/blog/a', lastmod: '2026-02-01' },
      { url: 'https://x.com/en/blog/a', lastmod: null },
    ])
  })

  it('devuelve los hijos de un índice de sitemaps, sin inventar URLs', () => {
    const xml = `<?xml version="1.0"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://x.com/post-sitemap.xml</loc></sitemap>
        <sitemap><loc>https://x.com/page-sitemap.xml</loc></sitemap>
      </sitemapindex>`
    const { urls, sitemaps } = parseSitemap(xml)
    expect(urls).toEqual([])
    expect(sitemaps).toHaveLength(2)
  })

  it('un XML roto o vacío no rompe la importación', () => {
    expect(parseSitemap('<nada>')).toEqual({ urls: [], sitemaps: [] })
    expect(parseSitemap(undefined)).toEqual({ urls: [], sitemaps: [] })
  })
})

describe('contentSeo — lectura de la API de WordPress', () => {
  it('normaliza title.rendered, la fecha y el idioma', () => {
    const [post] = normalizeWpPosts([{
      id: 12,
      link: 'https://x.com/blog/nota',
      title: { rendered: 'Viajar por Mendoza &#8211; gu&iacute;a' },
      date: '2026-01-05T10:00:00',
      date_gmt: '2026-01-05T13:00:00',
      lang: 'es',
      translations: { es: 12, en: 34 },
    }])
    expect(post.url).toBe('https://x.com/blog/nota')
    expect(post.title).toBe('Viajar por Mendoza – guía')
    expect(post.date).toBe('2026-01-05T13:00:00')                // prefiere GMT
    expect(post.translations).toEqual({ es: 12, en: 34 })
  })

  it('decodifica las entidades que WordPress deja en los títulos', () => {
    expect(decodeEntities('Autos &amp; motos &#8220;baratos&#8221;')).toBe('Autos & motos “baratos”')
    expect(decodeEntities('C&oacute;mo viajar en invierno')).toBe('Cómo viajar en invierno')
    // Un texto que dice literalmente "&lt;" no tiene que terminar en "<".
    expect(decodeEntities('Usar &amp;lt; en HTML')).toBe('Usar &lt; en HTML')
    // Una entidad que no está en la tabla se deja como vino, no se borra.
    expect(decodeEntities('Peso &pound; libra')).toBe('Peso &pound; libra')
  })

  it('descarta las entradas sin link y tolera una respuesta que no es un array', () => {
    expect(normalizeWpPosts([{ id: 1 }, { id: 2, link: '  ' }])).toEqual([])
    expect(normalizeWpPosts({ error: 'nope' })).toEqual([])
  })
})
