const { detectVideoType, validateMediaHeader } = require('../../src/lib/mediaType')

// Helpers para armar buffers con la firma correcta + relleno hasta ≥12 bytes.
const pad = (bytes, total = 16) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(Math.max(total - bytes.length, 0))])

function ftypBuffer(brand) {
  // [size 4 bytes cualquiera] 'ftyp' [major brand 4 bytes]
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftyp'),
    Buffer.from(brand),
    Buffer.alloc(4),
  ])
}

const MP4_ISOM = ftypBuffer('isom')
const MP4_MP42 = ftypBuffer('mp42')
const MOV      = ftypBuffer('qt  ')
const WEBM     = pad([0x1a, 0x45, 0xdf, 0xa3])
const PNG      = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // no es video

describe('detectVideoType', () => {
  test('detecta MP4 por major brand genérico', () => {
    expect(detectVideoType(MP4_ISOM)).toBe('video/mp4')
    expect(detectVideoType(MP4_MP42)).toBe('video/mp4')
  })

  test('distingue MOV (QuickTime) del MP4 genérico por el major brand "qt  "', () => {
    expect(detectVideoType(MOV)).toBe('video/quicktime')
  })

  test('detecta WebM por el header EBML', () => {
    expect(detectVideoType(WEBM)).toBe('video/webm')
  })

  test('rechaza una imagen y basura', () => {
    expect(detectVideoType(PNG)).toBeNull()
    expect(detectVideoType(Buffer.from('no soy un video'))).toBeNull()
    expect(detectVideoType(Buffer.alloc(4))).toBeNull() // muy corto
    expect(detectVideoType(null)).toBeNull()
  })

  test('un archivo renombrado a .mp4 que en realidad es otra cosa no pasa por video', () => {
    // Caso del riesgo de F3: "un archivo renombrado a .mp4 que no es video se
    // rechaza en el confirm" — acá se prueba el detector que sostiene esa regla.
    const fakeMp4 = Buffer.concat([Buffer.from('esto no es un mp4 de verdad'), Buffer.alloc(4)])
    expect(detectVideoType(fakeMp4)).toBeNull()
  })
})

describe('validateMediaHeader', () => {
  test('acepta un mimeType de la whitelist para kind=video', () => {
    expect(validateMediaHeader(MP4_ISOM, 'video', ['video/mp4', 'video/quicktime'])).toEqual({ ok: true, mimeType: 'video/mp4' })
  })

  test('rechaza un video real si el mimeType no está en la whitelist del kind', () => {
    const r = validateMediaHeader(WEBM, 'video', ['video/mp4', 'video/quicktime'])
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no es un video válido/)
  })

  test('kind=image sigue usando el detector de imágenes (no confunde video con imagen)', () => {
    expect(validateMediaHeader(PNG, 'image', ['image/png']).ok).toBe(true)
    expect(validateMediaHeader(MP4_ISOM, 'image', ['image/png']).ok).toBe(false)
  })
})
