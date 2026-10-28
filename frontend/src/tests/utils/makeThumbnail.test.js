import { describe, it, expect } from 'vitest'
import { thumbSize } from '../../components/projectFiles/makeThumbnail'

// El resto de makeThumbnail.js depende de canvas/<video>, que jsdom no
// implementa; thumbSize es la única lógica pura y la que define el peso real
// de la miniatura que se sube.
describe('thumbSize', () => {
  it('lleva el lado más largo a 400 manteniendo la proporción', () => {
    expect(thumbSize(800, 600)).toEqual({ w: 400, h: 300 })
    expect(thumbSize(600, 800)).toEqual({ w: 300, h: 400 })
  })

  it('no agranda una imagen que ya es más chica que el tope', () => {
    expect(thumbSize(100, 50)).toEqual({ w: 100, h: 50 })
    expect(thumbSize(400, 400)).toEqual({ w: 400, h: 400 })
  })

  it('nunca devuelve un lado en 0 (un panorama muy angosto redondearía a 0)', () => {
    expect(thumbSize(4000, 3)).toEqual({ w: 400, h: 1 })
  })

  it('escala un video vertical de 4K al tope del lado largo', () => {
    expect(thumbSize(2160, 3840)).toEqual({ w: 225, h: 400 })
  })
})
