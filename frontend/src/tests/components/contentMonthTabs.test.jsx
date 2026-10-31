import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ContentMonthTabs from '../../components/contenido/ContentMonthTabs'

vi.mock('../../api/client', () => ({
  default: { get: vi.fn() },
}))

import api from '../../api/client'

// El componente deriva las pestañas del mes actual, así que los casos se arman
// relativos a hoy en vez de con fechas fijas (que caducarían).
function monthStr(delta = 0) {
  const d = new Date()
  const m = new Date(d.getFullYear(), d.getMonth() + delta, 1)
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
}

function shortLabel(month) {
  const [y, m] = month.split('-').map(Number)
  const name = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')
  return y === new Date().getFullYear() ? name : `${name} ${y}`
}

const NOW  = monthStr(0)
const NEXT = monthStr(1)
const PAST = monthStr(-14) // un año y pico atrás: cae fuera del año en curso

describe('ContentMonthTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { months: [], counts: {}, unscheduled: 0 } })
  })

  it('siempre ofrece el mes actual y el siguiente, aunque no tengan piezas', async () => {
    render(<ContentMonthTabs projectId="7" month={NOW} onChange={() => {}} />)

    expect(await screen.findByRole('button', { name: new RegExp(shortLabel(NOW), 'i') })).toBeTruthy()
    expect(screen.getByRole('button', { name: new RegExp(shortLabel(NEXT), 'i') })).toBeTruthy()
  })

  it('muestra los meses con contenido y su conteo', async () => {
    api.get.mockResolvedValue({ data: { months: [PAST], counts: { [PAST]: 12 }, unscheduled: 0 } })

    render(<ContentMonthTabs projectId="7" month={NOW} onChange={() => {}} />)

    const tab = await screen.findByRole('button', { name: new RegExp(`${shortLabel(PAST)}\\s*12`, 'i') })
    expect(tab).toBeTruthy()
  })

  it('"Sin programar" aparece solo si hay piezas sin fecha', async () => {
    const { unmount } = render(<ContentMonthTabs projectId="7" month={NOW} onChange={() => {}} />)
    await screen.findByRole('button', { name: new RegExp(shortLabel(NOW), 'i') })
    expect(screen.queryByRole('button', { name: /Sin programar/ })).toBeNull()
    unmount()

    api.get.mockResolvedValue({ data: { months: [], counts: {}, unscheduled: 3 } })
    render(<ContentMonthTabs projectId="7" month={NOW} onChange={() => {}} />)
    expect(await screen.findByRole('button', { name: /Sin programar\s*3/ })).toBeTruthy()
  })

  it('"Sin programar" se muestra igual si es la pestaña activa, aunque ya no queden piezas sin fecha', async () => {
    render(<ContentMonthTabs projectId="7" month="none" onChange={() => {}} />)

    // Si no, al vaciar la pestaña desaparecería bajo los pies del usuario.
    expect(await screen.findByRole('button', { name: /Sin programar/ })).toBeTruthy()
  })

  it('incluye el mes activo aunque no esté entre los que tienen contenido (deep-link)', async () => {
    render(<ContentMonthTabs projectId="7" month={PAST} onChange={() => {}} />)

    expect(await screen.findByRole('button', { name: new RegExp(shortLabel(PAST), 'i') })).toBeTruthy()
  })

  it('elegir una pestaña avisa con el mes, y "Sin programar" con none', async () => {
    api.get.mockResolvedValue({ data: { months: [], counts: {}, unscheduled: 1 } })
    const onChange = vi.fn()
    render(<ContentMonthTabs projectId="7" month={NOW} onChange={onChange} />)

    fireEvent.click(await screen.findByRole('button', { name: new RegExp(shortLabel(NEXT), 'i') }))
    expect(onChange).toHaveBeenCalledWith(NEXT)

    fireEvent.click(screen.getByRole('button', { name: /Sin programar/ }))
    expect(onChange).toHaveBeenCalledWith('none')
  })

  it('no pide nada sin proyecto elegido', async () => {
    render(<ContentMonthTabs projectId="" month={NOW} onChange={() => {}} />)
    await waitFor(() => expect(api.get).not.toHaveBeenCalled())
  })
})
