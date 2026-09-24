import { describe, it, expect } from 'vitest'
import { renderProposalDoc } from '../../components/ventas/proposalDocHtml'

const svc = (name, description = '') => ({ name, description })
const plans = [
  { label: 'Inicial', price: 920000, currency: 'ARS', services: [svc('Meta'), svc('Redes')] },
  { label: 'Crecimiento', price: 1350000, currency: 'ARS', services: [svc('Meta'), svc('Redes'), svc('Web')] },
]

describe('renderProposalDoc', () => {
  it('escapa HTML en todos los textos y solo interpreta **negrita**', () => {
    const html = renderProposalDoc({
      title: '<script>alert(1)</script>',
      subtitle: '<img src=x onerror=alert(1)>',
      blocks: [{ type: 'text', paragraphs: ['hola **mundo** <b>x</b>'] }],
    }, { plans: [] })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('<strong>mundo</strong>')
  })

  it('ignora tipos de bloque desconocidos', () => {
    expect(renderProposalDoc({ blocks: [{ type: 'iframe', src: 'x' }] }, { plans: [] })).not.toContain('iframe')
  })

  it('la tabla de precios sale de los planes: precios exactos y check por plan', () => {
    const html = renderProposalDoc({ blocks: [{ type: 'pricing', heading: 'Inversión' }] }, { plans })
    expect(html).toContain('ARS 920.000')
    expect(html).toContain('ARS 1.350.000')
    // "Web" solo está en Crecimiento: una celda vacía "—" y un "✓ Incluido" extra
    expect(html.match(/✓ Incluido/g)).toHaveLength(5)
    expect(html).toContain('pd-no')
  })

  it('badge de servicio: "Ambos planes" si están en todos, o el nombre del plan que lo incluye', () => {
    const html = renderProposalDoc({ blocks: [{ type: 'services', items: [{ name: 'meta', bullets: ['x'] }] }] }, { plans })
    expect(html).toContain('Ambos planes')
    expect(html).toContain('>Crecimiento<') // badge del servicio Web
  })

  it('un plan sin precio muestra "A definir"', () => {
    const html = renderProposalDoc({ blocks: [{ type: 'pricing' }] }, { plans: [{ label: 'X', price: null, services: [] }] })
    expect(html).toContain('A definir')
  })

  it('el valor de las barras se acota a 0-100 y el color de marca inválido cae al default', () => {
    const html = renderProposalDoc({ blocks: [{ type: 'bars', items: [{ label: 'a', value: 999 }] }] }, { plans: [], accent: 'no-es-color' })
    expect(html).toContain('width:100%')
    expect(html).toContain('--accent:#f7931a')
  })
})
