import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { linkify } from '../../utils/linkify'

function Wrapper({ text }) {
  const result = linkify(text)
  return <span>{result}</span>
}

describe('linkify', () => {
  it('devuelve array con el texto si no hay URLs', () => {
    // linkify siempre devuelve array cuando hay contenido (sin URLs → array de un string)
    const result = linkify('Texto sin links')
    expect(result).toEqual(['Texto sin links'])
  })

  it('devuelve null/undefined sin romper', () => {
    expect(linkify(null)).toBeNull()
    expect(linkify(undefined)).toBeUndefined()
  })

  it('convierte una URL en un elemento <a>', () => {
    render(<Wrapper text="Mirá https://ejemplo.com esta página" />)
    const link = screen.getByRole('link')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://ejemplo.com')
  })

  it('el link tiene target="_blank"', () => {
    render(<Wrapper text="https://ejemplo.com" />)
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank')
  })

  it('el link tiene rel="noopener noreferrer"', () => {
    render(<Wrapper text="https://ejemplo.com" />)
    expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('muestra el hostname en lugar de la URL completa', () => {
    render(<Wrapper text="https://www.google.com/search?q=test" />)
    expect(screen.getByRole('link')).toHaveTextContent('google.com')
  })

  it('convierte múltiples URLs en múltiples links', () => {
    render(<Wrapper text="Primero https://uno.com y luego https://dos.com" />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', 'https://uno.com')
    expect(links[1]).toHaveAttribute('href', 'https://dos.com')
  })

  it('preserva el texto antes y después de la URL', () => {
    render(<Wrapper text="Antes https://link.com Después" />)
    expect(screen.getByText(/Antes/)).toBeInTheDocument()
    expect(screen.getByText(/Después/)).toBeInTheDocument()
  })
})
