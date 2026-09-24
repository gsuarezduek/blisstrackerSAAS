const { htmlToText } = require('../../src/lib/htmlText')

describe('htmlToText', () => {
  it('convierte HTML del WYSIWYG a texto con saltos entre bloques', () => {
    const t = htmlToText('<h2>Reunión</h2><p>Quieren <strong>crecer</strong></p><ul><li>Sucursal 1</li><li>Sucursal 2</li></ul>')
    expect(t).toBe('Reunión\nQuieren crecer\n- Sucursal 1\n- Sucursal 2')
  })
  it('devuelve vacío ante null/undefined y respeta el tope', () => {
    expect(htmlToText(null)).toBe('')
    expect(htmlToText('<p>' + 'a'.repeat(50) + '</p>', 10)).toHaveLength(10)
  })
})
