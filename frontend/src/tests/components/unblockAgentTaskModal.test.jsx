import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import UnblockAgentTaskModal from '../../components/dashboard/UnblockAgentTaskModal'

vi.mock('../../api/client', () => ({
  default: { patch: vi.fn() },
}))

import api from '../../api/client'

const task = {
  id: 12,
  description: 'Redactar 3 posteos de noviembre',
  blockedReason: '¿Publico con la cuenta de la agencia o la del cliente?',
  agent: { id: 7, label: 'Grok' },
  agentName: null,
}

describe('UnblockAgentTaskModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.patch.mockResolvedValue({ data: { id: 12, status: 'PAUSED' } })
  })

  it('muestra lo que preguntó el agente: es lo que hay que responder', () => {
    render(<UnblockAgentTaskModal task={task} onClose={() => {}} onUnblocked={() => {}} />)
    expect(screen.getByText(/¿Publico con la cuenta de la agencia/)).toBeTruthy()
    expect(screen.getByText(/Grok preguntó/)).toBeTruthy()
  })

  it('manda la respuesta como `reply` y devuelve la tarea actualizada', async () => {
    const onUnblocked = vi.fn()
    const onClose = vi.fn()
    render(<UnblockAgentTaskModal task={task} onClose={onClose} onUnblocked={onUnblocked} />)

    fireEvent.change(screen.getByLabelText(/Tu respuesta/), { target: { value: '  Con la de la agencia  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    await waitFor(() => expect(onUnblocked).toHaveBeenCalledWith({ id: 12, status: 'PAUSED' }))
    expect(api.patch).toHaveBeenCalledWith('/tasks/12/unblock', { reply: 'Con la de la agencia' })
    expect(onClose).toHaveBeenCalled()
  })

  // La respuesta es opcional: a veces lo que frenaba al agente se resolvió afuera
  // (se le dio un acceso, se publicó lo que faltaba) y no hay nada que contestar.
  it('sin respuesta desbloquea igual, sin mandar el campo', async () => {
    render(<UnblockAgentTaskModal task={task} onClose={() => {}} onUnblocked={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/tasks/12/unblock', {}))
  })

  it('si falla muestra el error y no cierra', async () => {
    api.patch.mockRejectedValue({ response: { data: { error: 'Solo se puede desbloquear una tarea bloqueada.' } } })
    const onClose = vi.fn()
    render(<UnblockAgentTaskModal task={task} onClose={onClose} onUnblocked={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }))

    expect(await screen.findByText('Solo se puede desbloquear una tarea bloqueada.')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})
