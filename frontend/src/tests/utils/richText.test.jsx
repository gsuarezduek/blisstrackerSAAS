import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { renderRichText } from '../../utils/richText'

const members = [
  { id: 1, name: 'Gastón Suarez' },
  { id: 10, name: 'Marti V' },
  { id: 11, name: 'Marti G' },
]

function Wrapper({ text, opts }) {
  return <span>{renderRichText(text, opts)}</span>
}

function renderWrapper(text, opts) {
  return render(
    <MemoryRouter>
      <Wrapper text={text} opts={opts} />
    </MemoryRouter>,
  )
}

describe('renderRichText', () => {
  it('devuelve el texto tal cual sin @ ni URLs', () => {
    const result = renderRichText('Texto plano', { members })
    expect(result).toEqual(['Texto plano'])
  })

  it('devuelve null/undefined sin romper', () => {
    expect(renderRichText(null, { members })).toBeNull()
    expect(renderRichText(undefined, { members })).toBeUndefined()
  })

  it('convierte una URL en un link', () => {
    renderWrapper('Mirá https://ejemplo.com esto', { members })
    const link = screen.getByRole('link', { name: 'ejemplo.com' })
    expect(link).toHaveAttribute('href', 'https://ejemplo.com')
  })

  it('una mención que matchea a un miembro navega a su perfil (/users/:id)', () => {
    renderWrapper('hola @Gastón Suarez dale una mano', { members })
    const link = screen.getByRole('link', { name: '@Gastón Suarez' })
    expect(link).toHaveAttribute('title', 'Ver perfil de Gastón Suarez')
  })

  it('una mención que no matchea a nadie queda como texto plano', () => {
    renderWrapper('hola @Nadie como va', { members })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText(/@Nadie/)).toBeInTheDocument()
  })

  it('sin members, ninguna mención es clickeable', () => {
    renderWrapper('hola @Gastón Suarez', { members: [] })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('homónimos: "@Marti V" no linkea de rebote a "Marti G"', () => {
    renderWrapper('avisale a @Marti V porfa', { members })
    const link = screen.getByRole('link', { name: '@Marti V' })
    expect(link).toHaveAttribute('title', 'Ver perfil de Marti V')
    expect(screen.queryByRole('link', { name: /Marti G/ })).not.toBeInTheDocument()
  })

  it('"@Marti" ambiguo (sin apellido) se resalta pero no es clickeable', () => {
    renderWrapper('che @Marti alguien se fija?', { members })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('@Marti')).toBeInTheDocument()
  })

  it('"@everyone" con everyone:true no se trata como persona', () => {
    renderWrapper('aviso a @everyone del equipo', { members, everyone: true })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('@everyone')).toBeInTheDocument()
  })

  it('preserva texto y URL mezclados con una mención', () => {
    renderWrapper('@Gastón Suarez mirá https://ejemplo.com por favor', { members })
    expect(screen.getByRole('link', { name: '@Gastón Suarez' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ejemplo.com' })).toBeInTheDocument()
    expect(screen.getByText(/por favor/)).toBeInTheDocument()
  })
})
