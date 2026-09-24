const { normalizeDoc, normalizeBlock } = require('../../src/lib/proposalDoc')

describe('normalizeBlock', () => {
  it('descarta tipos desconocidos y no-objetos', () => {
    expect(normalizeBlock({ type: 'script', text: 'x' })).toBeNull()
    expect(normalizeBlock(null)).toBeNull()
    expect(normalizeBlock('text')).toBeNull()
  })

  it('recorta strings, topea columnas y filtra items vacíos en cards', () => {
    const b = normalizeBlock({
      type: 'cards', columns: 9, variant: 'raro',
      items: [{ title: 'A', text: 'x' }, { title: '', text: '' }, 'basura'],
    })
    expect(b.columns).toBe(4)
    expect(b.variant).toBe('plain')
    expect(b.items).toHaveLength(1)
  })

  it('acota los valores de bars a 0-100 y exige label', () => {
    const b = normalizeBlock({ type: 'bars', items: [{ label: 'a', value: 250 }, { label: 'b', value: -5 }, { label: '', value: 10 }] })
    expect(b.items).toEqual([{ label: 'a', value: 100 }, { label: 'b', value: 0 }])
  })

  it('before_after aplica etiquetas por defecto', () => {
    const b = normalizeBlock({ type: 'before_after', from: 'a', to: 'b' })
    expect(b.fromLabel).toBe('Hoy')
    expect(b.toLabel).toBe('Hacia dónde vamos')
  })
})

describe('normalizeDoc', () => {
  it('tolera basura y devuelve un doc vacío válido', () => {
    expect(normalizeDoc(null)).toEqual({ title: '', subtitle: '', lead: '', blocks: [] })
    expect(normalizeDoc({ blocks: 'no' }).blocks).toEqual([])
  })

  it('al editar (default) no resucita services/pricing borrados', () => {
    const doc = normalizeDoc({ blocks: [{ type: 'text', paragraphs: ['hola'] }] })
    expect(doc.blocks.map(b => b.type)).toEqual(['text'])
  })

  it('al generar garantiza services y pricing, servicios antes que inversión y cierre al final', () => {
    const doc = normalizeDoc({
      blocks: [
        { type: 'closing', quote: 'fin' },
        { type: 'pricing' },
        { type: 'text', paragraphs: ['a'] },
        { type: 'services', items: [{ name: 'SEO' }] },
      ],
    }, { ensureRequired: true })
    expect(doc.blocks.map(b => b.type)).toEqual(['text', 'services', 'pricing', 'closing'])
  })

  it('al generar agrega services y pricing si la IA los omitió', () => {
    const doc = normalizeDoc({ blocks: [{ type: 'text', paragraphs: ['a'] }] }, { ensureRequired: true })
    expect(doc.blocks.map(b => b.type)).toEqual(['text', 'services', 'pricing'])
  })

  it('deja un solo closing y lo pone último', () => {
    const doc = normalizeDoc({ blocks: [{ type: 'closing', quote: 'a' }, { type: 'closing', quote: 'b' }, { type: 'text' }] }, { ensureRequired: true })
    expect(doc.blocks.filter(b => b.type === 'closing')).toHaveLength(1)
    expect(doc.blocks[doc.blocks.length - 1].type).toBe('closing')
  })
})
