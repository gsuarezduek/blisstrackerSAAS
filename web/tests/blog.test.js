import { describe, it, expect } from 'vitest'
import { listPath, postPath, formatDate, POSTS_PER_PAGE } from '../lib/blog.js'

describe('rutas del blog', () => {
  it('la página 1 del listado es /blog y no /blog/pagina/1', () => {
    // Dos URLs con el mismo contenido es contenido duplicado: la 1 vive sólo en /blog.
    expect(listPath(1)).toBe('/blog')
    expect(listPath(0)).toBe('/blog')
  })

  it('las páginas siguientes van a /blog/pagina/N', () => {
    expect(listPath(2)).toBe('/blog/pagina/2')
    expect(listPath(7)).toBe('/blog/pagina/7')
  })

  it('el path de un post incluye el slug', () => {
    expect(postPath('como-ordenar-tu-agencia')).toBe('/blog/como-ordenar-tu-agencia')
  })

  it('el tamaño de página no supera el tope del backend (30)', () => {
    expect(POSTS_PER_PAGE).toBeLessThanOrEqual(30)
  })
})

describe('formatDate', () => {
  it('formatea en español', () => {
    expect(formatDate('2026-03-15T12:00:00.000Z')).toMatch(/marzo/)
  })

  it('devuelve vacío sin fecha', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
  })
})
