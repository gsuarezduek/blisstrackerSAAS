import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const post = vi.fn()
vi.mock('../../api/client', () => ({ default: { post: (...a) => post(...a), get: vi.fn() } }))

import LoadMovementModal from '../../components/finanzas/LoadMovementModal'

const galicia = { id: 1, name: 'Galicia', currency: 'ARS', active: true, hasInvestments: true, taxes: [] }
const caja = { id: 2, name: 'Caja', currency: 'ARS', active: true, hasInvestments: false, taxes: [] }

function renderForm(accounts = [galicia, caja]) {
  const onSaved = vi.fn()
  const view = render(
    <LoadMovementModal accounts={accounts} categories={[]} items={[]} taxes={[]} defaultMode="transfer" onClose={vi.fn()} onSaved={onSaved} />
  )
  const reason = view.container.querySelector('select')
  const accountSelects = () => [...view.container.querySelectorAll('select')].slice(1)
  return { ...view, reason, accountSelects, onSaved }
}

describe('Cargar → Entre cuentas', () => {
  beforeEach(() => { post.mockReset(); post.mockResolvedValue({ data: {} }) })

  it('entre cuentas pide las dos y no ofrece tildes de fondos', () => {
    const { accountSelects, container } = renderForm()
    expect(accountSelects()).toHaveLength(2)
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
  })

  it('un rescate pide una sola cuenta y un solo monto, y lista solo cuentas con inversiones', async () => {
    const { reason, accountSelects, onSaved } = renderForm()
    fireEvent.change(reason, { target: { value: 'fund_redemption' } })

    expect(accountSelects()).toHaveLength(1)
    expect(screen.getAllByPlaceholderText('Monto')).toHaveLength(1)
    expect(screen.queryByRole('option', { name: /Caja/ })).toBeNull()
    expect(screen.getByText(/Baja los fondos de la cuenta y sube su disponible/)).toBeTruthy()

    fireEvent.change(accountSelects()[0], { target: { value: '1' } })
    fireEvent.change(screen.getByPlaceholderText('Monto'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith('/finanzas/transfers', expect.objectContaining({
      reason: 'fund_redemption', fromAccountId: 1, toAccountId: 1, fromAmount: 1000, toAmount: 1000,
    }))
  })

  it('al pasar a aporte descarta una cuenta sin inversiones', () => {
    const { reason, accountSelects } = renderForm()
    fireEvent.change(accountSelects()[0], { target: { value: '2' } })
    fireEvent.change(reason, { target: { value: 'fund_contribution' } })
    expect(accountSelects()[0].value).toBe('')
  })

  it('sin cuentas con inversiones explica dónde activarlo', () => {
    const { reason } = renderForm([caja])
    fireEvent.change(reason, { target: { value: 'fund_redemption' } })
    expect(screen.getByText(/Ninguna cuenta tiene inversiones/)).toBeTruthy()
  })

  it('entre cuentas con la misma cuenta avisa antes de guardar', () => {
    const { accountSelects } = renderForm()
    const [from, to] = accountSelects()
    fireEvent.change(from, { target: { value: '1' } })
    fireEvent.change(to, { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText(/usá Aporte o Rescate/)).toBeTruthy()
    expect(post).not.toHaveBeenCalled()
  })
})
