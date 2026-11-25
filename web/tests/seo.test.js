import { describe, it, expect } from 'vitest'
import { buildMetadata, organizationSchema, softwareApplicationSchema, blogPostingSchema, breadcrumbSchema } from '../lib/seo.js'
import { PAGE_META } from '../lib/pageMeta.js'

const SITE = 'https://blisstracker.app'

describe('buildMetadata', () => {
  it('arma un canonical absoluto y propio de cada ruta', () => {
    // El bug original: index.html tenía <link rel="canonical" href=".../"> fijo, así
    // que /pricing, /blog y cada artículo decían que la URL buena era la home.
    expect(buildMetadata({ title: 'a', description: 'b', path: '/pricing' }).alternates.canonical)
      .toBe(`${SITE}/pricing`)
    expect(buildMetadata({ title: 'a', description: 'b', path: '/' }).alternates.canonical)
      .toBe(`${SITE}/`)
  })

  it('no hay dos páginas públicas con el mismo canonical', () => {
    const canonicals = Object.keys(PAGE_META).map(p => buildMetadata({ ...PAGE_META[p], path: p }).alternates.canonical)
    expect(new Set(canonicals).size).toBe(canonicals.length)
  })

  it('completa Open Graph y Twitter Card con el mismo título y descripción', () => {
    const m = buildMetadata({ title: 'Título', description: 'Descripción', path: '/x' })
    expect(m.openGraph.title).toBe('Título')
    expect(m.openGraph.url).toBe(`${SITE}/x`)
    expect(m.openGraph.locale).toBe('es_AR')
    expect(m.openGraph.images[0]).toMatchObject({ width: 1200, height: 630 })
    expect(m.twitter.card).toBe('summary_large_image')
    expect(m.twitter.description).toBe('Descripción')
  })

  it('el tipo de OG es article cuando se pide', () => {
    expect(buildMetadata({ title: 'a', description: 'b', path: '/blog/x', type: 'article' }).openGraph.type)
      .toBe('article')
  })
})

describe('JSON-LD', () => {
  it('Organization y SoftwareApplication apuntan al dominio canónico', () => {
    expect(organizationSchema()['@type']).toBe('Organization')
    expect(organizationSchema().url).toBe(SITE)
    const app = softwareApplicationSchema({ freeSeatLimit: 3, pricePerSeat: 3, trialDays: 14 })
    expect(app['@type']).toBe('SoftwareApplication')
    expect(app.offers.priceCurrency).toBe('USD')
    expect(app.offers.description).toMatch(/3 usuarios/)
  })

  it('BlogPosting usa metaDescription y cae al excerpt', () => {
    const base = { title: 'T', excerpt: 'E', authorName: 'Equipo', publishedAt: '2026-01-02T00:00:00.000Z' }
    expect(blogPostingSchema(base, { url: 'u' }).description).toBe('E')
    expect(blogPostingSchema({ ...base, metaDescription: 'M' }, { url: 'u' }).description).toBe('M')
  })

  it('BlogPosting lleva fecha, autor y publisher', () => {
    const s = blogPostingSchema(
      { title: 'T', excerpt: 'E', authorName: 'Equipo BlissTracker', publishedAt: '2026-01-02T00:00:00.000Z' },
      { url: `${SITE}/blog/t`, image: `${SITE}/og-image.png` },
    )
    expect(s['@type']).toBe('BlogPosting')
    expect(s.datePublished).toBe('2026-01-02T00:00:00.000Z')
    expect(s.author.name).toBe('Equipo BlissTracker')
    expect(s.publisher.name).toBe('BlissTracker')
    expect(s.mainEntityOfPage['@id']).toBe(`${SITE}/blog/t`)
  })

  it('BreadcrumbList numera desde 1 y usa URLs absolutas', () => {
    const s = breadcrumbSchema([
      { name: 'Inicio', path: '/' },
      { name: 'Blog', path: '/blog' },
    ])
    expect(s.itemListElement.map(i => i.position)).toEqual([1, 2])
    expect(s.itemListElement[1].item).toBe(`${SITE}/blog`)
  })
})
