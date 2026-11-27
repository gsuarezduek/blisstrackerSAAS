import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const get = vi.fn()
vi.mock('../../api/client', () => ({ default: { get: (...a) => get(...a), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

import InvoicedCollectedChart from '../../components/finanzas/charts/InvoicedCollectedChart'
import AgingBar from '../../components/finanzas/charts/AgingBar'
import { niceScale, fmtCompactMoney } from '../../components/finanzas/charts/chartKit'
import CustomersTab from '../../components/finanzas/CustomersTab'
import BalancesTab from '../../components/finanzas/BalancesTab'
import SummaryTab from '../../components/finanzas/SummaryTab'

describe('chartKit', () => {
  it('niceScale da límites redondos e incluye el 0', () => {
    expect(niceScale(0, 16.8e6)).toEqual({ min: 0, max: 20e6, ticks: [0, 5e6, 10e6, 15e6, 20e6] })
    expect(niceScale(-300, 900).ticks).toContain(0)
  })
  it('monto compacto con el símbolo de cada moneda', () => {
    expect(fmtCompactMoney(0, 'USD')).toBe('US$ 0')
    expect(fmtCompactMoney(0.5, 'BTC')).toBe('₿ 0,5')
  })
})

describe('Facturado vs. cobrado', () => {
  const series = [
    { month: '2026-10', invoiced: '1000', collected: '400', diff: '600' },
    { month: '2026-11', invoiced: '500', collected: '900', diff: '-400' },
  ]

  it('el foco en un mes muestra los dos valores y la diferencia', () => {
    render(<InvoicedCollectedChart series={series} currency="ARS" />)
    fireEvent.focus(screen.getByLabelText(/^Oct 26: facturado/))
    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('$ 1.000,00')).toBeTruthy()
    expect(within(tip).getByText('$ 400,00')).toBeTruthy()
    expect(within(tip).getByText(/Quedó por cobrar/)).toBeTruthy()
  })

  it('la tabla tiene todos los valores sin depender del hover', () => {
    render(<InvoicedCollectedChart series={series} currency="ARS" />)
    const rows = screen.getAllByRole('row').slice(1).map(r => [...r.querySelectorAll('td')].map(td => td.textContent))
    expect(rows).toEqual([
      ['Oct 26', '$ 1.000,00', '$ 400,00', '$ 600,00'],
      ['Nov 26', '$ 500,00', '$ 900,00', '$ -400,00'],
    ])
  })

  it('sin datos lo dice en vez de dibujar ceros', () => {
    render(<InvoicedCollectedChart series={[{ month: '2026-11', invoiced: '0', collected: '0', diff: '0' }]} currency="ARS" />)
    expect(screen.getByText(/Sin facturas ni cobros/)).toBeTruthy()
  })
})

const agingData = {
  currency: 'ARS', total: '300',
  buckets: [
    { key: 'current', label: 'Al día', amount: '100', customers: [{ id: 1, name: 'Pastiza', amount: '100' }] },
    { key: 'd1_30', label: '1–30 días', amount: '0', customers: [] },
    { key: 'd31_60', label: '31–60 días', amount: '200', customers: [{ id: 2, name: 'Hosting', amount: '200' }] },
    { key: 'd61_90', label: '61–90 días', amount: '0', customers: [] },
    { key: 'd90_plus', label: 'Más de 90 días', amount: '0', customers: [] },
  ],
}

describe('Antigüedad de saldos', () => {
  it('un tramo se elige y otro click lo saca; los vacíos no se pueden elegir', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<AgingBar data={agingData} selected={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /31–60 días \$ 200,00/ }))
    expect(onSelect).toHaveBeenCalledWith('d31_60')
    rerender(<AgingBar data={agingData} selected="d31_60" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /31–60 días \$ 200,00/ }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
    expect(screen.getByRole('button', { name: /1–30 días/ }).disabled).toBe(true)
  })

  it('en Clientes, elegir un tramo filtra la lista', async () => {
    get.mockReset()
    get.mockImplementation(url => Promise.resolve({ data: url === '/finanzas/customers/aging'
      ? { asOf: '2026-11-27', currencies: [agingData] }
      : [
        { id: 1, name: 'Pastiza', facturado: '100', cobrado: '0', saldo: '100', status: 'pending', lastInvoice: null },
        { id: 2, name: 'Hosting', facturado: '200', cobrado: '0', saldo: '200', status: 'overdue', lastInvoice: null },
      ] }))
    render(<CustomersTab accounts={[]} categories={[]} items={[]} taxes={[]} issuers={[]} refreshKey={0} />)
    await screen.findByText('Antigüedad de lo que te deben')
    await screen.findByText('Pastiza')
    fireEvent.click(screen.getByRole('button', { name: /31–60 días \$ 200,00/ }))
    expect(screen.queryByText('Pastiza')).toBeNull()
    expect(screen.getByText('Hosting')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro de antigüedad' }))
    expect(screen.getByText('Pastiza')).toBeTruthy()
  })
})

describe('Saldos: evolución del disponible', () => {
  beforeEach(() => {
    try { localStorage.removeItem('bliss_finanzas_balance_history_open') } catch { /* */ }
    get.mockReset()
    get.mockImplementation(url => Promise.resolve({ data: {
      '/finanzas/balances': { accounts: [], totalsByCurrency: {} },
      '/finanzas/balances/history': { months: ['2026-10', '2026-11'], currencies: [{ currency: 'ARS', points: [{ month: '2026-10', balance: '100' }, { month: '2026-11', balance: '250' }] }] },
    }[url] ?? [] }))
  })

  it('arranca plegada y recién al abrirla pide los datos', async () => {
    render(<BalancesTab accounts={[]} taxes={[]} />)
    const toggle = await screen.findByRole('button', { name: /Evolución del disponible/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(get).not.toHaveBeenCalledWith('/finanzas/balances/history', expect.anything())
    fireEvent.click(toggle)
    await waitFor(() => expect(get).toHaveBeenCalledWith('/finanzas/balances/history', { params: { months: 12 } }))
    expect(await screen.findByText('Disponible en pesos')).toBeTruthy()
  })
})

describe('Resumen: facturado vs. cobrado por entidad', () => {
  it('elegir una entidad la pide; "Sin entidad" va como none', async () => {
    get.mockReset()
    get.mockImplementation(url => Promise.resolve({ data: {
      '/finanzas/summary/breakdown': { income: { total: '0', rows: [] }, expense: { total: '0', rows: [] } },
      '/finanzas/summary/chart': { series: [] },
      '/finanzas/summary/entities': { entities: [
        { issuerId: 3, name: 'Bliss SRL', cuit: null, active: true, invoiced: '0', invoiceCount: 0, income: '0', expense: '0', net: '0', pendingChecks: { amount: '0', count: 0 }, accounts: [], crossCount: 0 },
        { issuerId: null, name: 'Sin entidad', cuit: null, active: true, invoiced: '0', invoiceCount: 0, income: '0', expense: '0', net: '0', pendingChecks: { amount: '0', count: 0 }, accounts: [], crossCount: 0 },
      ], crossCollections: [] },
      '/finanzas/summary/invoicing': { series: [{ month: '2026-11', invoiced: '10', collected: '5', diff: '5' }], totals: { invoiced: '10', collected: '5', diff: '5' } },
    }[url] }))
    render(<SummaryTab accounts={[{ id: 1, currency: 'ARS' }]} />)
    const select = await screen.findByLabelText('Entidad de facturación')
    await screen.findByRole('option', { name: 'Bliss SRL' })
    const invoicingCalls = () => get.mock.calls.filter(c => c[0] === '/finanzas/summary/invoicing')
    expect(invoicingCalls()[0][1].params).toMatchObject({ months: 12, issuerId: '' })
    fireEvent.change(select, { target: { value: 'none' } })
    await waitFor(() => expect(invoicingCalls().at(-1)[1].params.issuerId).toBe('none'))
    fireEvent.change(select, { target: { value: '3' } })
    await waitFor(() => expect(invoicingCalls().at(-1)[1].params.issuerId).toBe('3'))
  })
})
