const { canHaveThumbnail } = require('../../src/controllers/projects/projectFiles.controller')

// Qué archivos de la Nube llevan portada propia (`ProjectFile.posterKey`).
//
// Es la mitad de servidor de una decisión que se toma en el browser: el que
// genera los píxeles es `makeThumbnail` (frontend), y este predicado es su
// espejo — si acepta un tipo que el browser no sabe rasterizar, nadie va a
// mandar nunca esa miniatura; si rechaza uno que el browser sí dibuja, la
// subida de la miniatura muere en un 400 y el archivo se queda con el ícono.
describe('canHaveThumbnail', () => {
  it('acepta imagen y video, que el navegador decodifica solo', () => {
    expect(canHaveThumbnail('image/png')).toBe(true)
    expect(canHaveThumbnail('image/webp')).toBe(true)
    expect(canHaveThumbnail('video/mp4')).toBe(true)
    expect(canHaveThumbnail('video/quicktime')).toBe(true)
  })

  it('acepta PDF: su primera página es la portada que lo hace reconocible', () => {
    expect(canHaveThumbnail('application/pdf')).toBe(true)
  })

  it('rechaza lo que el browser no puede rasterizar — ahí va el ícono por tipo', () => {
    expect(canHaveThumbnail('application/msword')).toBe(false)
    expect(canHaveThumbnail('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false)
    expect(canHaveThumbnail('application/zip')).toBe(false)
    expect(canHaveThumbnail('text/plain')).toBe(false)
  })

  it('no se cae con un mimeType ausente (una fila vieja o una carpeta)', () => {
    expect(canHaveThumbnail(null)).toBe(false)
    expect(canHaveThumbnail(undefined)).toBe(false)
    expect(canHaveThumbnail('')).toBe(false)
  })
})
