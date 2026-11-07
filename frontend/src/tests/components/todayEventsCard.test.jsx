/**
 * "Hoy en tu calendario" (Dashboard): en qué fase del reloj está cada reunión.
 * Es lo que decide si la fila grita ("Ahora"), avisa ("en X min") o se apaga
 * (ya pasó) — los bordes son exactos: arranca EN el minuto de inicio y se apaga
 * EN el minuto en que termina.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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

function renderCard() {
  return render(<MemoryRouter><TodayEventsCard /></MemoryRouter>)
}

// La tarjeta junta dos fuentes: las reuniones de BlissTracker y lo traído de los
// calendarios de afuera (ver ExternalCalendar).
function mockApi({ meetings = [], external = [] } = {}) {
  api.get.mockImplementation(url => Promise.resolve({
    data: url === '/calendar/external-events' ? external : meetings,
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
    for (const path of ['/calendar/events', '/calendar/external-events']) {
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

  test('un evento de afuera dice de qué calendario viene y no se puede abrir', async () => {
    mockApi({ external: [externalEvent()] })
    renderCard()
    expect(await screen.findByText(/Mi Google/)).toBeInTheDocument()
    // Solo las reuniones de BlissTracker llevan a su detalle; un evento de Google
    // no existe como reunión acá.
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('los de día completo no entran en la agenda por horario', async () => {
    mockApi({ external: [externalEvent({ title: 'Viaje', allDay: true, startTime: null, durationMins: null })] })
    const { container } = renderCard()
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
    expect(container).toBeEmptyDOMElement()
  })

  test('si una fuente falla, la otra se muestra igual', async () => {
    api.get.mockImplementation(url => (
      url === '/calendar/external-events'
        ? Promise.reject(new Error('503'))
        : Promise.resolve({ data: [event()] })
    ))
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
