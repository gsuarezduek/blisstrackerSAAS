const { parseResult, parseItems, parseFieldData } = require('../../src/services/pageSpeed.service')

// Fragmento con la forma real de la respuesta de PageSpeed Insights v5 (recortado).
function payload() {
  return {
    loadingExperience: {
      overall_category: 'AVERAGE',
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS:   { percentile: 3100, category: 'AVERAGE' },
        INTERACTION_TO_NEXT_PAINT:     { percentile: 180,  category: 'FAST' },
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12,   category: 'AVERAGE' },
      },
    },
    originLoadingExperience: {
      overall_category: 'SLOW',
      metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 4200, category: 'SLOW' } },
    },
    lighthouseResult: {
      categories: { performance: { score: 0.74 } },
      audits: {
        'largest-contentful-paint': { id: 'largest-contentful-paint', displayValue: '3,1 s', numericValue: 3100, score: 0.4 },
        'largest-contentful-paint-element': {
          id: 'largest-contentful-paint-element',
          title: 'Elemento de Largest Contentful Paint',
          description: 'Este es el elemento LCP',
          score: 0,
          displayValue: '3.100 ms',
          details: {
            type: 'list',
            items: [{ node: { nodeLabel: 'img.hero', selector: 'div.hero > img', snippet: '<img class="hero" src="/hero.jpg">' } }],
          },
        },
        'render-blocking-resources': {
          id: 'render-blocking-resources',
          title: 'Elimina los recursos que bloquean el renderizado',
          description: '...',
          score: 0.3,
          details: {
            type: 'opportunity',
            overallSavingsMs: 850,
            items: [
              { url: 'https://site.com/wp-content/plugins/slider/slider.css', totalBytes: 42000, wastedMs: 600 },
              { url: 'https://fonts.googleapis.com/css?family=X', totalBytes: 1200, wastedMs: 250 },
            ],
          },
        },
        'third-party-summary': {
          id: 'third-party-summary',
          title: 'Reduce el impacto del código de terceros',
          description: '...',
          score: 0.5,
          details: {
            type: 'table',
            items: [{ entity: 'Google Tag Manager', blockingTime: 320, mainThreadTime: 540 }],
          },
        },
        // score null = "informativo", nunca fue ni debe ser un hallazgo
        'network-requests': { id: 'network-requests', title: 'Solicitudes de red', score: null, details: { type: 'table', items: [{ url: 'x' }] } },
        // score 1 = aprobado
        'uses-text-compression': { id: 'uses-text-compression', title: 'Compresión', score: 1, details: { type: 'opportunity', overallSavingsMs: 0, items: [] } },
      },
    },
  }
}

describe('parseItems', () => {
  it('saca la URL del recurso que bloquea, con su peso y el ahorro', () => {
    const items = parseItems(payload().lighthouseResult.audits['render-blocking-resources'])
    expect(items).toHaveLength(2)
    expect(items[0].label).toBe('https://site.com/wp-content/plugins/slider/slider.css')
    expect(items[0].totalBytes).toBe(42000)
    expect(items[0].wastedMs).toBe(600)
  })

  it('cuando el culpable es un elemento del DOM, usa su label y guarda el snippet', () => {
    const items = parseItems(payload().lighthouseResult.audits['largest-contentful-paint-element'])
    expect(items[0].label).toBe('img.hero')
    expect(items[0].snippet).toContain('<img class="hero"')
  })

  it('un tercero se identifica por su nombre y su tiempo de bloqueo', () => {
    const items = parseItems(payload().lighthouseResult.audits['third-party-summary'])
    expect(items[0].label).toBe('Google Tag Manager')
    expect(items[0].blockingTime).toBe(320)
  })

  it('un audit sin items no lanza', () => {
    expect(parseItems({ details: { type: 'table' } })).toEqual([])
    expect(parseItems(null)).toEqual([])
  })

  it('corta en 5 items por audit', () => {
    const many = { details: { type: 'opportunity', items: Array.from({ length: 12 }, (_, i) => ({ url: `https://x.com/${i}.js` })) } }
    expect(parseItems(many)).toHaveLength(5)
  })
})

describe('parseFieldData (CrUX)', () => {
  it('trae las métricas de usuarios reales, con INP', () => {
    const field = parseFieldData(payload().loadingExperience)
    expect(field.lcp).toEqual({ numericValue: 3100, rating: 'needs-improvement' })
    expect(field.inp).toEqual({ numericValue: 180, rating: 'good' })
    expect(field.overall).toBe('needs-improvement')
  })

  it('devuelve el CLS en su escala real (CrUX lo manda x100)', () => {
    const field = parseFieldData(payload().loadingExperience)
    expect(field.cls.numericValue).toBeCloseTo(0.12)
  })

  it('sin datos de campo devuelve null (una URL con poco tráfico no tiene CrUX)', () => {
    expect(parseFieldData(undefined)).toBeNull()
    expect(parseFieldData({ overall_category: 'FAST' })).toBeNull()
  })
})

describe('parseResult', () => {
  it('el score de laboratorio ya no viaja solo: lleva los datos de campo al lado', () => {
    const r = parseResult(payload())
    expect(r.performanceScore).toBe(74)
    expect(r.metrics.field.overall).toBe('needs-improvement')
    expect(r.metrics.fieldOrigin.overall).toBe('poor')
  })

  it('cada oportunidad dice qué recurso arreglar', () => {
    const r = parseResult(payload())
    const rbr = r.opportunities.find(o => o.id === 'render-blocking-resources')
    expect(rbr.savingsMs).toBe(850)
    expect(rbr.items.map(i => i.label)).toContain('https://site.com/wp-content/plugins/slider/slider.css')
  })

  it('el elemento del LCP entra como diagnóstico (antes se perdía por venir como lista)', () => {
    const r = parseResult(payload())
    const lcpEl = r.diagnostics.find(d => d.id === 'largest-contentful-paint-element')
    expect(lcpEl).toBeDefined()
    expect(lcpEl.items[0].label).toBe('img.hero')
  })

  it('no duplica un audit como oportunidad y como diagnóstico', () => {
    const r = parseResult(payload())
    const ids = [...r.opportunities, ...r.diagnostics].map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ignora los informativos (score null) y los aprobados (score 1)', () => {
    const r = parseResult(payload())
    const ids = [...r.opportunities, ...r.diagnostics].map(a => a.id)
    expect(ids).not.toContain('network-requests')
    expect(ids).not.toContain('uses-text-compression')
  })

  it('una respuesta vacía no lanza', () => {
    const r = parseResult({})
    expect(r.performanceScore).toBeNull()
    expect(r.opportunities).toEqual([])
    expect(r.metrics.field).toBeNull()
  })
})
