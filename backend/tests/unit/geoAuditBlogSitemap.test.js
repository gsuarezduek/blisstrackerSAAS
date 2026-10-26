jest.mock('axios')
const axios = require('axios')
// Mismo patrón que siteCrawler.test.js: fetchPublicUrl delega 1:1 en el axios.get
// ya mockeado (la validación SSRF real de safeUrl.js queda fuera de alcance acá).
jest.mock('../../src/lib/safeUrl', () => ({
  fetchPublicUrl: jest.fn((url, opts) => require('axios').get(url, opts)),
}))

const { fetchRecentBlogPostUrl } = require('../../src/services/geoAudit.service')

const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://x.com/post-sitemap.xml</loc></sitemap>
  <sitemap><loc>https://x.com/page-sitemap.xml</loc></sitemap>
</sitemapindex>`

const POST_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://x.com/post-mas-reciente/</loc></url>
  <url><loc>https://x.com/post-viejo/</loc></url>
</urlset>`

const FLAT_URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://x.com/category/novedades/</loc></url>
  <url><loc>https://x.com/un-post-cualquiera/</loc></url>
</urlset>`

describe('fetchRecentBlogPostUrl', () => {
  beforeEach(() => axios.get.mockReset())

  it('caso real: sitemap índice con post-sitemap.xml → devuelve el post más reciente (primera entrada)', async () => {
    axios.get.mockImplementation(url => {
      if (url.includes('post-sitemap.xml')) return Promise.resolve({ status: 200, data: POST_SITEMAP })
      return Promise.resolve({ status: 200, data: SITEMAP_INDEX })
    })
    expect(await fetchRecentBlogPostUrl('https://x.com')).toBe('https://x.com/post-mas-reciente/')
  })

  it('sin sitemap índice (urlset plano): usa el sitemap.xml directo, descartando páginas de catálogo típicas', async () => {
    axios.get.mockResolvedValue({ status: 200, data: FLAT_URLSET })
    expect(await fetchRecentBlogPostUrl('https://x.com')).toBe('https://x.com/un-post-cualquiera/')
  })

  it('sin sitemap.xml (404): devuelve null, no tira', async () => {
    axios.get.mockResolvedValue({ status: 404, data: '' })
    expect(await fetchRecentBlogPostUrl('https://x.com')).toBeNull()
  })

  it('XML roto: devuelve null, no tira', async () => {
    axios.get.mockResolvedValue({ status: 200, data: '<<<no es xml' })
    expect(await fetchRecentBlogPostUrl('https://x.com')).toBeNull()
  })

  it('sitemap índice sin post-sitemap y sin urls propias: devuelve null', async () => {
    axios.get.mockResolvedValue({
      status: 200,
      data: `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://x.com/page-sitemap.xml</loc></sitemap></sitemapindex>`,
    })
    expect(await fetchRecentBlogPostUrl('https://x.com')).toBeNull()
  })
})
