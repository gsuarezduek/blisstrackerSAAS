import { describe, it, expect } from 'vitest'
import { PAGE_META, DESCRIPTION_MIN, DESCRIPTION_MAX, clampDescription, metaFor } from '../lib/pageMeta.js'

// Lo que estos tests protegen es exactamente lo que estaba roto antes de separar el
// sitio: un solo title, una sola description y un solo canonical (el de la home) para
// todas las rutas. Si alguien agrega una página y le copia el title de otra, falla acá.
describe('metadata de las páginas públicas', () => {
  const entries = Object.entries(PAGE_META)

  it('cada ruta tiene title y description', () => {
    for (const [path, meta] of entries) {
      expect(meta.title, `${path} sin title`).toBeTruthy()
      expect(meta.description, `${path} sin description`).toBeTruthy()
    }
  })

  it('la description mide entre 150 y 160 caracteres', () => {
    const fuera = entries
      .filter(([, m]) => m.description.length < DESCRIPTION_MIN || m.description.length > DESCRIPTION_MAX)
      .map(([path, m]) => `${path} → ${m.description.length}`)
    expect(fuera).toEqual([])
  })

  it('no hay dos rutas con el mismo title', () => {
    const titles = entries.map(([, m]) => m.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('no hay dos rutas con la misma description', () => {
    const descs = entries.map(([, m]) => m.description)
    expect(new Set(descs).size).toBe(descs.length)
  })

  it('metaFor falla si la ruta no está en el catálogo', () => {
    expect(() => metaFor('/no-existe')).toThrow(/no hay title\/description/i)
  })
})

describe('clampDescription', () => {
  it('deja intacto un texto que ya entra', () => {
    expect(clampDescription('Un texto corto.')).toBe('Un texto corto.')
  })

  it('recorta al máximo sin partir una palabra', () => {
    const largo = 'palabra '.repeat(40)
    const out = clampDescription(largo)
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toMatch(/palab…$/) // no corta al medio de una palabra
  })

  it('normaliza los saltos de línea y los espacios de más', () => {
    expect(clampDescription('  hola\n\n  mundo  ')).toBe('hola mundo')
  })

  it('tolera null y undefined', () => {
    expect(clampDescription(null)).toBe('')
    expect(clampDescription(undefined)).toBe('')
  })
})
