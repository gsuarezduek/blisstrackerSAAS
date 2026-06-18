const { computeLinkedinScrapeMetrics } = require('../../src/services/linkedin.service')
const { parseLinkedinCompany } = require('../../src/services/socialScrape.service')

describe('parseLinkedinCompany', () => {
  it('extrae el slug de una URL de company', () => {
    expect(parseLinkedinCompany('https://www.linkedin.com/company/Bliss-MKT/')).toBe('bliss-mkt')
  })
  it('acepta showcase y school', () => {
    expect(parseLinkedinCompany('https://linkedin.com/showcase/microsoft-azure/')).toBe('microsoft-azure')
    expect(parseLinkedinCompany('https://www.linkedin.com/school/mit/')).toBe('mit')
  })
  it('acepta slug pelado y con @', () => {
    expect(parseLinkedinCompany('bliss-mkt')).toBe('bliss-mkt')
    expect(parseLinkedinCompany('@bliss')).toBe('bliss')
  })
  it('ignora query/hash', () => {
    expect(parseLinkedinCompany('https://www.linkedin.com/company/acme/?trk=x')).toBe('acme')
  })
  it('devuelve null para input inválido o vacío', () => {
    expect(parseLinkedinCompany('con espacios !!')).toBeNull()
    expect(parseLinkedinCompany('')).toBeNull()
    expect(parseLinkedinCompany(null)).toBeNull()
  })
})

describe('computeLinkedinScrapeMetrics', () => {
  const profile = { id: 'urn:li:organization:123', followers_count: 1000, name: 'Bliss', vanityName: 'bliss', logo_url: 'http://x/logo.png' }
  const posts = [
    { id: 'a', text: 'post junio 1', likes: 10, comments: 2, shares: 1, timestamp: '2026-06-05T12:00:00Z', url: 'u1' },
    { id: 'b', text: 'post junio 2', likes: 50, comments: 8, shares: 4, timestamp: '2026-06-15T12:00:00Z', url: 'u2', imgSrc: 'img2' },
    { id: 'c', text: 'post mayo',    likes: 99, comments: 9, shares: 9, timestamp: '2026-05-20T12:00:00Z', url: 'u3' },
  ]

  it('filtra por mes calendario y suma totales del mes', () => {
    const m = computeLinkedinScrapeMetrics(profile, posts, '2026-06')
    expect(m.postsThisMonth).toBe(2)        // excluye el de mayo
    expect(m.totalLikes).toBe(60)
    expect(m.totalComments).toBe(10)
    expect(m.totalShares).toBe(5)
  })

  it('calcula engagement rate por seguidores (promedio por post)', () => {
    const m = computeLinkedinScrapeMetrics(profile, posts, '2026-06')
    // (60+10+5)/2 posts / 1000 followers * 100 = 3.75
    expect(m.engagementRate).toBe(3.75)
  })

  it('ordena topPosts por engagement desc', () => {
    const m = computeLinkedinScrapeMetrics(profile, posts, '2026-06')
    expect(m.topPosts.map(p => p.id)).toEqual(['b', 'a'])
    expect(m.topPosts[0].engagement).toBe(62)
    expect(m.topPosts[0].imgSrc).toBe('img2')
  })

  it('deja en null los campos que el scraping no puede ver', () => {
    const m = computeLinkedinScrapeMetrics(profile, posts, '2026-06')
    expect(m.impressions).toBeNull()
    expect(m.clicks).toBeNull()
    expect(m.ctr).toBeNull()
    expect(m.pageViews).toBeNull()
    expect(m.uniqueVisitors).toBeNull()
    expect(m.demographics).toEqual({ industry: [], seniority: [], function: [], region: [] })
  })

  it('expone followers y org siempre, aunque no haya posts en el mes', () => {
    const m = computeLinkedinScrapeMetrics(profile, posts, '2030-01')
    expect(m.followersCount).toBe(1000)
    expect(m.org.name).toBe('Bliss')
    expect(m.postsThisMonth).toBe(0)
    expect(m.totalLikes).toBeNull()
    expect(m.engagementRate).toBeNull()
    expect(m.topPosts).toEqual([])
  })

  it('sin followers no calcula engagement rate (evita división por cero)', () => {
    const m = computeLinkedinScrapeMetrics({ followers_count: 0 }, posts, '2026-06')
    expect(m.engagementRate).toBeNull()
  })
})
