/**
 * "Hoy en tu calendario" (Dashboard): en qué fase del reloj está cada reunión.
 * Es lo que decide si la fila grita ("Ahora"), avisa ("en X min") o se apaga
 * (ya pasó) — los bordes son exactos: arranca EN el minuto de inicio y se apaga
 * EN el minuto en que termina.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import TodayEventsCard, { toMins, phaseOf } from '../../components/dashboard/TodayEventsCard'

vi.mock('../../api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('../../components/calendar/useCalendarSocket', () => ({ useCalendarSocket: () => {} }))

const state = vi.hoisted(() => ({ user: null, flag: true }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('../../hooks/useFeatureFlag', () => ({ useFeatureFlag: () => ({ enabled: state.flag, loading: false }) }))

import api from '../../api/client'

describe('toMins', () => {
  test('cuenta los minutos desde medianoche', () => {
    expect(toMins('00:00')).toBe(0)
    expect(toMins('09:30')).toBe(570)
    expect(toMins('23:59')).toBe(1439)
  })

  test('un valor ausente no explota', () => {
    expect(toMins(undefined)).toBe(0)
    expect(toMins('')).toBe(0)
  })
})

describe('phaseOf', () => {
  const ev = { startTime: '10:00', durationMins: 60 }

  test('en curso desde el minuto de inicio hasta el anterior al fin', () => {
    expect(phaseOf(ev, toMins('10:00'))).toBe('now')
    expect(phaseOf(ev, toMins('10:59'))).toBe('now')
  })

  test('pasada en el minuto en que termina', () => {
    expect(phaseOf(ev, toMins('11:00'))).toBe('past')
    expect(phaseOf(ev, toMins('18:00'))).toBe('past')
  })

  test('la hora previa avisa; antes de eso, no', () => {
    expect(phaseOf(ev, toMins('09:00'))).toBe('soon')
    expect(phaseOf(ev, toMins('09:59'))).toBe('soon')
    expect(phaseOf(ev, toMins('08:59'))).toBe('later')
  })

  test('sin duración declarada no queda pegada en "Ahora"', () => {
    expect(phaseOf({ startTime: '10:00' }, toMins('10:00'))).toBe('past')
  })
})


// ─── Render ───────────────────────────────────────────────────────────────────

const ME = 1

function event(over = {}) {
  return {
    id: 10, title: 'Kickoff con el cliente', date: '2026-11-05', startTime: '10:00', durationMins: 60,
    projectId: 3, project: { id: 3, name: 'Pastiza' }, meetLink: null, recurrenceId: null, realMeetingId: null,
    participants: [{ userId: ME, status: 'accepted' }],
    ...over,
  }
}

function Where() {
  const loc = useLocation()
  return <span data-testid="where">{loc.pathname}{loc.search}</span>
}

function renderCard({ where = false } = {}) {
  return render(<MemoryRouter><TodayEventsCard />{where && <Where />}</MemoryRouter>)
}

// La tarjeta junta dos fuentes: las reuniones de BlissTracker y lo traído de los
// calendarios de afuera (ver ExternalCalendar).
function mockApi({ meetings = [], external = [], sales = [], finance = [], content = [] } = {}) {
  api.get.mockImplementation(url => Promise.resolve({
    data: url === '/calendar/external-events' ? external
      : url === '/calendar/sales-actions' ? sales
      : url === '/calendar/finance-tasks' ? finance
      : url === '/calendar/content-pieces' ? content
      : meetings,
  }))
}

function externalEvent(over = {}) {
  return {
    id: 99, kind: 'external', title: 'Clase de inglés', calendarName: 'Mi Google',
    date: '2026-11-05', endDate: '2026-11-05', startTime: '08:00', durationMins: 60,
    allDay: false, busy: true, color: '#4285F4', ...over,
  }
}

describe('TodayEventsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { id: ME, moduleAccess: { calendario: true } }
    state.flag = true
    mockApi()
  })

  test('sin reuniones hoy no ocupa lugar en el Dashboard', async () => {
    const { container } = renderCard()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  test('lista lo agendado con hora, duración y proyecto, y lleva al Calendario', async () => {
    mockApi({ meetings: [event()] })
    renderCard()
    expect(await screen.findByText('Kickoff con el cliente')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText(/1h 0m · Pastiza/)).toBeInTheDocument()
    expect(screen.getByText('Ver calendario →')).toHaveAttribute('href', '/calendario')
    // El rango pedido es un solo día: hoy, a las dos fuentes.
    for (const path of ['/calendar/events', '/calendar/external-events', '/calendar/sales-actions', '/calendar/finance-tasks', '/calendar/content-pieces']) {
      const call = api.get.mock.calls.find(c => c[0] === path)
      expect(call).toBeTruthy()
      expect(call[1].params.from).toBe(call[1].params.to)
    }
  })

  test('marca la invitación que todavía no respondí', async () => {
    mockApi({ meetings: [event({ participants: [{ userId: ME, status: 'pending' }] })] })
    renderCard()
    expect(await screen.findByText('Sin confirmar')).toBeInTheDocument()
    expect(screen.getByText(/1 sin confirmar/)).toBeInTheDocument()
  })

  test('mezcla las reuniones propias con lo traído de afuera, ordenado por hora', async () => {
    mockApi({ meetings: [event()], external: [externalEvent()] })
    renderCard()
    expect(await screen.findByText('Clase de inglés')).toBeInTheDocument()
    const horas = screen.getAllByText(/^\d{2}:\d{2}$/).map(el => el.textContent)
    expect(horas).toEqual(['08:00', '10:00'])
    expect(screen.getByText(/Hoy en tu calendario · 2/)).toBeInTheDocument()
  })

  test('un evento de afuera dice de qué calendario viene y abre su ficha', async () => {
    mockApi({ external: [externalEvent({ description: 'Repasamos los números del mes' })] })
    renderCard()
    expect(await screen.findByText(/Mi Google/)).toBeInTheDocument()

    // En la fila el título va truncado: hay que poder abrirlo para leerlo entero.
    // El detalle es de solo lectura — el evento se edita donde vive.
    fireEvent.click(screen.getByText('Clase de inglés'))
    expect(await screen.findByText('Repasamos los números del mes')).toBeInTheDocument()
    expect(screen.getByText(/Se edita en su calendario de origen/)).toBeInTheDocument()
  })

  test('un evento de día completo entra en la agenda, sin hora', async () => {
    mockApi({ external: [externalEvent({ title: 'Viaje', allDay: true, startTime: null, durationMins: null })] })
    renderCard()
    expect(await screen.findByText('Viaje')).toBeInTheDocument()
    expect(screen.getByText('Día')).toBeInTheDocument()
    expect(screen.queryByText(/en \d+ min/)).toBeNull()
  })

  test('una próxima acción de Ventas abre el lead', async () => {
    mockApi({ sales: [{ id: 5, title: 'Llamar', date: '2026-11-05', leadId: 3, companyName: 'Acme' }] })
    renderCard({ where: true })
    expect(await screen.findByText('Acme: Llamar')).toBeInTheDocument()
    expect(screen.getByText('Ventas')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Acme: Llamar'))
    expect(await screen.findByTestId('where')).toHaveTextContent('/ventas?lead=3')
  })

  test('una tarea de Finanzas abre Pendientes en esa tarea', async () => {
    mockApi({ finance: [{ id: 8, title: 'Cobrar factura', date: '2026-11-05', itemName: 'Acme' }] })
    renderCard({ where: true })
    expect(await screen.findByText('Acme: Cobrar factura')).toBeInTheDocument()
    expect(screen.getByText('Finanzas')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Acme: Cobrar factura'))
    expect(await screen.findByTestId('where')).toHaveTextContent('/finanzas?tab=pendientes&task=8')
  })

  test('una pieza de Contenido abre esa pieza', async () => {
    mockApi({ content: [{ id: 4, title: 'Reel del jueves', date: '2026-11-05', projectId: 9, projectName: 'Acme' }] })
    renderCard({ where: true })
    expect(await screen.findByText('Acme: Reel del jueves')).toBeInTheDocument()
    expect(screen.getByText('Contenido')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Acme: Reel del jueves'))
    expect(await screen.findByTestId('where')).toHaveTextContent('/contenido?projectId=9&piece=4')
  })

  test('si una fuente falla, la otra se muestra igual', async () => {
    api.get.mockImplementation(url => {
      if (url === '/calendar/external-events') return Promise.reject(new Error('503'))
      if (url === '/calendar/sales-actions' || url === '/calendar/finance-tasks' || url === '/calendar/content-pieces') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [event()] })
    })
    renderCard()
    expect(await screen.findByText('Kickoff con el cliente')).toBeInTheDocument()
  })

  test('una invitación sin responder no se cuenta sobre lo traído de afuera', async () => {
    mockApi({ external: [externalEvent()] })
    renderCard()
    await screen.findByText('Clase de inglés')
    expect(screen.queryByText('Sin confirmar')).toBeNull()
  })

  test('sin acceso al módulo no se pide nada al backend', async () => {
    state.user = { id: ME, moduleAccess: {} }
    const { container } = renderCard()
    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(api.get).not.toHaveBeenCalled()
  })

  test('con el módulo apagado tampoco', async () => {
    state.flag = false
    const { container } = renderCard()
    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(api.get).not.toHaveBeenCalled()
  })
})
