import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProjectPrivacyToggle from '../../components/ProjectPrivacyToggle'

vi.mock('../../api/client', () => ({
  default: { patch: vi.fn() },
}))

import api from '../../api/client'

describe('ProjectPrivacyToggle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no renderiza nada si el viewer no puede editar el proyecto', () => {
    const { container } = render(
      <ProjectPrivacyToggle project={{ id: 1, isPrivate: false }} canEdit={false} onUpdated={() => {}} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('marca el proyecto como privado tras confirmar', async () => {
    api.patch.mockResolvedValue({ data: { id: 1, isPrivate: true } })
    const onUpdated = vi.fn()
    render(<ProjectPrivacyToggle project={{ id: 1, isPrivate: false }} canEdit onUpdated={onUpdated} />)

    fireEvent.click(screen.getByRole('button', { name: 'Marcar como privado' }))
    // Dos botones con el mismo texto: el de la tarjeta y el de confirmar del modal.
    const buttons = await screen.findAllByRole('button', { name: 'Marcar como privado' })
    fireEvent.click(buttons[buttons.length - 1])

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/projects/1/privacy', { isPrivate: true }))
    expect(onUpdated).toHaveBeenCalledWith({ id: 1, isPrivate: true })
  })

  it('muestra el detalle de quién bloquea el cambio si el backend devuelve 409', async () => {
    api.patch.mockRejectedValue({
      response: { data: { error: 'Hay personas...', code: 'PRIVATE_BLOCKED_BY_TASKS', users: [{ id: 5, name: 'Ana', taskCount: 2 }] } },
    })
    render(<ProjectPrivacyToggle project={{ id: 1, isPrivate: false }} canEdit onUpdated={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Marcar como privado' }))
    const buttons = await screen.findAllByRole('button', { name: 'Marcar como privado' })
    fireEvent.click(buttons[buttons.length - 1])

    expect(await screen.findByText(/Ana — 2 tareas abiertas/)).toBeInTheDocument()
  })

  it('des-privatiza sin pedir validación de tareas', async () => {
    api.patch.mockResolvedValue({ data: { id: 1, isPrivate: false } })
    const onUpdated = vi.fn()
    render(<ProjectPrivacyToggle project={{ id: 1, isPrivate: true }} canEdit onUpdated={onUpdated} />)

    fireEvent.click(screen.getByRole('button', { name: 'Volver a hacerlo abierto' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Hacerlo abierto' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/projects/1/privacy', { isPrivate: false }))
    expect(onUpdated).toHaveBeenCalledWith({ id: 1, isPrivate: false })
  })
})
