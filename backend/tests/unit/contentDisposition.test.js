const { safeContentDisposition } = require('../../src/lib/contentDisposition')

// El header viaja por dos caminos con reglas distintas: lo escribe Node en un
// response (latin-1) o viaja URL-encodeado en UTF-8 dentro de una URL firmada
// de R2. Lo que se fija acá es que el nombre llegue igual por los dos.
describe('safeContentDisposition', () => {
  // Lo que un navegador usaría realmente: prefiere `filename*` y lo decodifica
  // como UTF-8; si no está, cae al `filename` entre comillas.
  function effectiveName(header) {
    const star = /filename\*=UTF-8''([^;]+)/.exec(header)
    if (star) return decodeURIComponent(star[1])
    return /filename="([^"]*)"/.exec(header)?.[1]
  }

  it('deja un nombre ASCII sin filename* (no hace falta)', () => {
    const h = safeContentDisposition('informe final.pdf')
    expect(h).toBe('attachment; filename="informe final.pdf"')
    expect(effectiveName(h)).toBe('informe final.pdf')
  })

  // La regresión que esto arregla: `content-disposition` omitía filename* para
  // nombres que entran en ISO-8859-1, y entonces R2 devolvía "Ã±" en la URL
  // firmada (el valor se encodea en UTF-8 y el navegador lee latin-1).
  it('agrega filename* para nombres latin-1 que la librería dejaría crudos', () => {
    const h = safeContentDisposition('video con ñ y acentós.mp4')
    expect(h).toContain("filename*=UTF-8''")
    expect(effectiveName(h)).toBe('video con ñ y acentós.mp4')
  })

  it('conserva el filename* que la librería ya genera para nombres no latin-1', () => {
    const name = 'Diseño – versión 2 (café).pdf'
    const h = safeContentDisposition(name)
    // Un solo filename*, no dos.
    expect(h.match(/filename\*=/g)).toHaveLength(1)
    expect(effectiveName(h)).toBe(name)
  })

  it('sobrevive a un emoji en el nombre', () => {
    expect(effectiveName(safeContentDisposition('emoji 🎬 final.mp4'))).toBe('emoji 🎬 final.mp4')
  })

  // Caracteres que encodeURIComponent NO escapa y que no son attr-char: un
  // apóstrofo suelto partiría el valor de filename* en dos.
  it('escapa los caracteres que romperían el parseo de filename*', () => {
    const h = safeContentDisposition("raro 'quote' y ñ.pdf")
    expect(h).toContain("filename*=UTF-8''")
    expect(/filename\*=UTF-8''[^;']+$/.test(h)).toBe(true)
    expect(effectiveName(h)).toBe("raro 'quote' y ñ.pdf")
  })

  it('respeta el type inline (preview) además del attachment por default', () => {
    expect(safeContentDisposition('a.pdf', { type: 'inline' })).toMatch(/^inline;/)
    expect(safeContentDisposition('ñ.pdf', { type: 'inline' })).toMatch(/^inline;/)
    expect(safeContentDisposition('a.pdf')).toMatch(/^attachment;/)
  })

  it('cae a un nombre por default si viene vacío o basura', () => {
    expect(safeContentDisposition('')).toContain('archivo')
    expect(safeContentDisposition(null)).toContain('archivo')
    expect(safeContentDisposition('   ')).toContain('archivo')
  })
})
