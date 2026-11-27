import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const get = vi.fn()
const post = vi.fn()
const patch = vi.fn()
const put = vi.fn()
vi.mock('../../api/client', () => ({ default: {
  get: (...a) => get(...a), post: (...a) => post(...a), patch: (...a) => patch(...a), put: (...a) => put(...a), delete: vi.fn(),
} }))

import AccountModal from '../../components/finanzas/AccountModal'
import BalancesTab from '../../components/finanzas/BalancesTab'

describe('Cuenta: tipo y "En Saldos cuenta como"', () => {
  beforeEach(() => {
    post.mockReset(); patch.mockReset(); put.mockReset()
    post.mockResolvedValue({ data: { id: 7 } }); put.mockResolvedValue({ data: {} }); patch.mockResolvedValue({ data: {} })
  })

  it('ya no pide el saldo inicial', () => {
    render(<AccountModal account={null} allTaxes={[]} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.queryByText(/Saldo al empezar/)).toBeNull()
  })

  it('elegir "Cuenta de inversión" sugiere Inversión y fondos, y lo manda', async () => {
    const onSaved = vi.fn()
    render(<AccountModal account={null} allTaxes={[]} onClose={vi.fn()} onSaved={onSaved} />)
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Broker' } })
    fireEvent.change(screen.getByDisplayValue('Banco'), { target: { value: 'investment' } })
    expect(screen.getByRole('radio', { name: 'Inversión' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const body = post.mock.calls[0][1]
    expect(body).toMatchObject({ name: 'Broker', type: 'investment', balanceGroup: 'investment', hasInvestments: true })
    expect(body).not.toHaveProperty('initialBalance')
  })

  it('cualquier cuenta puede pasar a Inversión, sin tocar el tipo', async () => {
    const account = { id: 3, name: 'Galicia', type: 'bank', currency: 'USD', hasInvestments: false, balanceGroup: 'available', taxes: [] }
    render(<AccountModal account={account} allTaxes={[]} onClose={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Inversión' }))
    expect(screen.getByText(/Inversión en USD/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(patch).toHaveBeenCalled())
    expect(patch.mock.calls[0][1]).toMatchObject({ type: 'bank', balanceGroup: 'investment' })
  })
})

describe('Saldos: Inversión aparte', () => {
  const acc = (over) => ({
    currency: 'USD', type: 'bank', hasInvestments: false, balanceGroup: 'available',
    incomePeriod: '0', expensePeriod: '0', internalPeriod: '0', adjustmentsPeriod: '0', disponible: '0', fondos: null,
    pendingChecks: { amount: '0', count: 0 }, ...over,
  })
  const totals = (over) => ({ disponible: '0', fondos: '0', total: '0', inversion: '0', investmentAccounts: 0, pendingChecks: { amount: '0', count: 0 }, ...over })

  beforeEach(() => {
    get.mockReset()
    get.mockImplementation(url => Promise.resolve({ data: url === '/finanzas/balances' ? {
      accounts: [
        acc({ id: 1, name: 'Wise', disponible: '1300' }),
        acc({ id: 3, name: 'Broker', type: 'investment', balanceGroup: 'investment', hasInvestments: true, disponible: '5000', fondos: '2000' }),
      ],
      totalsByCurrency: { USD: totals({ disponible: '1300', total: '1300', inversion: '7000', investmentAccounts: 1 }) },
    } : [] }))
  })

  it('muestra "Inversión en USD" aparte y separa las cuentas en dos bloques', async () => {
    render(<BalancesTab accounts={[]} taxes={[]} />)
    expect(await screen.findByText('Inversión en USD')).toBeTruthy()
    expect(screen.getByText('Dólares')).toBeTruthy()
    expect(screen.getByText('Cuentas operativas')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Inversión' })).toBeTruthy()
    expect(screen.getByText('Efectivo')).toBeTruthy()
  })
})
