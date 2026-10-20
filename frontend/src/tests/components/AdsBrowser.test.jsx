import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdsBrowser from '../../components/marketing/networks/AdsBrowser'

const metrics = [
  { key: 'reach', label: 'Alcance', get: a => a.reach, fmt: String },
  { key: 'spend', label: 'Gasto',   get: a => a.spend, fmt: String },
  { key: 'cpr',   label: 'Costo por resultado', get: a => a.cpr, fmt: String, lowerIsBetter: true },
]

const ads = [
  { id: 1, name: 'Verano',  reach: 100, spend: 50, cpr: 5,    status: 'ACTIVE', campaignId: 'c1', campaignName: 'Camp A' },
  { id: 2, name: 'Invierno', reach: 300, spend: 10, cpr: null, status: 'PAUSED', campaignId: 'c2', campaignName: 'Camp B' },
  { id: 3, name: 'Otoño',   reach: 200, spend: 90, cpr: 2,    status: 'ACTIVE', campaignId: 'c1', campaignName: 'Camp A' },
]

const names = () => screen.getAllByTestId('ad').map(el => el.textContent)

function setup(props = {}) {
  return render(
    <MemoryRouter>
      <AdsBrowser ads={ads} metrics={metrics} defaultSort="reach" gridClass=""
        renderCard={ad => <div data-testid="ad">{ad.name}</div>} {...props} />
    </MemoryRouter>
  )
}

describe('AdsBrowser', () => {
  it('ordena por la métrica por defecto y permite cambiarla', () => {
    setup()
    expect(names()).toEqual(['Invierno', 'Otoño', 'Verano'])
    fireEvent.change(screen.getByLabelText(/Ordenar por/), { target: { value: 'spend' } })
    expect(names()).toEqual(['Otoño', 'Verano', 'Invierno'])
  })

  it('lowerIsBetter ordena asc y deja los nulos al final', () => {
    setup()
    fireEvent.change(screen.getByLabelText(/Ordenar por/), { target: { value: 'cpr' } })
    expect(names()).toEqual(['Otoño', 'Verano', 'Invierno'])
  })

  it('filtra por campaña, estado y búsqueda', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Campaña'), { target: { value: 'c1' } })
    expect(names()).toEqual(['Otoño', 'Verano'])
    fireEvent.change(screen.getByLabelText('Campaña'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'inactive' } })
    expect(names()).toEqual(['Invierno'])
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'all' } })
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: 'ver' } })
    expect(names()).toEqual(['Verano'])
    expect(screen.getByText(/1 de 3/)).toBeInTheDocument()
  })

  it('pagina de a 20 con "Ver más"', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: i, name: `Ad ${i}`, reach: i, spend: 0, cpr: null }))
    setup({ ads: many })
    expect(screen.getAllByTestId('ad')).toHaveLength(20)
    fireEvent.click(screen.getByText(/Ver más \(5 restantes\)/))
    expect(screen.getAllByTestId('ad')).toHaveLength(25)
  })

  it('vista tabla con columnas ordenables', () => {
    setup()
    fireEvent.click(screen.getByLabelText('Tabla'))
    const table = screen.getByRole('table')
    fireEvent.click(within(table).getByRole('button', { name: /Gasto/ }))
    const firstRow = within(table).getAllByRole('row')[1]
    expect(firstRow.textContent).toContain('Otoño')
  })
})
