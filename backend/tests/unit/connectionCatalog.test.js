const fs = require('fs')
const path = require('path')
const { SOURCES, resolveConnections, reconnectUrl } = require('../../src/lib/connectionCatalog')

const ctx = { slug: 'bliss', projectId: 10 }

beforeAll(() => { process.env.APP_DOMAIN = 'blisstracker.app' })

describe('connectionCatalog', () => {
  test('el sitio web sale de websiteUrl, no de ProjectIntegration', () => {
    const [sin] = resolveConnections({ integrations: [], websiteUrl: null, ...ctx })
    const [con] = resolveConnections({ integrations: [], websiteUrl: 'https://x.com', ...ctx })
    expect(sin.state).toBe('missing')
    expect(con).toEqual({ type: 'website', label: 'Sitio web', state: 'active', websiteUrl: 'https://x.com' })
  })

  // Mismo criterio que resolveConnections del frontend y que getAvailableSections de
  // los informes: cualquier status que no sea 'active' es "hay que reconectar".
  test('un status que no es active cuenta como vencida', () => {
    const find = (rows, type) => rows.find(r => r.type === type)
    const rows = resolveConnections({
      integrations: [
        { type: 'google_analytics', status: 'active' },
        { type: 'google_ads', status: 'expired' },
        { type: 'instagram', status: 'cualquier-otra-cosa' },
      ],
      websiteUrl: null, ...ctx,
    })
    expect(find(rows, 'google_analytics').state).toBe('active')
    expect(find(rows, 'google_ads').state).toBe('expired')
    expect(find(rows, 'instagram').state).toBe('expired')
    expect(find(rows, 'tiktok').state).toBe('missing')
  })

  test('solo lo que hay que arreglar lleva link', () => {
    const rows = resolveConnections({
      integrations: [{ type: 'google_analytics', status: 'active' }],
      websiteUrl: 'https://x.com', ...ctx,
    })
    expect(rows.filter(r => r.reconnectUrl).every(r => r.state !== 'active')).toBe(true)
    expect(rows.filter(r => r.state === 'active').every(r => !r.reconnectUrl)).toBe(true)
  })

  test('el link del scraping de Instagram declara el modo', () => {
    const rows = resolveConnections({
      integrations: [{ type: 'instagram', status: 'active', scopes: 'scrape', propertyId: 'pastiza' }],
      websiteUrl: null, ...ctx,
    })
    expect(rows.find(r => r.type === 'instagram')).toEqual(expect.objectContaining({ mode: 'scrape', propertyId: 'pastiza' }))
  })

  // El link apunta a la app y NUNCA a la URL de consentimiento del proveedor: el
  // `state` de OAuth vive 10 minutos y el callback espera un popup abierto por la app.
  test('el link es una pantalla de la app, en el subdominio del workspace', () => {
    for (const source of SOURCES) {
      const url = reconnectUrl(source, ctx)
      expect(url.startsWith('https://bliss.blisstracker.app/')).toBe(true)
      expect(url).not.toMatch(/accounts\.google\.com|facebook\.com|oauth/)
      expect(url).toContain('10')
    }
  })

  describe('espejo del frontend', () => {
    // El panel "Conexiones" de Prioridades tiene su propia copia (el frontend no puede
    // importar CommonJS del backend). Este test falla si alguien agrega una fuente, le
    // cambia la sección o la manda a otra pestaña de un solo lado — y la sección y la
    // pestaña importan: la primera decide si la fuente se ofrece cuando el workspace
    // apagó ese bloque de Marketing, la segunda es a dónde se manda a la persona.
    const mirrorSrc = fs.readFileSync(
      path.join(__dirname, '../../../frontend/src/components/marketing/ConnectionsPanel.jsx'),
      'utf8'
    )
    const start = mirrorSrc.indexOf('export const CONNECTION_SOURCES = [')
    const block = mirrorSrc.slice(start, mirrorSrc.indexOf(']', start))
    const entries = block.split('\n').filter(l => l.includes('type:')).map(line => {
      const pick = (key) => line.match(new RegExp(`${key}:\\s*'([^']+)'`))?.[1] ?? null
      return { type: pick('type'), label: pick('label'), section: pick('section'), tab: pick('tab'), sub: pick('sub'), view: pick('view') }
    })

    test('el espejo se pudo leer', () => {
      expect(entries.length).toBeGreaterThan(5)
    })

    test('las fuentes del espejo coinciden con las del backend, en el mismo orden', () => {
      expect(entries.map(e => e.type)).toEqual(SOURCES.map(s => s.type))
      expect(entries.map(e => e.label)).toEqual(SOURCES.map(s => s.label))
    })

    test('cada fuente tiene la misma sección y la misma pestaña en los dos lados', () => {
      for (const entry of entries) {
        const mine = SOURCES.find(s => s.type === entry.type)
        expect(mine.section ?? null).toBe(entry.section)
        expect(mine.tab ?? null).toBe(entry.tab)
        expect(mine.sub ?? null).toBe(entry.sub)
        expect(mine.view ?? null).toBe(entry.view)
      }
    })
  })
})
