import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const get = vi.fn()
vi.mock('../../api/client', () => ({ default: { get: (...a) => get(...a), post: vi.fn(), delete: vi.fn() } }))

import InvoicesTab from '../../components/finanzas/InvoicesTab'
import { invoiceTotals } from '../../components/finanzas/financeCatalog'
import { currentMonthKey, monthRange, shiftMonth } from '../../components/finanzas/financeMonths'

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

  it('el selector de emisión arranca en el mes de la primera factura', async () => {
    const first = shiftMonth(currentMonthKey(), -1)
    get.mockImplementation(url => Promise.resolve({
      data: url === '/finanzas/first-month' ? { month: first } : url === '/finanzas/issuers' ? issuers : [inv()],
    }))
    render(<InvoicesTab items={items} financeIvaMode="add" refreshKey={0} />)
    const select = screen.getByLabelText('Emisión')
    await waitFor(() => expect(select.querySelector(`option[value="${first}"]`)).toBeTruthy())
    expect(get).toHaveBeenCalledWith('/finanzas/first-month', { params: { source: 'invoices' } })
    expect([...select.querySelectorAll('option')].map(o => o.value)).toEqual([currentMonthKey(), first, 'all', 'custom'])
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

describe('Exportar Libro IVA Digital', () => {
  const issuers = [
    { id: 3, name: 'Bliss SRL', active: true, taxCondition: 'responsable_inscripto', cuit: '30-71234567-8' },
    { id: 5, name: 'Fulano Monotributo', active: true, taxCondition: 'monotributo', cuit: '20-11111111-1' },
  ]
  const summary = {
    issuer: { id: 3, name: 'Bliss SRL', cuit: '30-71234567-8', environment: 'production' },
    month: '2026-10',
    counts: { total: 3, invoice: 2, creditNote: 1, debitNote: 0, alicuotaLines: 3 },
    amounts: { total: '1089.00', netTaxed: '900.00', vat: '189.00' },
    warnings: [{ code: 'pending', message: '1 comprobante sin resultado definitivo de ARCA quedó afuera.', invoices: [{ id: 9, number: null, client: 'LCE' }] }],
  }

  beforeEach(() => {
    get.mockReset()
    get.mockImplementation(url => Promise.resolve({
      data: url === '/finanzas/issuers' ? issuers : url === '/finanzas/invoices/libro-iva' ? summary : [],
    }))
  })

  it('solo ofrece emisores responsables inscriptos, arranca en el mes anterior y muestra lo que queda afuera', async () => {
    const LibroIvaModal = (await import('../../components/finanzas/LibroIvaModal')).default
    render(<LibroIvaModal issuers={issuers} onClose={() => {}} />)
    const select = screen.getByLabelText('Emisor')
    expect([...select.querySelectorAll('option')].map(o => o.textContent)).toEqual(['Elegí un emisor', 'Bliss SRL'])
    // Un solo emisor elegible: queda elegido solo y pide el resumen del mes anterior.
    await waitFor(() => expect(get).toHaveBeenCalledWith('/finanzas/invoices/libro-iva', { params: { issuerId: '3', month: shiftMonth(currentMonthKey(), -1) } }))
    expect(await screen.findByText(/sin resultado definitivo/)).toBeInTheDocument()
    expect(screen.getByText(/3 comprobantes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Descargar/ })).not.toBeDisabled()
  })

  it('sin emisores inscriptos explica por qué no hay libro', async () => {
    const LibroIvaModal = (await import('../../components/finanzas/LibroIvaModal')).default
    render(<LibroIvaModal issuers={[issuers[1]]} onClose={() => {}} />)
    expect(screen.getByText(/no lleva libro/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Descargar/ })).toBeDisabled()
  })
})
