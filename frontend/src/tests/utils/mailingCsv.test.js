// Importación de contactos de Mailing: el CSV se parsea en el browser para poder
// mostrar el mapeo de columnas antes de mandar nada.
import { describe, it, expect } from 'vitest'
import { parseCsv, detectSeparator, guessMapping, mapRows, fieldKey } from '../../components/marketing/mailing/csv'

describe('csv de contactos', () => {
  it('detecta el ; del Excel en español aunque haya comas dentro de comillas', () => {
    expect(detectSeparator('"Apellido, Nombre";Email;Ciudad')).toBe(';')
    expect(detectSeparator('email,nombre')).toBe(',')
  })

  it('parsea comillas, comillas escapadas, saltos de línea dentro de un campo y CRLF', () => {
    const rows = parseCsv('email,nota\r\na@b.com,"dijo ""hola""\nchau"\r\n\r\n', ',')
    expect(rows).toEqual([['email', 'nota'], ['a@b.com', 'dijo "hola"\nchau']])
  })

  it('adivina el mapeo y manda el resto como variables personalizadas', () => {
    const headers = ['Correo electrónico', 'Nombre', 'Apellido', 'Ciudad', '']
    const mapping = guessMapping(headers)
    expect(mapping).toEqual(['email', 'firstName', 'lastName', 'field', 'skip'])
    const rows = mapRows([['a@b.com', 'Ana', 'Pérez', 'Rosario', 'x']], headers, mapping)
    expect(rows).toEqual([{ email: 'a@b.com', firstName: 'Ana', lastName: 'Pérez', fields: { ciudad: 'Rosario' } }])
  })

  it('la clave de la variable sale del encabezado sin tildes ni espacios', () => {
    expect(fieldKey('Código Postal')).toBe('codigo_postal')
  })
})
