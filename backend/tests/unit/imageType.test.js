const { detectImageType, validateImageUpload } = require('../../src/lib/imageType')

// Helpers para armar buffers con la firma correcta + relleno hasta ≥12 bytes.
const pad = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(12)])
const PNG  = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0])
const GIF  = Buffer.from('GIF89a' + '\0'.repeat(8))
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(4)])

describe('detectImageType', () => {
  test('detecta formatos raster por magic bytes', () => {
    expect(detectImageType(PNG)).toBe('image/png')
    expect(detectImageType(JPEG)).toBe('image/jpeg')
    expect(detectImageType(GIF)).toBe('image/gif')
    expect(detectImageType(WEBP)).toBe('image/webp')
  })

  test('rechaza SVG (vector de XSS) y basura', () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull()
    expect(detectImageType(Buffer.from('<?xml version="1.0"?><svg/>'))).toBeNull()
    expect(detectImageType(Buffer.from('no soy una imagen'))).toBeNull()
    expect(detectImageType(Buffer.alloc(4))).toBeNull() // muy corto
    expect(detectImageType(null)).toBeNull()
  })
})

describe('validateImageUpload', () => {
  test('acepta sólo los MIME permitidos', () => {
    expect(validateImageUpload(PNG, ['image/png', 'image/jpeg', 'image/webp'])).toEqual({ ok: true, mimeType: 'image/png' })
    // GIF no está en la allowlist de logo/banner → rechazado aunque sea imagen válida
    expect(validateImageUpload(GIF, ['image/png', 'image/jpeg', 'image/webp']).ok).toBe(false)
    // pero sí en avatares
    expect(validateImageUpload(GIF, ['image/png', 'image/jpeg', 'image/webp', 'image/gif']).ok).toBe(true)
  })

  test('rechaza SVG con error legible', () => {
    const r = validateImageUpload(Buffer.from('<svg/>'), ['image/png', 'image/jpeg', 'image/webp'])
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no es una imagen válida|no está permitido/)
  })
})
