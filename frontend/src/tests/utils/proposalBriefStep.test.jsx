import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProposalBriefStep, { initialBriefState } from '../../components/ventas/ProposalBriefStep'

const brief = {
  understanding: ['Es una carnicería que se transforma'],
  questions: [{ id: 'q1', question: '¿Qué plan recomendamos?', why: 'Cambia el foco', kind: 'single', options: ['Inicial', 'Crecimiento'], recommended: ['Crecimiento'] }],
  missing: ['Cantidad de sucursales'],
  sections: [{ key: 'expansion', label: 'Historia de expansión / lanzamiento', include: false, reason: 'No hay aperturas' }],
}

describe('ProposalBriefStep', () => {
  it('muestra lo entendido, la pregunta con la opción sugerida, los datos faltantes y las secciones', () => {
    render(<ProposalBriefStep brief={brief} state={initialBriefState(brief)} onChange={() => {}} />)
    expect(screen.getByText('Es una carnicería que se transforma')).toBeTruthy()
    expect(screen.getByText(/¿Qué plan recomendamos\?/)).toBeTruthy()
    expect(screen.getByText(/★ sugerida/)).toBeTruthy()
    expect(screen.getByText('Cantidad de sucursales')).toBeTruthy()
    expect(screen.getByText('Historia de expansión / lanzamiento')).toBeTruthy()
  })

  it('elegir otra opción en una pregunta single reemplaza la selección', () => {
    const onChange = vi.fn()
    render(<ProposalBriefStep brief={brief} state={initialBriefState(brief)} onChange={onChange} />)
    fireEvent.click(screen.getByText('Inicial'))
    expect(onChange.mock.calls[0][0].answers.q1.selected).toEqual(['Inicial'])
  })

  it('prender una sección descartada por la IA la marca en el estado', () => {
    const onChange = vi.fn()
    render(<ProposalBriefStep brief={brief} state={initialBriefState(brief)} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange.mock.calls[0][0].sections.expansion).toBe(true)
  })
})
