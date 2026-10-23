import { describe, it, expect } from 'vitest'
import { syncServiceRenames, reconcileServiceNames, linkServiceItems } from '../../components/ventas/proposalServiceSync'

const plans = [
  { label: 'Básico', services: [{ name: 'Diseño Web', description: 'd' }, { name: 'SEO' }] },
  { label: 'Completo', services: [{ name: 'Diseño Web', description: 'd' }, { name: 'SEO' }, { name: 'Meta Ads' }] },
]
const docWith = names => ({ blocks: [{ type: 'text', paragraphs: [] }, { type: 'services', items: names.map(name => ({ name, intro: '', bullets: [] })) }] })

describe('proposalServiceSync', () => {
  it('renombra el servicio en todos los planes al editar el nombre en el editor', () => {
    const out = syncServiceRenames(docWith(['Diseño Web', 'SEO', 'Meta Ads']), docWith(['Diseño gráfico', 'SEO', 'Meta Ads']), plans)
    expect(out[0].services[0]).toEqual({ name: 'Diseño gráfico', description: 'd' })
    expect(out[1].services[0].name).toBe('Diseño gráfico')
    expect(out[1].services[1].name).toBe('SEO')
  })

  it('no propaga un nombre vacío y retoma el vínculo al seguir escribiendo', () => {
    const cleared = syncServiceRenames(docWith(['Diseño Web', 'SEO', 'Meta Ads']), docWith(['', 'SEO', 'Meta Ads']), plans)
    expect(cleared).toBe(plans)
    const typed = syncServiceRenames(docWith(['', 'SEO', 'Meta Ads']), docWith(['D', 'SEO', 'Meta Ads']), cleared)
    expect(typed[0].services[0].name).toBe('D')
  })

  it('no toca los planes si cambia otra cosa del doc', () => {
    const prev = docWith(['Diseño Web', 'SEO', 'Meta Ads'])
    const next = { ...prev, blocks: [{ type: 'text', paragraphs: ['hola'] }, prev.blocks[1]] }
    expect(syncServiceRenames(prev, next, plans)).toBe(plans)
  })

  it('al abrir, alinea un servicio que había quedado renombrado solo en el doc', () => {
    const out = reconcileServiceNames(docWith(['Diseño gráfico', 'SEO', 'Meta Ads']), plans)
    expect(out[0].services.map(s => s.name)).toEqual(['Diseño gráfico', 'SEO'])
    expect(out[1].services.map(s => s.name)).toEqual(['Diseño gráfico', 'SEO', 'Meta Ads'])
  })

  it('no empareja por orden si sobran cantidades distintas de cada lado', () => {
    expect(linkServiceItems(docWith(['Otro', 'SEO']), plans)[1]).toEqual([null, 'seo'])
  })
})
