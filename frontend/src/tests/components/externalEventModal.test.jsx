/**
 * Ficha de un evento traído de un calendario de afuera.
 *
 * Existe porque en la grilla el bloque es chico y el título va truncado: abrirlo es
 * la única forma de leer de qué era. Es de solo lectura, y lo que muestra depende
 * de quién pregunta — eso lo resuelve el backend (shapeExternalEvent), acá se
 * verifica que la UI no invente lo que no vino.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ExternalEventModal from '../../components/calendar/ExternalEventModal'

vi.mock('../../api/client', () => ({ default: { get: vi.fn() } }))
import api from '../../api/client'

function event(over = {}) {
  return {
    id: 7, kind: 'external', title: 'Reunión cierre semanal', calendarName: 'Mi Google',
    date: '2026-11-10', endDate: '2026-11-10', startTime: '15:00', durationMins: 90,
    allDay: false, busy: true, color: '#4285F4',
    location: 'Oficina', organizer: 'Jefa', description: 'Repasamos los números',
    meetLink: 'https://meet.google.com/abc-defg-hij', url: 'https://calendar.google.com/event?eid=x',
    attendees: [
      { name: 'Ana Pérez', email: 'ana@x.com', status: 'accepted' },
      { email: 'beto@x.com', status: 'pending' },
    ],
    attendeeCount: 2,
    canSeeDetail: true, ...over,
  }
}

describe('ExternalEventModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra el horario completo, el calendario y los detalles', async () => {
    render(<ExternalEventModal event={event()} onClose={() => {}} />)
    expect(screen.getByText('Reunión cierre semanal')).toBeInTheDocument()
    expect(screen.getByText(/Martes, 10 de noviembre · 15:00–16:30 \(1h 30m\)/)).toBeInTheDocument()
    expect(screen.getByText('Mi Google')).toBeInTheDocument()
    expect(screen.getByText('Jefa')).toBeInTheDocument()
    expect(screen.getByText('Repasamos los números')).toBeInTheDocument()
  })

  it('lista los invitados con su estado y cuántos confirmaron', () => {
    render(<ExternalEventModal event={event()} onClose={() => {}} />)
    expect(screen.getByText(/2 invitados/)).toBeInTheDocument()
    expect(screen.getByText(/1 confirmó/)).toBeInTheDocument()
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Confirmó')).toBeInTheDocument()
    // Sin nombre se muestra el mail, que es lo único que hay.
    expect(screen.getByText('beto@x.com')).toBeInTheDocument()
    expect(screen.getByText('Sin responder')).toBeInTheDocument()
  })

  it('en una reunión multitudinaria dice cuántos quedaron sin listar', () => {
    render(<ExternalEventModal event={event({ attendeeCount: 120 })} onClose={() => {}} />)
    expect(screen.getByText(/120 invitados/)).toBeInTheDocument()
    expect(screen.getByText('y 118 más')).toBeInTheDocument()
  })

  it('sin invitados no muestra la sección', () => {
    render(<ExternalEventModal event={event({ attendees: null, attendeeCount: null })} onClose={() => {}} />)
    expect(screen.queryByText(/invitado/)).toBeNull()
  })

  it('ofrece entrar a la videollamada y abrir el evento donde vive', () => {
    render(<ExternalEventModal event={event()} onClose={() => {}} />)
    expect(screen.getByRole('link', { name: /Entrar a la reunión/ })).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij')
    expect(screen.getByRole('link', { name: /Abrir ahí/ })).toHaveAttribute('href', 'https://calendar.google.com/event?eid=x')
    expect(screen.getByText(/Se edita en su calendario de origen/)).toBeInTheDocument()
  })

  it('un evento de día completo muestra el rango, no un horario', () => {
    render(<ExternalEventModal event={event({ allDay: true, startTime: null, durationMins: null, date: '2026-11-12', endDate: '2026-11-14' })} onClose={() => {}} />)
    expect(screen.getByText(/Jueves, 12 de noviembre → Sábado, 14 de noviembre · todo el día/)).toBeInTheDocument()
  })

  it('el de otra persona que no comparte detalles dice por qué no hay nada', () => {
    render(<ExternalEventModal
      event={event({ title: 'Ocupado', canSeeDetail: false, calendarName: null, organizer: null, location: null, description: null, meetLink: null, url: null, attendees: null, attendeeCount: null })}
      onClose={() => {}} />)
    expect(screen.getByText(/no comparte de qué se trata/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(/invitado/)).toBeNull()
  })

  it('con solo el id, lo pide al backend', async () => {
    api.get.mockResolvedValue({ data: event() })
    render(<ExternalEventModal eventId={7} onClose={() => {}} />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/calendar/external-events/7'))
    expect(await screen.findByText('Reunión cierre semanal')).toBeInTheDocument()
  })

  it('si no se puede cargar, lo dice', async () => {
    api.get.mockRejectedValue(new Error('404'))
    render(<ExternalEventModal eventId={7} onClose={() => {}} />)
    expect(await screen.findByText(/No se pudo cargar el evento/)).toBeInTheDocument()
  })
})
