import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AgentsWorkingStrip from '../../components/dashboard/AgentsWorkingStrip'

const project = { id: 1, name: 'Pastiza' }
const running = (id, label) => ({ id, status: 'IN_PROGRESS', description: `Tarea ${id}`, project, agent: { id: 7, label }, sessions: [{ startedAt: new Date().toISOString(), endedAt: null }] })

function renderStrip(tasks, props = {}) {
  return render(<MemoryRouter><AgentsWorkingStrip tasks={tasks} {...props} /></MemoryRouter>)
}

describe('AgentsWorkingStrip', () => {
  it('no se muestra si ningún agente tiene tareas en curso', () => {
    const { container } = renderStrip([{ ...running(1, 'Grok'), status: 'PENDING' }])
    expect(container).toBeEmptyDOMElement()
  })

  it('lista solo las tareas en curso, con el agente, y las cuenta', () => {
    renderStrip([running(1, 'Grok'), running(2, 'Grok'), { ...running(3, 'Grok'), status: 'BLOCKED' }])
    expect(screen.getByText(/Tus agentes trabajando ahora · 2/)).toBeInTheDocument()
    expect(screen.getByText('Tarea 1')).toBeInTheDocument()
    expect(screen.queryByText('Tarea 3')).toBeNull()
    expect(screen.getAllByText('Grok')).toHaveLength(2)
  })

  it('abre el detalle al tocar la tarea y "Ver todo" lleva a la pestaña', () => {
    const onOpenComments = vi.fn()
    const onSeeAll = vi.fn()
    renderStrip([running(1, 'Grok')], { onOpenComments, onSeeAll })
    fireEvent.click(screen.getByText('Tarea 1'))
    expect(onOpenComments).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    fireEvent.click(screen.getByText('Ver todo →'))
    expect(onSeeAll).toHaveBeenCalled()
  })
})
