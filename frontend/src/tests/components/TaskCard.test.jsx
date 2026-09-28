import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const patch = vi.fn()
vi.mock('../../api/client', () => ({ default: { patch: (...a) => patch(...a), delete: vi.fn() } }))
vi.mock('../../hooks/useMembers', () => ({ default: () => ({ members: [] }) }))

import TaskCard from '../../components/TaskCard'

const project = { id: 1, name: 'Pastiza' }
const task = { id: 2, description: 'Responder mails', status: 'PENDING', starred: 0, project, _count: { comments: 0, files: 0 } }
const active = { id: 1, description: 'Armar reporte', status: 'IN_PROGRESS', starred: 0, project }

function renderCard(props) {
  return render(<MemoryRouter><TaskCard task={task} onUpdate={vi.fn()} onDelete={vi.fn()} {...props} /></MemoryRouter>)
}

describe('TaskCard (Dashboard)', () => {
  beforeEach(() => patch.mockReset())

  it('con otra tarea en curso, "Iniciar" pausa la activa y después arranca esta', async () => {
    patch.mockImplementation((url) => { return Promise.resolve({ data: String(url).endsWith('/pause') ? { ...active, status: 'PAUSED' } : { ...task, status: 'IN_PROGRESS' } }) })
    const onUpdate = vi.fn()
    renderCard({ activeTask: active, onUpdate })

    // Hay dos copias del botón (desktop y mobile, se alternan por CSS); cualquiera sirve.
    fireEvent.click(screen.getAllByRole('button', { name: 'Iniciar' })[0])

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2))
    expect(patch.mock.calls.map(c => c[0])).toEqual(['/tasks/1/pause', '/tasks/2/start'])
    expect(onUpdate.mock.calls[0][0].status).toBe('PAUSED')
    expect(onUpdate.mock.calls[1][0].status).toBe('IN_PROGRESS')
  })

  it('sin tarea en curso, "Iniciar" solo arranca esta', async () => {
    patch.mockResolvedValue({ data: { ...task, status: 'IN_PROGRESS' } })
    renderCard({ activeTask: null })
    fireEvent.click(screen.getAllByRole('button', { name: 'Iniciar' })[0])
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    expect(patch).toHaveBeenCalledWith('/tasks/2/start')
  })

  it('una bloqueada muestra el motivo y la acción "Desbloquear"', () => {
    renderCard({ task: { ...task, status: 'BLOCKED', blockedReason: 'Falta acceso' } })
    expect(screen.getByText('Falta acceso')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Desbloquear' }).length).toBeGreaterThan(0)
  })
})
