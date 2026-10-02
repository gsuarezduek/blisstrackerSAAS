import { describe, it, expect } from 'vitest'
import { NAV, LEGACY_SUB_MAP } from '../../components/marketing/marketingNav'
import { resolveConnections } from '../../components/marketing/ConnectionsPanel'

describe('marketingNav', () => {
  it('no deja pestañas "próximamente" en el menú', () => {
    for (const g of NAV) for (const s of g.subs) expect(s.soon).toBeFalsy()
  })

  it('cada sub-pestaña vieja de GEO / SEO apunta a un destino que existe', () => {
    const geoSeo = NAV.find(n => n.id === 'geo-seo')
    for (const [old, dest] of Object.entries(LEGACY_SUB_MAP['geo-seo'])) {
      if (dest.tab) { expect(NAV.some(n => n.id === dest.tab)).toBe(true); continue }
      const sub = geoSeo.subs.find(s => s.id === dest.sub)
      expect(sub, old).toBeTruthy()
      if (dest.view) expect(sub.views.some(v => v.id === dest.view), old).toBe(true)
    }
    expect(LEGACY_SUB_MAP['geo-seo'].plan).toEqual({ tab: 'hoy' })
  })
})

describe('resolveConnections', () => {
  it('distingue activa / vencida / sin conectar y usa websiteUrl para el sitio', () => {
    const list = resolveConnections({
      integrations: [{ type: 'google_analytics', status: 'active' }, { type: 'instagram', status: 'expired' }],
      websiteUrl: 'https://x.com',
    })
    const by = Object.fromEntries(list.map(c => [c.type, c.state]))
    expect(by.website).toBe('active')
    expect(by.google_analytics).toBe('active')
    expect(by.instagram).toBe('expired')
    expect(by.tiktok).toBe('missing')
  })

  it('oculta las fuentes de secciones apagadas en Preferencias', () => {
    const list = resolveConnections({ integrations: [], websiteUrl: null, disabledSections: ['anuncios', 'rrss'] })
    const types = list.map(c => c.type)
    expect(types).not.toContain('meta_ads')
    expect(types).not.toContain('instagram')
    expect(types).toContain('website')
    expect(list.find(c => c.type === 'website').state).toBe('missing')
  })
})
