/**
 * Aviso de Google Calendar caído, con "Reconectar". Antes no había forma de
 * reconectar: el botón de conectar solo aparecía sin calendarios de Google, y con
 * la conexión caída la persona tenía uno (con el error a la vista y nada que hacer).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GoogleCalendarReconnectBanner from '../../components/calendar/GoogleCalendarReconnectBanner'

const hook = { status: null, connecting: false, connect: vi.fn() }
vi.mock('../../components/calendar/useGoogleCalendarConnection', () => ({ default: () => hook }))

beforeEach(() => {
  vi.clearAllMocks()
  hook.status = null
  hook.connecting = false
})

describe('GoogleCalendarReconnectBanner', () => {
  it('no muestra nada con la conexión bien o sin conexión', () => {
    hook.status = { connected: true, status: 'active', needsReconnect: false }
    const { container, rerender } = render(<GoogleCalendarReconnectBanner />)
    expect(container).toBeEmptyDOMElement()

    hook.status = { connected: false, status: null, needsReconnect: false }
    rerender(<GoogleCalendarReconnectBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('conexión vencida: explica qué no anda y ofrece reconectar', async () => {
    hook.status = { connected: false, status: 'expired', needsReconnect: true }
    hook.connect.mockResolvedValue({ ok: true })
    const onReconnected = vi.fn()
    render(<GoogleCalendarReconnectBanner onReconnected={onReconnected} />)

    expect(screen.getByRole('alert')).toHaveTextContent('se desconectó')
    fireEvent.click(screen.getByRole('button', { name: 'Reconectar' }))
    await waitFor(() => expect(onReconnected).toHaveBeenCalled())
  })

  it('sin permiso del calendario: le dice que deje tildada la casilla', () => {
    hook.status = { connected: false, status: 'missing_scope', needsReconnect: true }
    render(<GoogleCalendarReconnectBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent('sin permiso para el calendario')
    expect(screen.getByRole('alert')).toHaveTextContent('dejá tildada la casilla')
  })

  it('si la reconexión vuelve con error (ej. otra vez sin el permiso) lo muestra', async () => {
    hook.status = { connected: false, status: 'missing_scope', needsReconnect: true }
    hook.connect.mockResolvedValue({ ok: false, error: 'No diste permiso al calendario.' })
    const onReconnected = vi.fn()
    render(<GoogleCalendarReconnectBanner onReconnected={onReconnected} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reconectar' }))
    expect(await screen.findByText('No diste permiso al calendario.')).toBeInTheDocument()
    expect(onReconnected).not.toHaveBeenCalled()
  })

  it('cancelar el popup no se muestra como error', async () => {
    hook.status = { connected: false, status: 'expired', needsReconnect: true }
    hook.connect.mockResolvedValue({ ok: false, error: 'cancelled' })
    render(<GoogleCalendarReconnectBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Reconectar' }))
    await waitFor(() => expect(hook.connect).toHaveBeenCalled())
    expect(screen.queryByText('cancelled')).not.toBeInTheDocument()
  })
})
