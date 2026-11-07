/**
 * "Mis calendarios": el panel donde cada persona trae su Google y suscribe
 * calendarios por URL (ver ExternalCalendar en el backend).
 *
 * Lo que se cuida acá: que la URL pegada no vuelva a mostrarse (es la llave de la
 * agenda), que un error del backend se vea en vez de fallar en silencio, y que
 * quitar un calendario pida confirmación explicando qué pasa con la conexión.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ExternalCalendarsModal from '../../components/calendar/ExternalCalendarsModal'

vi.mock('../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))
vi.mock('../../components/calendar/GoogleCalendarConnectButton', () => ({
  default: () => <button type="button">Conectar Google Calendar</button>,
}))

import api from '../../api/client'

const ICS_URL = 'https://calendar.google.com/calendar/ical/abc/private-secreto/basic.ics'

function cal(over = {}) {
  return {
    id: 50, source: 'ics', name: 'Agenda del estudio', color: '#4285F4',
    showDetails: false, active: true, lastSyncAt: new Date().toISOString(),
    lastSyncError: null, lastSyncCount: 3, eventCount: 3, icsHost: 'calendar.google.com',
    createdAt: new Date().toISOString(), ...over,
  }
}

function open(props = {}) {
  return render(<ExternalCalendarsModal onClose={() => {}} {...props} />)
}

describe('ExternalCalendarsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: [] })
  })

  it('ofrece conectar Google cuando todavía no hay nada', async () => {
    open()
    expect(await screen.findByText('Conectar Google Calendar')).toBeInTheDocument()
  })

  it('lista lo suscrito con su origen y cuándo se actualizó', async () => {
    api.get.mockResolvedValue({ data: [cal(), cal({ id: 60, source: 'google', name: 'yo@x.com', icsHost: null })] })
    open()
    expect(await screen.findByText('Agenda del estudio')).toBeInTheDocument()
    expect(screen.getByText(/calendar\.google\.com · 3 eventos/)).toBeInTheDocument()
    expect(screen.getByText(/Tu cuenta de Google/)).toBeInTheDocument()
  })

  it('agrega por URL y NO la vuelve a mostrar', async () => {
    api.post.mockResolvedValue({ data: cal({ name: 'Agenda del estudio' }) })
    const onChanged = vi.fn()
    const { container } = open({ onChanged })

    fireEvent.change(await screen.findByPlaceholderText(/\.ics/), { target: { value: ICS_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/calendar/external-calendars', { url: ICS_URL, name: undefined }))
    expect(await screen.findByText('Agenda del estudio')).toBeInTheDocument()
    expect(container.innerHTML).not.toContain('private-secreto')
    expect(onChanged).toHaveBeenCalled()
  })

  it('muestra el error del backend si la URL no sirve', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'No se pudo leer ese calendario: 404' } } })
    open()
    fireEvent.change(await screen.findByPlaceholderText(/\.ics/), { target: { value: ICS_URL } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(await screen.findByText(/No se pudo leer ese calendario/)).toBeInTheDocument()
  })

  it('al quitar el de Google aclara que la cuenta sigue conectada', async () => {
    api.get.mockResolvedValue({ data: [cal({ id: 60, source: 'google', name: 'yo@x.com', icsHost: null })] })
    api.delete.mockResolvedValue({ data: { ok: true } })
    open()

    fireEvent.click(await screen.findByTitle(/Dejar de traer los eventos de Google/))
    expect(await screen.findByText(/Tu cuenta de Google sigue conectada/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/calendar/external-calendars/60'))
  })

  it('el toggle de privacidad dice qué ve el equipo', async () => {
    api.get.mockResolvedValue({ data: [cal()] })
    api.patch.mockResolvedValue({ data: cal({ showDetails: true }) })
    open()

    fireEvent.click(await screen.findByText('El equipo solo ve "Ocupado"'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/calendar/external-calendars/50', { showDetails: true }))
    expect(await screen.findByText('El equipo ve de qué se trata')).toBeInTheDocument()
  })

  it('apagar un calendario no lo borra', async () => {
    api.get.mockResolvedValue({ data: [cal()] })
    api.patch.mockResolvedValue({ data: cal({ active: false }) })
    open()

    fireEvent.click(await screen.findByLabelText('Mostrar en mi calendario', { selector: 'input' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/calendar/external-calendars/50', { active: false }))
    expect(api.delete).not.toHaveBeenCalled()
  })
})
