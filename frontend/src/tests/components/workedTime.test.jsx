import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WorkedTime from '../../components/ui/WorkedTime'

// El formato interno acordado: total protagonista + desglose persona/agentes.
describe('WorkedTime', () => {
  it('muestra el total combinado y el desglose de las dos mitades', () => {
    render(<WorkedTime person={370} agent={210} label="registradas" />)
    expect(screen.getByText('9h 40m')).toBeInTheDocument()       // 370 + 210
    expect(screen.getByText(/personas/)).toBeInTheDocument()
    expect(screen.getByText('6h 10m')).toBeInTheDocument()
    expect(screen.getByText('3h 30m')).toBeInTheDocument()
    expect(screen.getByText(/registradas/)).toBeInTheDocument()
  })

  it('sin tiempo de agentes muestra solo el número de la persona, sin desglose', () => {
    render(<WorkedTime person={370} agent={0} label="registradas" />)
    expect(screen.getByText('6h 10m')).toBeInTheDocument()
    expect(screen.queryByText(/personas/)).toBeNull()
    expect(screen.queryByText(/agentes/)).toBeNull()
  })

  it('trata agent undefined/null como sin agentes', () => {
    const { container } = render(<WorkedTime person={60} />)
    expect(container.textContent).not.toMatch(/agentes/)
    expect(screen.getByText('1h 0m')).toBeInTheDocument()
  })

  it('un proyecto donde solo trabajaron agentes igual muestra el desglose', () => {
    const { container } = render(<WorkedTime person={0} agent={120} />)
    // El total y la mitad del agente son el mismo número; la humana queda explícita en 0.
    expect(screen.getAllByText('2h 0m')).toHaveLength(2)
    expect(container.textContent).toMatch(/personas 0m · agentes 2h 0m/)
  })

  it('la variante inline deja todo en una línea', () => {
    const { container } = render(<WorkedTime person={60} agent={30} variant="inline" />)
    expect(container.textContent).toMatch(/1h 30m \(personas 1h 0m · agentes 30m\)/)
  })

  it('acepta otro formateador (las vistas que miden en horas)', () => {
    render(<WorkedTime person={360} agent={60} fmt={m => `${m / 60}h`} />)
    expect(screen.getByText('7h')).toBeInTheDocument()
  })
})
