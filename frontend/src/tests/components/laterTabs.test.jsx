import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LaterTabs from '../../components/dashboard/LaterTabs'

describe('LaterTabs — punto de alerta', () => {
  const renderTabs = tabs => render(<LaterTabs tabs={tabs} value="hoy" onChange={() => {}} />)

  it('true pinta un punto rojo con el texto por defecto', () => {
    renderTabs([{ key: 'hoy', label: 'Para hoy', alert: true }])
    const dot = screen.getByRole('img', { name: 'Requiere atención' })
    expect(dot.className).toMatch(/bg-red-500/)
  })

  it("'orange' pinta un punto naranja con su propio texto", () => {
    renderTabs([{ key: 'hoy', label: 'Para hoy', alert: 'orange', alertLabel: 'Hay contenido que publica pronto' }])
    const dot = screen.getByRole('img', { name: 'Hay contenido que publica pronto' })
    expect(dot.className).toMatch(/bg-orange-500/)
  })

  it('sin alert no hay punto', () => {
    renderTabs([{ key: 'hoy', label: 'Para hoy', alert: null }])
    expect(screen.queryByRole('img')).toBeNull()
  })
})
