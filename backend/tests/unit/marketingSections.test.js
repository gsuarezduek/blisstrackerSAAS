const {
  MARKETING_SECTION_IDS, MARKETING_HIDDEN_SECTIONS, isMarketingSectionHidden,
} = require('../../src/lib/marketingSections')

describe('isMarketingSectionHidden', () => {
  it('oculta lo apagado en el código para todos los workspaces', () => {
    expect(isMarketingSectionHidden('hoy', [])).toBe(true)
    expect(isMarketingSectionHidden('hoy')).toBe(true)
  })

  it('oculta lo que el workspace apagó en Preferencias', () => {
    expect(isMarketingSectionHidden('rrss', ['rrss', 'anuncios'])).toBe(true)
    expect(isMarketingSectionHidden('rrss', [])).toBe(false)
    expect(isMarketingSectionHidden('informes', null)).toBe(false)
  })

  it('las secciones ocultas son ids reales del NAV', () => {
    for (const id of MARKETING_HIDDEN_SECTIONS) expect(MARKETING_SECTION_IDS).toContain(id)
  })
})
