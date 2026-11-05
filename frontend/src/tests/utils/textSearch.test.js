import { describe, it, expect } from 'vitest'
import { normalizeText, searchIndexOf, matchesSearch, matchesAnyField } from '../../utils/textSearch'

// El patrón viejo (`a.toLowerCase().includes(b.toLowerCase())`) ignoraba mayúsculas
// pero no tildes: buscar "perez" en la command palette no encontraba a "Pérez".

describe('normalizeText', () => {
  it('baja a minúsculas y saca tildes', () => {
    expect(normalizeText('Pérez')).toBe('perez')
    expect(normalizeText('DISEÑO')).toBe('diseno')
    expect(normalizeText('pingüino')).toBe('pinguino')
    expect(normalizeText('Aprobación')).toBe('aprobacion')
  })

  it('tolera null, undefined y números', () => {
    expect(normalizeText(null)).toBe('')
    expect(normalizeText(undefined)).toBe('')
    expect(normalizeText(42)).toBe('42')
  })

  it('no toca un texto que ya está normalizado', () => {
    expect(normalizeText('revision interna')).toBe('revision interna')
  })
})

describe('matchesSearch', () => {
  it('encuentra sin importar las tildes, en los dos sentidos', () => {
    expect(matchesSearch('Juan Pérez', 'perez')).toBe(true)
    expect(matchesSearch('Juan Perez', 'pérez')).toBe(true)
    expect(matchesSearch('Diseño de marca', 'diseno')).toBe(true)
    expect(matchesSearch('Diseno de marca', 'diseño')).toBe(true)
  })

  it('sigue ignorando mayúsculas', () => {
    expect(matchesSearch('Pastiza', 'PASTIZA')).toBe(true)
  })

  it('no inventa coincidencias', () => {
    expect(matchesSearch('Juan Pérez', 'gomez')).toBe(false)
  })

  it('una búsqueda vacía matchea todo (no filtra)', () => {
    expect(matchesSearch('cualquier cosa', '')).toBe(true)
    expect(matchesSearch('cualquier cosa', '   ')).toBe(false) // un espacio sí es texto
  })

  it('tolera un campo nulo', () => {
    expect(matchesSearch(null, 'algo')).toBe(false)
    expect(matchesSearch(undefined, 'algo')).toBe(false)
  })
})

describe('searchIndexOf', () => {
  // Varios lugares ordenan por "qué tan al principio matcheó", así que hace falta
  // la posición y no solo un sí/no.
  it('devuelve la posición, contando sobre el texto normalizado', () => {
    expect(searchIndexOf('Juan Pérez', 'perez')).toBe(5)
    expect(searchIndexOf('Pérez', 'perez')).toBe(0)
    expect(searchIndexOf('Juan', 'perez')).toBe(-1)
  })

  it('sin búsqueda, posición 0', () => {
    expect(searchIndexOf('lo que sea', '')).toBe(0)
  })
})

describe('matchesAnyField', () => {
  it('matchea si alguno de los campos contiene el texto', () => {
    expect(matchesAnyField(['Juan Pérez', 'juan@test.com', 'DISEÑADOR'], 'disenador')).toBe(true)
    expect(matchesAnyField(['Juan Pérez', 'juan@test.com'], 'perez')).toBe(true)
    expect(matchesAnyField(['Juan Pérez', 'juan@test.com'], 'gomez')).toBe(false)
  })

  it('ignora campos vacíos o nulos sin romperse', () => {
    expect(matchesAnyField([null, '', undefined, 'Pérez'], 'perez')).toBe(true)
    expect(matchesAnyField([null, ''], 'perez')).toBe(false)
  })

  it('sin búsqueda no filtra', () => {
    expect(matchesAnyField(['a'], '')).toBe(true)
  })
})
