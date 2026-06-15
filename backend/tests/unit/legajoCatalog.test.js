const {
  DEFAULT_LEGAJO_FIELDS,
  resolveLegajoFields,
  sanitizeLegajoFieldsInput,
  coerceCustomValue,
} = require('../../src/lib/legajoCatalog')

describe('legajoCatalog', () => {
  describe('resolveLegajoFields', () => {
    test('config vacía → devuelve todos los builtins', () => {
      const out = resolveLegajoFields([])
      expect(out).toHaveLength(DEFAULT_LEGAJO_FIELDS.length)
      expect(out.every(f => f.builtin)).toBe(true)
      expect(out.find(f => f.key === 'phone')).toBeTruthy()
    })

    test('re-agrega builtins faltantes en una config vieja', () => {
      const out = resolveLegajoFields([{ key: 'phone', label: 'Cel', required: true }])
      // phone editado conserva required, y aparecen el resto de builtins
      expect(out.find(f => f.key === 'phone').required).toBe(true)
      expect(out).toHaveLength(DEFAULT_LEGAJO_FIELDS.length)
    })

    test('orden secuencial reasignado', () => {
      const out = resolveLegajoFields([])
      out.forEach((f, i) => expect(f.order).toBe(i))
    })
  })

  describe('sanitizeLegajoFieldsInput', () => {
    test('rechaza no-array', () => {
      expect(() => sanitizeLegajoFieldsInput({})).toThrow(/array/)
    })

    test('blinda type/column de un builtin manipulado', () => {
      const out = sanitizeLegajoFieldsInput([
        { key: 'phone', type: 'number', column: 'hack', label: 'Tel' },
      ])
      const phone = out.find(f => f.key === 'phone')
      expect(phone.type).toBe('text')      // forzado desde el catálogo
      expect(phone.column).toBe('phone')    // no se puede reapuntar
      expect(phone.label).toBe('Tel')       // label sí editable
    })

    test('campo select custom sin opciones lanza 400', () => {
      let err
      try { sanitizeLegajoFieldsInput([{ key: 'talle', type: 'select', label: 'Talle', options: [] }]) }
      catch (e) { err = e }
      expect(err).toBeTruthy()
      expect(err.status).toBe(400)
    })

    test('claves duplicadas lanzan 400', () => {
      let err
      try { sanitizeLegajoFieldsInput([{ key: 'x', label: 'A' }, { key: 'x', label: 'B' }]) }
      catch (e) { err = e }
      expect(err?.status).toBe(400)
    })

    test('agrega un custom y mantiene los builtins', () => {
      const out = sanitizeLegajoFieldsInput([
        { key: 'remera', label: 'Talle remera', type: 'text', group: 'Otros' },
      ])
      expect(out.find(f => f.key === 'remera')?.builtin).toBe(false)
      expect(out).toHaveLength(DEFAULT_LEGAJO_FIELDS.length + 1)
    })
  })

  describe('coerceCustomValue', () => {
    test('number', () => {
      expect(coerceCustomValue({ type: 'number' }, '5')).toBe(5)
      expect(coerceCustomValue({ type: 'number' }, 'abc')).toBeUndefined()
    })
    test('boolean', () => {
      expect(coerceCustomValue({ type: 'boolean' }, 'true')).toBe(true)
      expect(coerceCustomValue({ type: 'boolean' }, 'false')).toBe(false)
    })
    test('vacío → undefined', () => {
      expect(coerceCustomValue({ type: 'text' }, '')).toBeUndefined()
      expect(coerceCustomValue({ type: 'text' }, null)).toBeUndefined()
    })
    test('texto', () => {
      expect(coerceCustomValue({ type: 'text' }, 'hola')).toBe('hola')
    })
  })
})
