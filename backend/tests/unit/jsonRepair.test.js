const { sanitizeTrailingCommas, parseLooseJson } = require('../../src/lib/jsonRepair')

describe('sanitizeTrailingCommas', () => {
  it('quita comas colgantes antes de } y ]', () => {
    expect(sanitizeTrailingCommas('{"a":1,}')).toBe('{"a":1}')
    expect(sanitizeTrailingCommas('[1,2,]')).toBe('[1,2]')
    expect(sanitizeTrailingCommas('{"a":[1,2,],"b":3,}')).toBe('{"a":[1,2],"b":3}')
  })

  it('no toca JSON ya válido', () => {
    expect(sanitizeTrailingCommas('{"a":1}')).toBe('{"a":1}')
  })
})

describe('parseLooseJson', () => {
  it('parsea JSON válido directo', () => {
    expect(parseLooseJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('quita un code fence ```json ... ``` antes de parsear', () => {
    expect(parseLooseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parseLooseJson('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('repara una coma colgante como fallback', () => {
    expect(parseLooseJson('{"a":1,"b":[1,2,],}')).toEqual({ a: 1, b: [1, 2] })
  })

  it('JSON truncado (incompleto) sigue fallando — no es reparable con un regex', () => {
    expect(() => parseLooseJson('{"a":1,"b":[1,2')).toThrow(/No se pudo interpretar/)
  })

  it('el error lanzado conserva el texto crudo en rawText', () => {
    try {
      parseLooseJson('{not json')
      throw new Error('no debería llegar acá')
    } catch (err) {
      expect(err.rawText).toBe('{not json')
    }
  })
})
