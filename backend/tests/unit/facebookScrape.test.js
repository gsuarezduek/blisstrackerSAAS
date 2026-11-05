const { computeFacebookScrapeMetrics } = require('../../src/services/facebook.service')
const {
  parseFacebookPage, normalizeFacebookPost, normalizeApifyFacebook, pickFacebookPosts,
} = require('../../src/services/socialScrape.service')

describe('parseFacebookPage', () => {
  it('extrae el slug de una URL de página', () => {
    expect(parseFacebookPage('https://www.facebook.com/Bliss-MKT/')).toBe('bliss-mkt')
  })
  it('acepta el id numérico de profile.php', () => {
    expect(parseFacebookPage('https://www.facebook.com/profile.php?id=123456789')).toBe('123456789')
  })
  it('acepta el prefijo /pg/', () => {
    expect(parseFacebookPage('https://facebook.com/pg/acme/')).toBe('acme')
  })
  it('acepta slug pelado y con @', () => {
    expect(parseFacebookPage('bliss-mkt')).toBe('bliss-mkt')
    expect(parseFacebookPage('@bliss')).toBe('bliss')
  })
  it('ignora query/hash', () => {
    expect(parseFacebookPage('https://www.facebook.com/acme/?ref=x')).toBe('acme')
  })
  it('devuelve null para input inválido o vacío', () => {
    expect(parseFacebookPage('con espacios !!')).toBeNull()
    expect(parseFacebookPage('')).toBeNull()
    expect(parseFacebookPage(null)).toBeNull()
  })
})

describe('computeFacebookScrapeMetrics', () => {
  const profile = { id: '123', followers_count: 1000, fan_count: 950, name: 'Bliss' }
  const posts = [
    { id: 'a', text: 'post junio 1', likes: 10, comments: 2, shares: 1, timestamp: '2026-06-05T12:00:00Z', url: 'u1' },
    { id: 'b', text: 'post junio 2', likes: 50, comments: 8, shares: 4, timestamp: '2026-06-15T12:00:00Z', url: 'u2', imgSrc: 'img2' },
    { id: 'c', text: 'post mayo',    likes: 99, comments: 9, shares: 9, timestamp: '2026-05-20T12:00:00Z', url: 'u3' },
  ]

  it('filtra por mes calendario y suma totales del mes', () => {
    const m = computeFacebookScrapeMetrics(profile, posts, '2026-06')
    expect(m.postsThisMonth).toBe(2)        // excluye el de mayo
    expect(m.totalLikes).toBe(60)
    expect(m.totalComments).toBe(10)
    expect(m.totalShares).toBe(5)
  })

  it('calcula engagement rate por seguidores (promedio por post)', () => {
    const m = computeFacebookScrapeMetrics(profile, posts, '2026-06')
    // (60+10+5)/2 posts / 1000 followers * 100 = 3.75
    expect(m.engagementRate).toBe(3.75)
  })

  it('ordena topPosts por engagement desc', () => {
    const m = computeFacebookScrapeMetrics(profile, posts, '2026-06')
    expect(m.topPosts.map(p => p.id)).toEqual(['b', 'a'])
    expect(m.topPosts[0].engagement).toBe(62)
    expect(m.topPosts[0].imgSrc).toBe('img2')
  })

  it('deja en null los campos que el scraping no puede ver', () => {
    const m = computeFacebookScrapeMetrics(profile, posts, '2026-06')
    expect(m.reach).toBeNull()
    expect(m.impressions).toBeNull()
    expect(m.pageViews).toBeNull()
  })

  it('expone followers y página siempre, aunque no haya posts en el mes', () => {
    const m = computeFacebookScrapeMetrics(profile, posts, '2030-01')
    expect(m.followersCount).toBe(1000)
    expect(m.fanCount).toBe(950)
    expect(m.page.name).toBe('Bliss')
    expect(m.postsThisMonth).toBe(0)
    expect(m.totalLikes).toBeNull()
    expect(m.engagementRate).toBeNull()
    expect(m.topPosts).toEqual([])
  })

  it('sin followers no calcula engagement rate (evita división por cero)', () => {
    const m = computeFacebookScrapeMetrics({ followers_count: 0 }, posts, '2026-06')
    expect(m.engagementRate).toBeNull()
  })
})

// Un item del actor de Páginas (`apify~facebook-pages-scraper`): la ficha completa de
// la página y NINGÚN post — es la razón por la que hace falta la 2ª llamada.
const PAGE_ITEM = {
  facebookUrl: 'https://www.facebook.com/acme/',
  categories: ['Page', 'Travel Company'],
  likes: 0,
  title: 'ACME | Mendoza',
  pageId: '100064381191440',
  pageName: 'acme',
  followers: 82669,
  followings: 13,
  category: 'Travel Company',
  creation_date: 'June 2, 2010',
  facebookId: '100064381191440',
  pageAdLibrary: { id: '126712074016386', pamv_comms_data: null },
}

