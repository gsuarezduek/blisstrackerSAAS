import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const get = vi.fn()
vi.mock('../../api/client', () => ({ default: { get: (...a) => get(...a), post: vi.fn(), delete: vi.fn() } }))

import InvoicesTab from '../../components/finanzas/InvoicesTab'
import { invoiceTotals } from '../../components/finanzas/financeCatalog'
import { currentMonthKey, monthRange } from '../../components/finanzas/financeMonths'

function inv(overrides = {}) {
  return {
    id: 1, number: 'FC A 0001-00000001', issueDate: '2026-10-05T12:00:00.000Z', concept: 'Fee',
    amount: '1000.10', currency: 'ARS', kind: 'invoice', status: 'pending', arcaStatus: null,
    issuerId: null, issuer: null, item: { id: 10, name: 'Pastiza' }, attachments: [],
    ...overrides,
  }
}

describe('invoiceTotals', () => {
  it('la nota de crédito resta, la de débito suma, y la rechazada no pesa', () => {
    const { currencies, rejected } = invoiceTotals([
      inv({ id: 1, amount: '1000.10' }),
      inv({ id: 2, amount: '200.20' }),
      inv({ id: 3, kind: 'credit_note', amount: '100.10' }),
      inv({ id: 4, kind: 'debit_note', amount: '50.05' }),
      inv({ id: 5, amount: '999999', arcaStatus: 'rejected' }),
    ])
    expect(rejected).toBe(1)
    expect(currencies).toEqual([{
      currency: 'ARS', count: 4, invoiced: 1200.3, credit: 100.1, debit: 50.05, net: 1150.25,
    }])
  })

  it('no mezcla monedas', () => {
    const { currencies } = invoiceTotals([inv({ amount: '100' }), inv({ id: 2, amount: '30', currency: 'USD' })])
    expect(currencies.map(c => [c.currency, c.net])).toEqual([['ARS', 100], ['USD', 30]])
  })

  it('suma en centavos: cientos de montos con decimales no acumulan error', () => {
    const many = Array.from({ length: 300 }, (_, i) => inv({ id: i, amount: '0.10' }))
    expect(invoiceTotals(many).currencies[0].net).toBe(30)
  })
})

describe('Pestaña Facturas', () => {
  const issuers = [
    { id: 3, name: 'Bliss SRL', active: true },
    { id: 4, name: 'Monotributo viejo', active: false },
  ]
  const items = [
    { id: 10, name: 'Pastiza', tracksAccount: true, active: true },
    { id: 20, name: 'Hosting', tracksAccount: false, active: true },
  ]

  beforeEach(() => {
    get.mockReset()
    get.mockImplementation(url => Promise.resolve({ data: url === '/finanzas/issuers' ? issuers : [inv()] }))
  })

  const invoiceCalls = () => get.mock.calls.filter(c => c[0] === '/finanzas/invoices')
  const lastParams = () => invoiceCalls().at(-1)[1].params

  it('arranca en el mes en curso, sin cliente', async () => {
    render(<InvoicesTab items={items} financeIvaMode="add" refreshKey={0} />)
    await waitFor(() => expect(invoiceCalls().length).toBeGreaterThan(0))
    expect(lastParams()).toEqual(monthRange(currentMonthKey()))
    expect(await screen.findByText('Pastiza', { selector: 'td' })).toBeInTheDocument()
  })

  it('filtra por emisor, también los desactivados y las informativas', async () => {
    render(<InvoicesTab items={items} financeIvaMode="add" refreshKey={0} />)
    const select = await screen.findByLabelText('Emisor')
    await screen.findByRole('option', { name: 'Monotributo viejo' })

    fireEvent.change(select, { target: { value: '4' } })
    await waitFor(() => expect(lastParams().issuerId).toBe('4'))

    fireEvent.change(select, { target: { value: 'none' } })
    await waitFor(() => expect(lastParams().issuerId).toBe('none'))
  })

  it('el selector de cliente solo ofrece clientes con cuenta corriente', async () => {
    render(<InvoicesTab items={items} financeIvaMode="add" refreshKey={0} />)
    const select = await screen.findByLabelText('Cliente')
    const names = [...select.querySelectorAll('option')].map(o => o.textContent)
    expect(names).toEqual(['Todos', 'Pastiza'])
  })

  it('período personalizado manda desde/hasta', async () => {
    render(<InvoicesTab items={items} financeIvaMode="add" refreshKey={0} />)
    fireEvent.change(await screen.findByLabelText('Emisión'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-03-31' } })
    await waitFor(() => expect(lastParams()).toEqual(expect.objectContaining({ from: '2026-01-01', to: '2026-03-31' })))
  })
})
