import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const get = vi.fn()
const post = vi.fn()
vi.mock('../../api/client', () => ({ default: { get: (...a) => get(...a), post: (...a) => post(...a), delete: vi.fn() } }))

import MovementsTab from '../../components/finanzas/MovementsTab'
import { movementDateParams } from '../../components/finanzas/MovementsFilterBar'
import { currentMonthKey, monthRange, shiftMonth, selectableMonths } from '../../components/finanzas/financeMonths'
import MovementsTable, { sortMovements } from '../../components/finanzas/MovementsTable'
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

describe('selectableMonths', () => {
  it('va del mes actual hacia atrás hasta el primer mes con datos', () => {
    expect(selectableMonths('2026-10', '2026-11')).toEqual(['2026-11', '2026-10'])
  })

  it('sin datos ofrece solo el mes actual', () => {
    expect(selectableMonths(null, '2026-11')).toEqual(['2026-11'])
  })

  it('como mucho 12 meses', () => {
    const months = selectableMonths('2020-01', '2026-11')
    expect(months).toHaveLength(12)
    expect(months[0]).toBe('2026-11')
    expect(months.at(-1)).toBe('2025-12')
  })

  it('cruza el cambio de año', () => {
    expect(selectableMonths('2026-12', '2027-02')).toEqual(['2027-02', '2027-01', '2026-12'])
  })

  it('un primer mes en el futuro deja solo el actual', () => {
    expect(selectableMonths('2027-03', '2026-11')).toEqual(['2026-11'])
  })
})

describe('Ingresos/Egresos: filtro de fecha', () => {
  const firstMonth = shiftMonth(currentMonthKey(), -2)
  beforeEach(() => {
    get.mockReset()
    get.mockImplementation(url => Promise.resolve({ data: url === '/finanzas/first-month' ? { month: firstMonth } : [] }))
  })
  const lastParams = () => get.mock.calls.filter(c => c[0] === '/finanzas/movements').at(-1)[1].params

  it('el selector arranca en el primer mes con movimientos', async () => {
    const select = renderTab()
    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(3 + 2))
    expect(get).toHaveBeenCalledWith('/finanzas/first-month', { params: { source: 'movements' } })
    const values = [...select.querySelectorAll('option')].map(o => o.value)
    expect(values).toEqual([currentMonthKey(), shiftMonth(currentMonthKey(), -1), firstMonth, 'all', 'custom'])
  })

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
    await waitFor(() => expect(select.querySelector(`option[value="${previous}"]`)).toBeTruthy())
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

describe('Ingresos/Egresos: tabla', () => {
  const ars = { id: 1, name: 'Galicia', currency: 'ARS' }
  const usd = { id: 2, name: 'Wise', currency: 'USD' }
  const mv = (id, date, amount, item, account, category = 'Fees') => ({
    id, date: `${date}T12:00:00Z`, amount, item: item ? { name: item } : null, category: { name: category }, account,
  })
  const movements = [
    mv(1, '2026-11-03', '50000', 'Pastiza', ars),
    mv(2, '2026-11-10', '500', 'Árbol', usd),
    mv(3, '2026-11-05', '120000', 'zeta', ars, 'Servicios'),
    mv(4, '2026-11-01', '20', null, usd),
  ]
  const ids = list => list.map(m => m.id)

  it('por monto agrupa por moneda (ARS primero) y ordena dentro de cada una', () => {
    expect(ids(sortMovements(movements, { key: 'amount', dir: 'desc' }))).toEqual([3, 1, 2, 4])
    expect(ids(sortMovements(movements, { key: 'amount', dir: 'asc' }))).toEqual([1, 3, 4, 2])
  })

  it('por texto ignora tildes y mayúsculas, y deja los vacíos al final', () => {
    expect(ids(sortMovements(movements, { key: 'item', dir: 'asc' }))).toEqual([2, 1, 3, 4])
    expect(ids(sortMovements(movements, { key: 'item', dir: 'desc' }))).toEqual([3, 1, 2, 4])
  })

  it('por fecha', () => {
    expect(ids(sortMovements(movements, { key: 'date', dir: 'desc' }))).toEqual([2, 3, 1, 4])
    expect(ids(sortMovements(movements, { key: 'date', dir: 'asc' }))).toEqual([4, 1, 3, 2])
  })

  it('sin orden elegido respeta el del servidor', () => {
    expect(sortMovements(movements, null)).toBe(movements)
  })

  function itemColumn() {
    return screen.getAllByRole('row').slice(1).map(r => r.querySelectorAll('td')[1].textContent)
  }

  it('tocar Monto ordena de mayor a menor y otra vez de menor a mayor', () => {
    render(<MovementsTable movements={movements} onEdit={vi.fn()} />)
    const header = screen.getByRole('button', { name: 'Monto' })
    fireEvent.click(header)
    expect(itemColumn()).toEqual(['zeta', 'Pastiza', 'Árbol', '—'])
    expect(header.closest('th').getAttribute('aria-sort')).toBe('descending')
    fireEvent.click(header)
    expect(itemColumn()).toEqual(['Pastiza', 'zeta', '—', 'Árbol'])
    expect(header.closest('th').getAttribute('aria-sort')).toBe('ascending')
  })

  it('el click en la fila abre el movimiento; el lápiz lo abre una sola vez', () => {
    const onEdit = vi.fn()
    render(<MovementsTable movements={movements} onEdit={onEdit} />)
    fireEvent.click(screen.getByText('Pastiza'))
    expect(onEdit).toHaveBeenCalledWith(movements[0])
    onEdit.mockClear()
    fireEvent.click(screen.getAllByTitle('Editar')[0])
    expect(onEdit).toHaveBeenCalledTimes(1)
  })
})
