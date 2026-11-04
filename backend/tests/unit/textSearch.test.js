const { stripAccents, accentVariants, buildTextSearchFilters } = require('../../src/lib/textSearch')

// Ver lib/textSearch.js: ILIKE ignora mayúsculas pero no tildes, y exige la
// subcadena exacta. Las dos cosas hacían que un agente creyera que una tarea no
// existía y la duplicara.

describe('stripAccents', () => {
  it('saca tildes y diéresis, y la ñ pasa a n', () => {
    expect(stripAccents('Aprobación de diseño')).toBe('Aprobacion de diseno')
    expect(stripAccents('MAÑANA')).toBe('MANANA')
    expect(stripAccents('pingüino')).toBe('pinguino')
  })

  it('no toca un texto sin tildes', () => {
    expect(stripAccents('revision interna')).toBe('revision interna')
  })
})

describe('accentVariants', () => {
  // La regla que hace esto viable: en español una palabra lleva como máximo UNA
  // tilde, así que las variantes son una por vocal y no 2^vocales.
  it('desde una palabra sin tildes llega a la acentuada', () => {
    expect(accentVariants('aprobacion')).toContain('aprobación')
  })

  it('y desde la acentuada llega a la plana (funciona en los dos sentidos)', () => {
    const variants = accentVariants('aprobación')
    expect(variants).toContain('aprobacion')
    expect(variants).toContain('aprobación')
  })

  it('cubre la ñ', () => {
    expect(accentVariants('manana')).toContain('mañana')
    expect(accentVariants('diseno')).toContain('diseño')
  })

  it('devuelve todo en minúscula: de las mayúsculas se encarga ILIKE', () => {
    expect(accentVariants('Aprobación').every(v => v === v.toLowerCase())).toBe(true)
  })

  it('la cantidad de variantes es lineal, no combinatoria', () => {
    // "aprobacion": 5 vocales + la n → 6 variantes acentuadas + la plana.
    expect(accentVariants('aprobacion')).toHaveLength(7)
    // La cota es "una por posición de la palabra, más la plana" — nunca 2^vocales,
    // que para esta palabra serían 16384.
    for (const word of ['internacionalizacion', 'aprobacion', 'disenio', 'calendario']) {
      expect(accentVariants(word).length).toBeLessThanOrEqual(word.length + 1)
    }
  })

  it('una palabra sin vocales ni n se devuelve tal cual', () => {
    expect(accentVariants('css')).toEqual(['css'])
  })
})

describe('buildTextSearchFilters', () => {
  const filters = (q) => buildTextSearchFilters(q, 'description')

  it('sin texto no filtra nada', () => {
    expect(filters('')).toBeNull()
    expect(filters('   ')).toBeNull()
    expect(filters(undefined)).toBeNull()
  })

  // Cada palabra es un AND separado: pueden estar en cualquier orden y con
  // cualquier cosa en el medio ("redactar posteos" encuentra "Redactar 3 posteos").
  it('una condición por palabra, combinadas con AND', () => {
    const out = filters('redactar posteos')
    expect(out).toHaveLength(2)
    expect(out[0].OR[0]).toEqual({ description: { contains: 'redactar', mode: 'insensitive' } })
    expect(out[1].OR.some(c => c.description.contains === 'posteos')).toBe(true)
  })

  it('cada palabra lleva sus variantes con tilde', () => {
    const [word] = filters('aprobacion')
    expect(word.OR.map(c => c.description.contains)).toContain('aprobación')
  })

  it('descarta palabras de una sola letra, que matchean todo', () => {
    const out = filters('a posteos')
    expect(out).toHaveLength(1)
    expect(out[0].OR.some(c => c.description.contains === 'posteos')).toBe(true)
  })

  // Si todas las palabras son inútiles, mejor buscar la frase tal cual que
  // quedarse sin filtro y devolver todo.
  it('sin ninguna palabra útil cae a la frase literal', () => {
    expect(filters('a 1')).toEqual([{ description: { contains: 'a 1', mode: 'insensitive' } }])
  })

  it('topea la cantidad de palabras', () => {
    expect(filters('una dos tres cuatro cinco seis siete ocho')).toHaveLength(6)
  })
})
