jest.mock('axios')
const axios = require('axios')
const { normalizeInternal, crawlSite } = require('../../src/lib/siteCrawler')

describe('normalizeInternal', () => {
  const base = 'https://example.com/foo'
  const origin = 'https://example.com'

  it('descarta href vacío/falsy', () => {
    expect(normalizeInternal(null, base, origin)).toBeNull()
    expect(normalizeInternal('', base, origin)).toBeNull()
    expect(normalizeInternal('   ', base, origin)).toBeNull()
  })

  it('descarta anchors, mailto, tel y javascript:', () => {
    expect(normalizeInternal('#section', base, origin)).toBeNull()
    expect(normalizeInternal('mailto:a@b.com', base, origin)).toBeNull()
    expect(normalizeInternal('tel:+123', base, origin)).toBeNull()
    expect(normalizeInternal('javascript:void(0)', base, origin)).toBeNull()
  })

  it('descarta links de otro origen', () => {
    expect(normalizeInternal('https://other.com/page', base, origin)).toBeNull()
  })

  it('descarta protocolos que no son http(s)', () => {
    expect(normalizeInternal('ftp://example.com/x', base, origin)).toBeNull()
  })

  it('descarta assets no-HTML por extensión', () => {
    for (const ext of ['pdf', 'jpg', 'png', 'zip', 'css', 'js']) {
      expect(normalizeInternal(`/file.${ext}`, base, origin)).toBeNull()
    }
  })

  it('resuelve relativas contra el base y quita hash/query', () => {
    expect(normalizeInternal('/contacto?utm=1#top', base, origin)).toBe('https://example.com/contacto')
  })

  it('quita la barra final salvo en la raíz', () => {
    expect(normalizeInternal('/contacto/', base, origin)).toBe('https://example.com/contacto')
    expect(normalizeInternal('/', base, origin)).toBe('https://example.com/')
  })
})

describe('crawlSite', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sigue los internalLinks que devuelve extract() hasta maxPages', async () => {
    const html = { '/': 'home', '/a': 'page a', '/b': 'page b', '/c': 'page c' }
    axios.get.mockImplementation((url) => {
      const path = new URL(url).pathname
      return Promise.resolve({ data: html[path] ?? 'unknown' })
    })

    const linksByPath = {
      '/':  ['https://example.com/a', 'https://example.com/b'],
      '/a': ['https://example.com/c'],
      '/b': [],
      '/c': [],
    }
    const extract = jest.fn((data, url) => {
      const path = new URL(url).pathname
      return { url, data, internalLinks: linksByPath[path] ?? [] }
    })

    const pages = await crawlSite({ seedUrl: 'https://example.com/', maxPages: 10, extract })

    expect(pages.map(p => p.url)).toEqual([
      'https://example.com/', 'https://example.com/a', 'https://example.com/b', 'https://example.com/c',
    ])
    expect(extract).toHaveBeenCalledTimes(4)
  })

  it('no refetchea la misma URL dos veces aunque varias páginas la referencien', async () => {
    axios.get.mockResolvedValue({ data: 'x' })
    const extract = jest.fn((data, url) => ({
      url,
      internalLinks: url.endsWith('/') ? ['https://example.com/shared', 'https://example.com/shared'] : [],
    }))

    await crawlSite({ seedUrl: 'https://example.com/', maxPages: 10, extract })

    expect(axios.get).toHaveBeenCalledTimes(2) // home + /shared, una sola vez cada una
  })

  it('respeta el tope maxPages', async () => {
    axios.get.mockResolvedValue({ data: 'x' })
    let n = 0
    const extract = jest.fn((data, url) => ({ url, internalLinks: [`https://example.com/p${n++}`] }))

    const pages = await crawlSite({ seedUrl: 'https://example.com/', maxPages: 3, extract })

    expect(pages).toHaveLength(3)
  })

  it('una página que falla al fetchear queda marcada error, sin llamar a extract', async () => {
    axios.get.mockImplementation((url) => {
      if (url === 'https://example.com/') return Promise.resolve({ data: 'home' })
      const err = new Error('boom')
      err.response = { status: 500 }
      return Promise.reject(err)
    })
    const extract = jest.fn((data, url) => ({ url, internalLinks: ['https://example.com/broken'] }))

    const pages = await crawlSite({ seedUrl: 'https://example.com/', maxPages: 5, extract })

    expect(pages).toEqual([
      { url: 'https://example.com/', internalLinks: ['https://example.com/broken'] },
      { url: 'https://example.com/broken', error: true, status: 500, internalLinks: [] },
    ])
    expect(extract).toHaveBeenCalledTimes(1)
  })

  it('encola extraSeeds desde el arranque, junto con la semilla principal', async () => {
    axios.get.mockResolvedValue({ data: 'x' })
    const extract = jest.fn((data, url) => ({ url, internalLinks: [] }))

    const pages = await crawlSite({
      seedUrl: 'https://example.com/',
      extraSeeds: ['https://example.com/contacto'],
      maxPages: 10,
      extract,
    })

    expect(pages.map(p => p.url)).toEqual(['https://example.com/', 'https://example.com/contacto'])
  })
})
