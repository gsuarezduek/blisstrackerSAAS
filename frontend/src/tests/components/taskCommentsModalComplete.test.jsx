// "Completar" desde el detalle de la tarea (TaskCommentsModal): pensado para la tarea
// que se busca por número en Cmd+K, sin tener que rastrearla en el Dashboard.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const patch = vi.fn()
const get = vi.fn(url => Promise.resolve({ data: String(url).endsWith('/follow') ? { following: false } : [] }))
vi.mock('../../api/client', () => ({ default: { get: (...a) => get(...a), patch: (...a) => patch(...a), post: vi.fn(), delete: vi.fn() } }))
vi.mock('../../hooks/useMembers', () => ({ default: () => ({ members: [] }) }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, name: 'Yo', isAdmin: false } }) }))

import TaskCommentsModal from '../../components/TaskCommentsModal'

const base = { id: 29943, userId: 1, description: 'Responder mails', status: 'PENDING', project: { id: 1, name: 'Pastiza' }, createdAt: new Date().toISOString(), _count: { comments: 0 } }

function renderModal(task) {
  return render(<MemoryRouter><TaskCommentsModal task={task} onClose={vi.fn()} /></MemoryRouter>)
}

describe('TaskCommentsModal — Completar', () => {
  beforeEach(() => { patch.mockReset() })

  it('una pendiente pide la duración (opcional) y la manda en minutos', async () => {
    patch.mockResolvedValue({ data: { ...base, status: 'COMPLETED', completedAt: new Date().toISOString(), minutesOverride: 90 } })
    const onEvent = vi.fn()
    window.addEventListener('bliss:task-created', onEvent)
    renderModal(base)

    fireEvent.click(screen.getByRole('button', { name: 'Completar' }))
    fireEvent.change(screen.getByLabelText('Horas'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Minutos'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Completar' }))

    await waitFor(() => expect(patch).toHaveBeenCalledWith('/tasks/29943/complete', { minutes: 90 }))
    // El modal pasa a mostrarla completada y avisa a las listas para que recarguen.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Completar' })).toBeNull())
    expect(onEvent).toHaveBeenCalled()
    window.removeEventListener('bliss:task-created', onEvent)
  })

  it('una pendiente sin duración se completa sin mandar minutos', async () => {
    patch.mockResolvedValue({ data: { ...base, status: 'COMPLETED' } })
    renderModal(base)

    fireEvent.click(screen.getByRole('button', { name: 'Completar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Completar' }))

    await waitFor(() => expect(patch).toHaveBeenCalledWith('/tasks/29943/complete', undefined))
  })

  it('una en curso o pausada se completa en un click', async () => {
    patch.mockResolvedValue({ data: { ...base, status: 'COMPLETED' } })
    renderModal({ ...base, status: 'PAUSED' })

    fireEvent.click(screen.getByRole('button', { name: 'Completar' }))

    await waitFor(() => expect(patch).toHaveBeenCalledWith('/tasks/29943/complete', undefined))
    expect(screen.queryByLabelText('Horas')).toBeNull()
  })

  it('no se ofrece en una tarea ajena, bloqueada o ya completada', () => {
    const { unmount } = renderModal({ ...base, userId: 2 })
    expect(screen.queryByRole('button', { name: 'Completar' })).toBeNull()
    unmount()
    const r2 = renderModal({ ...base, status: 'BLOCKED', blockedReason: 'Falta acceso' })
    expect(screen.queryByRole('button', { name: 'Completar' })).toBeNull()
    r2.unmount()
    renderModal({ ...base, status: 'COMPLETED' })
    expect(screen.queryByRole('button', { name: 'Completar' })).toBeNull()
  })

  it('muestra el error del backend sin cerrar nada', async () => {
    patch.mockRejectedValue({ response: { data: { error: 'Desbloqueá la tarea antes de completarla.' } } })
    renderModal({ ...base, status: 'IN_PROGRESS', startedAt: new Date().toISOString() })

    fireEvent.click(screen.getByRole('button', { name: 'Completar' }))

    expect(await screen.findByText('Desbloqueá la tarea antes de completarla.')).toBeTruthy()
  })
})