// Un item del actor de posts (`apify~facebook-posts-scraper`): `timestamp` es epoch en
// SEGUNDOS y la portada viaja dentro de `media[]`.
const POST_ITEM = {
  postId: 'pfbid123',
  pageName: 'acme',
  url: 'https://www.facebook.com/acme/posts/pfbid123',
  time: '2026-06-15T12:00:00.000Z',
  timestamp: 1781006400,
  likes: 50,
  comments: 8,
  shares: 4,
  text: 'post de junio',
  media: [{ thumbnail: 'https://cdn/thumb.jpg', photo_image: { uri: 'https://cdn/full.jpg' } }],
  facebookId: '100064381191440',
  pageAdLibrary: { id: '126712074016386' },
}

describe('normalizeApifyFacebook — ficha de página sin posts', () => {
  it('saca los seguidores de la ficha y deja los posts vacíos (no inventa nada)', () => {
    const { profile, posts } = normalizeApifyFacebook([PAGE_ITEM], 'acme')
    expect(profile.followers_count).toBe(82669)
    // `pageName` gana sobre `title` a propósito: en el actor de posts es el nombre
    // legible de la página ("Humans of New York"), en el de páginas es el slug.
    expect(profile.name).toBe('acme')
    expect(posts).toEqual([])
  })

  it('con likes de página en 0, fan_count queda en null (no en 0)', () => {
    const { profile } = normalizeApifyFacebook([PAGE_ITEM], 'acme')
    expect(profile.fan_count).toBeNull()
  })
})

describe('normalizeFacebookPost', () => {
  it('normaliza el epoch en SEGUNDOS a una fecha real (no 1970)', () => {
    // Sin esto el filtro por mes descartaba todos los posts → postsThisMonth: 0
    const p = normalizeFacebookPost({ ...POST_ITEM, time: undefined })
    expect(p.timestamp.slice(0, 7)).toBe('2026-06')
  })

  it('prefiere el ISO de `time` cuando viene', () => {
    expect(normalizeFacebookPost(POST_ITEM).timestamp).toBe('2026-06-15T12:00:00.000Z')
  })

  it('acepta epoch en milisegundos', () => {
    const p = normalizeFacebookPost({ postId: 'x', timestamp: Date.UTC(2026, 5, 15) })
    expect(p.timestamp.slice(0, 7)).toBe('2026-06')
  })

  it('deja la fecha en null si no parsea', () => {
    expect(normalizeFacebookPost({ postId: 'x', time: 'ayer' }).timestamp).toBeNull()
  })

  it('lee likes/comentarios/compartidos y la portada de media[]', () => {
    const p = normalizeFacebookPost(POST_ITEM)
    expect(p.likes).toBe(50)
    expect(p.comments).toBe(8)
    expect(p.shares).toBe(4)
    expect(p.imgSrc).toBe('https://cdn/thumb.jpg')
    expect(p.url).toBe('https://www.facebook.com/acme/posts/pfbid123')
  })

  it('tolera conteos como texto ("1,234" / "1.2K")', () => {
    expect(normalizeFacebookPost({ postId: 'x', likes: '1,234' }).likes).toBe(1234)
    expect(normalizeFacebookPost({ postId: 'x', likes: '1.2K' }).likes).toBe(1200)
  })
})

describe('pickFacebookPosts', () => {
  it('se queda con los posts y descarta la ficha de página si el actor mezcla', () => {
    const picked = pickFacebookPosts([PAGE_ITEM, POST_ITEM])
    expect(picked).toHaveLength(1)
    expect(picked[0].postId).toBe('pfbid123')
  })

  it('descarta los items de error del dataset', () => {
    expect(pickFacebookPosts([{ error: 'You have used up your credits' }])).toEqual([])
  })

  it('tolera un dataset vacío o no-array', () => {
    expect(pickFacebookPosts([])).toEqual([])
    expect(pickFacebookPosts(null)).toEqual([])
  })
})

describe('fusión ficha + actor de posts', () => {
  it('las métricas del mes salen de los posts de la 2ª llamada', () => {
    const { profile } = normalizeApifyFacebook([PAGE_ITEM], 'acme')
    const posts = pickFacebookPosts([POST_ITEM]).map(normalizeFacebookPost)
    const m = computeFacebookScrapeMetrics(profile, posts, '2026-06')
    expect(m.followersCount).toBe(82669)   // de la ficha
    expect(m.postsThisMonth).toBe(1)       // del actor de posts
    expect(m.totalLikes).toBe(50)
    expect(m.topPosts[0].imgSrc).toBe('https://cdn/thumb.jpg')
  })
})
