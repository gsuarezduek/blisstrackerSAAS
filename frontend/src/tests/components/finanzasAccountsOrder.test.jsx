import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const get = vi.fn()
const put = vi.fn()
vi.mock('../../api/client', () => ({ default: { get: (...a) => get(...a), put: (...a) => put(...a), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))

import FinanzasConfiguracion, { moveAccount } from '../../components/finanzas/FinanzasConfiguracion'

const acc = (id, name) => ({ id, name, type: 'bank', currency: 'ARS', active: true, taxes: [], _count: { movements: 0 } })
const A = acc(1, 'Galicia'); const B = acc(2, 'Mercado Pago'); const C = acc(3, 'Caja')

describe('moveAccount', () => {
  const ids = l => l.map(a => a.id)
  it('bajando queda debajo del destino', () => {
    expect(ids(moveAccount([A, B, C], 1, 3))).toEqual([2, 3, 1])
  })
  it('subiendo queda encima del destino', () => {
    expect(ids(moveAccount([A, B, C], 3, 1))).toEqual([3, 1, 2])
  })
  it('soltar sobre sí misma no cambia nada', () => {
    const list = [A, B, C]
    expect(moveAccount(list, 2, 2)).toBe(list)
  })
})

describe('Configuración: ordenar cuentas arrastrando', () => {
  beforeEach(() => {
    get.mockReset(); put.mockReset()
    get.mockImplementation(url => Promise.resolve({ data: url === '/finanzas/accounts' ? [A, B, C] : [] }))
  })

  const names = () => screen.getAllByTestId(/^account-row-/).map(r => r.querySelector('p').textContent)

  function drag(fromId, toId) {
    const dataTransfer = { effectAllowed: '' }
    fireEvent.dragStart(screen.getByTestId(`account-row-${fromId}`), { dataTransfer })
    fireEvent.dragOver(screen.getByTestId(`account-row-${toId}`), { dataTransfer })
    fireEvent.drop(screen.getByTestId(`account-row-${toId}`), { dataTransfer })
  }

  it('suelta la cuenta en su lugar nuevo y guarda el orden', async () => {
    put.mockResolvedValue({ data: [] })
    render(<FinanzasConfiguracion onBack={vi.fn()} />)
    await screen.findByText('Galicia')
    drag(3, 1)
    expect(names()).toEqual(['Caja', 'Galicia', 'Mercado Pago'])
    await waitFor(() => expect(put).toHaveBeenCalledWith('/finanzas/accounts/reorder', { orderedIds: [3, 1, 2] }))
  })

  it('si no se puede guardar, vuelve al orden anterior', async () => {
    put.mockRejectedValue({ response: { data: { error: 'Sin permiso' } } })
    const original = window.alert
    const alertSpy = vi.fn()
    window.alert = alertSpy
    render(<FinanzasConfiguracion onBack={vi.fn()} />)
    await screen.findByText('Galicia')
    drag(1, 3)
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Sin permiso'))
    expect(names()).toEqual(['Galicia', 'Mercado Pago', 'Caja'])
    window.alert = original
  })
})
