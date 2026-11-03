import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const get = vi.fn()
const post = vi.fn()
vi.mock('../../api/client', () => ({ default: { get: (...a) => get(...a), post: (...a) => post(...a), delete: vi.fn() } }))

import MovementsTab from '../../components/finanzas/MovementsTab'
import { movementDateParams } from '../../components/finanzas/MovementsFilterBar'
import { currentMonthKey, monthRange, shiftMonth } from '../../components/finanzas/financeMonths'
import ItemPicker from '../../components/finanzas/ItemPicker'
import LoadMovementModal from '../../components/finanzas/LoadMovementModal'
import AccountDetailPanel from '../../components/finanzas/AccountDetailPanel'

const incomeCategory = { id: 1, name: 'Fees', type: 'income', active: true }
const expenseCategory = { id: 2, name: 'Servicios', type: 'expense', active: true }
const clientItem = { id: 10, name: 'Pastiza', active: true, categoryId: 1, category: incomeCategory }
const supplierItem = { id: 20, name: 'Hosting', active: true, categoryId: 2, category: expenseCategory }
const items = [clientItem, supplierItem]
const categories = [incomeCategory, expenseCategory]

describe('monthRange', () => {
  it('llega al último día del mes, también en febrero bisiesto', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
})

describe('movementDateParams', () => {
  it('traduce cada período a fechas', () => {
    expect(movementDateParams({ period: '2026-10', from: '', to: '' })).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(movementDateParams({ period: 'all', from: '2026-01-01', to: '' })).toEqual({})
    expect(movementDateParams({ period: 'custom', from: '2026-01-05', to: '' })).toEqual({ from: '2026-01-05' })
  })
})

describe('Ingresos/Egresos: filtro de fecha', () => {
  beforeEach(() => { get.mockReset(); get.mockResolvedValue({ data: [] }) })
  const lastParams = () => get.mock.calls.at(-1)[1].params

  function renderTab() {
    render(<MovementsTab type="income" accounts={[]} categories={[]} items={[]} taxes={[]} refreshKey={0} />)
    return screen.getByLabelText('Fecha')
  }

  it('arranca en el mes actual, sin Desde/Hasta a la vista', async () => {
    renderTab()
    await waitFor(() => expect(lastParams()).toMatchObject({ type: 'income', ...monthRange(currentMonthKey()) }))
    expect(screen.queryByLabelText('Desde')).toBeNull()
  })

  it('elegir otro mes pide ese mes', async () => {
    const select = renderTab()
    const previous = shiftMonth(currentMonthKey(), -1)
    fireEvent.change(select, { target: { value: previous } })
    await waitFor(() => expect(lastParams()).toMatchObject(monthRange(previous)))
  })

  it('"Todas las fechas" no manda rango', async () => {
    const select = renderTab()
    fireEvent.change(select, { target: { value: 'all' } })
    await waitFor(() => {
      expect(lastParams().from).toBeUndefined()
      expect(lastParams().to).toBeUndefined()
    })
  })

  it('"Fecha personalizada" muestra Desde/Hasta con el período que se veía y los respeta', async () => {
    const select = renderTab()
    fireEvent.change(select, { target: { value: 'custom' } })
    const from = screen.getByLabelText('Desde')
    expect(from.value).toBe(monthRange(currentMonthKey()).from)
    fireEvent.change(from, { target: { value: '2026-01-15' } })
    await waitFor(() => expect(lastParams().from).toBe('2026-01-15'))
  })

  it('"Limpiar" vuelve al mes actual', async () => {
    const select = renderTab()
    fireEvent.change(select, { target: { value: 'all' } })
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(screen.getByLabelText('Fecha').value).toBe(currentMonthKey())
  })
})

describe('ItemPicker: items por tipo', () => {
  function open(props) {
    const view = render(<ItemPicker items={items} categories={categories} onChange={vi.fn()} {...props} />)
    fireEvent.focus(screen.getByPlaceholderText('Buscar item…'))
    return view
  }

  it('en Ingreso muestra solo items de ingreso', () => {
    open({ type: 'income' })
    expect(screen.getByText('Pastiza')).toBeTruthy()
    expect(screen.queryByText('Hosting')).toBeNull()
  })

  it('en Egreso muestra solo items de egreso', () => {
    open({ type: 'expense' })
    expect(screen.getByText('Hosting')).toBeTruthy()
    expect(screen.queryByText('Pastiza')).toBeNull()
  })

  it('respeta el item ya elegido aunque sea de otro tipo', () => {
    open({ type: 'expense', value: clientItem.id })
    expect(screen.getByPlaceholderText('Buscar item…').value).toBe('Pastiza')
    expect(screen.getByRole('button', { name: /^Pastiza/ })).toBeTruthy()
  })

  it('al crear un item ofrece solo categorías del tipo', () => {
    open({ type: 'expense' })
    fireEvent.click(screen.getByRole('button', { name: /Crear item nuevo/ }))
    expect(screen.getByRole('option', { name: 'Servicios' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Fees' })).toBeNull()
  })
})

describe('Cargar: cambiar de Ingreso a Egreso', () => {
  it('saca el item elegido y conserva el monto', () => {
    get.mockResolvedValue({ data: [] })
    render(<LoadMovementModal accounts={[]} categories={categories} items={items} taxes={[]} onClose={vi.fn()} onSaved={vi.fn()} />)
    const picker = screen.getByPlaceholderText('Buscar item…')
    fireEvent.focus(picker)
    fireEvent.click(screen.getByRole('button', { name: /^Pastiza/ }))
    expect(picker.value).toBe('Pastiza')
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1500' } })

    fireEvent.click(screen.getByRole('button', { name: 'Egreso' }))
    expect(screen.getByPlaceholderText('Buscar item…').value).toBe('')
    expect(screen.getByPlaceholderText('0').value).toBe('1500')
  })
})

describe('Saldos: detalle de la cuenta', () => {
  const account = { id: 1, name: 'Galicia', currency: 'ARS', active: true, hasInvestments: true, disponible: '100', fondos: '50', taxes: [] }

  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    post.mockResolvedValue({ data: {} })
    get.mockImplementation((url) => {
      const data = {
        '/finanzas/movements': [
          { id: 1, type: 'income', date: '2026-11-01T12:00:00Z', amount: '500', item: { name: 'Pastiza' }, category: { name: 'Fees' } },
          { id: 2, type: 'expense', date: '2026-11-02T12:00:00Z', amount: '200', item: { name: 'Comisión' }, category: { name: 'Servicios' } },
        ],
        '/finanzas/transfers': [
          { id: 3, date: '2026-11-03T12:00:00Z', reason: 'fund_redemption', fromAccountId: 1, toAccountId: 1, fromIsFund: true, fromAmount: '50', toAmount: '50' },
        ],
        '/finanzas/adjustments': [{ id: 4, date: '2026-11-04T12:00:00Z', amount: '10', note: 'Diferencia de caja' }],
      }[url]
      return Promise.resolve({ data: data || [] })
    })
  })

  function renderPanel(over = {}) {
    const onChanged = vi.fn()
    render(<AccountDetailPanel account={{ ...account, ...over }} accounts={[account]} taxes={[]} onClose={vi.fn()} onChanged={onChanged} />)
    return { onChanged }
  }

  it('filtra por tipo de operación', async () => {
    renderPanel()
    await screen.findByText('Pastiza')
    fireEvent.change(screen.getByLabelText('Tipo de operación'), { target: { value: 'adjustment' } })
    expect(screen.getByText('Diferencia de caja')).toBeTruthy()
    expect(screen.queryByText('Pastiza')).toBeNull()
    expect(screen.queryByText('Comisión')).toBeNull()
  })

  it('busca por nombre sin importar tildes ni mayúsculas', async () => {
    renderPanel()
    await screen.findByText('Pastiza')
    fireEvent.change(screen.getByLabelText('Buscar por nombre'), { target: { value: 'COMISION' } })
    expect(screen.getByText('Comisión')).toBeTruthy()
    expect(screen.queryByText('Pastiza')).toBeNull()
  })

  it('avisa si nada coincide', async () => {
    renderPanel()
    await screen.findByText('Pastiza')
    fireEvent.change(screen.getByLabelText('Buscar por nombre'), { target: { value: 'zzz' } })
    expect(screen.getByText(/Ninguna operación coincide/)).toBeTruthy()
  })

  it('"Rescate" abre el form con la cuenta elegida y guarda dentro de ella', async () => {
    const { onChanged } = renderPanel()
    await screen.findByText('Pastiza')
    fireEvent.click(screen.getByRole('button', { name: 'Rescate' }))
    expect(screen.getByText('Mover fondos · Galicia')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Monto'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith('/finanzas/transfers', expect.objectContaining({
      reason: 'fund_redemption', fromAccountId: 1, toAccountId: 1, fromAmount: 30, toAmount: 30,
    }))
  })

  it('sin inversiones no ofrece aporte ni rescate', async () => {
    renderPanel({ hasInvestments: false })
    await screen.findByText('Pastiza')
    expect(screen.queryByRole('button', { name: 'Rescate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Aporte' })).toBeNull()
  })
})
