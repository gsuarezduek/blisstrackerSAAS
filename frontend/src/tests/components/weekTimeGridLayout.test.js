/**
 * Reparto en columnas de los bloques que se pisan en la grilla semanal.
 *
 * Sin esto, dos bloques a la misma hora se dibujan uno encima del otro y lo que se
 * ve es el texto de los dos superpuesto — que es como se manifestó el evento que
 * venía duplicado desde Google.
 */
import { describe, test, expect } from 'vitest'
import { layoutBlocks } from '../../components/calendar/WeekTimeGrid'

const b = (id, start, end) => ({ id, start, end })
const cols = out => Object.fromEntries(out.map(x => [x.id, [x.col, x.cols]]))

describe('layoutBlocks', () => {
  test('un bloque solo ocupa todo el ancho', () => {
    expect(layoutBlocks([b('a', '09:00', '10:00')])).toEqual([
      expect.objectContaining({ id: 'a', col: 0, cols: 1 }),
    ])
  })

  test('dos exactamente a la misma hora se parten al medio', () => {
    expect(cols(layoutBlocks([b('a', '15:00', '16:00'), b('b', '15:00', '16:00')])))
      .toEqual({ a: [0, 2], b: [1, 2] })
  })

  test('los que no se tocan vuelven a ocupar todo el ancho', () => {
    expect(cols(layoutBlocks([b('a', '09:00', '10:00'), b('b', '11:00', '12:00')])))
      .toEqual({ a: [0, 1], b: [0, 1] })
  })

  test('uno que termina justo cuando arranca el otro no se considera solape', () => {
    expect(cols(layoutBlocks([b('a', '09:00', '10:00'), b('b', '10:00', '11:00')])))
      .toEqual({ a: [0, 1], b: [0, 1] })
  })

  test('un solape parcial también reparte', () => {
    expect(cols(layoutBlocks([b('a', '09:00', '10:00'), b('b', '09:30', '10:30')])))
      .toEqual({ a: [0, 2], b: [1, 2] })
  })

  test('encadenados: A pisa a B y B pisa a C van los tres al mismo grupo', () => {
    // A y C no se tocan, pero tienen que quedar con el mismo ancho que B para que
    // las columnas no se desalineen a mitad del grupo.
    const out = cols(layoutBlocks([b('a', '09:00', '10:00'), b('b', '09:30', '11:00'), b('c', '10:30', '12:00')]))
    expect(out.b[1]).toBe(2)
    expect(out.a[1]).toBe(2)
    expect(out.c[1]).toBe(2)
    // C reusa la columna que liberó A.
    expect(out.c[0]).toBe(out.a[0])
  })

  test('tres a la misma hora se parten en tres', () => {
    const out = layoutBlocks([b('a', '15:00', '16:00'), b('b', '15:00', '16:00'), b('c', '15:00', '16:00')])
    expect(out.every(x => x.cols === 3)).toBe(true)
    expect(new Set(out.map(x => x.col)).size).toBe(3)
  })

  test('conserva las props del bloque y no toca el array original', () => {
    const input = [{ id: 'a', start: '09:00', end: '10:00', title: 'Reunión', color: '#4285F4' }]
    const out = layoutBlocks(input)
    expect(out[0]).toMatchObject({ title: 'Reunión', color: '#4285F4' })
    expect(input[0].col).toBeUndefined()
  })

  test('sin bloques no explota', () => {
    expect(layoutBlocks([])).toEqual([])
  })
})
