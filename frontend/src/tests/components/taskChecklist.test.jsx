import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Subtareas (checklist) de una tarea: el componente compartido y el badge "2/4" de la
// fila del Dashboard. Ver components/dashboard/TaskChecklist.jsx.

const patch = vi.fn()
const post = vi.fn()
const del = vi.fn()
vi.mock('../../api/client', () => ({
  default: {
    patch: (...a) => patch(...a),
    post: (...a) => post(...a),
    delete: (...a) => del(...a),
  },
}))
vi.mock('../../hooks/useMembers', () => ({ default: () => ({ members: [] }) }))
vi.mock('../../hooks/useMyAgents', () => ({ default: () => [], agentName: a => a?.label || '' }))

import TaskChecklist from '../../components/dashboard/TaskChecklist'
import TaskCard from '../../components/TaskCard'
import { checklistProgress, checklistToneClass } from '../../utils/format'

const project = { id: 1, name: 'Pastiza' }
const items = [
  { id: 10, text: 'Escribir el borrador', done: true, order: 0 },
  { id: 11, text: 'Revisar con el cliente', done: false, order: 1 },
]
const task = {
  id: 2, description: 'Newsletter de noviembre', status: 'PENDING', starred: 0, project,
  _count: { comments: 0, files: 0 }, checklist: items,
}

beforeEach(() => { patch.mockReset(); post.mockReset(); del.mockReset() })

describe('checklistProgress', () => {
  it('cuenta tildadas sobre el total', () => {
    expect(checklistProgress(task)).toMatchObject({ done: 1, total: 2, complete: false, label: '1/2' })
  })

  it('marca complete cuando están todas', () => {
    const p = checklistProgress({ checklist: [{ id: 1, done: true }, { id: 2, done: true }] })
    expect(p).toMatchObject({ done: 2, total: 2, complete: true })
  })

  // Sin subtareas no hay badge: también cubre las vistas cuyo include no trae `checklist`.
  it('devuelve null sin subtareas o sin el campo', () => {
    expect(checklistProgress({ checklist: [] })).toBeNull()
    expect(checklistProgress({})).toBeNull()
    expect(checklistProgress(null)).toBeNull()
  })

  it('el color va de gris a ámbar a verde', () => {
    expect(checklistToneClass(checklistProgress({ checklist: [{ done: false }] }))).toMatch(/gray/)
    expect(checklistToneClass(checklistProgress(task))).toMatch(/amber/)
    expect(checklistToneClass(checklistProgress({ checklist: [{ done: true }] }))).toMatch(/green/)
  })
})

describe('TaskChecklist', () => {
  it('tilda de forma optimista y después confirma con lo que devuelve el servidor', async () => {
    const serverItems = [{ ...items[0] }, { ...items[1], done: true }]
    patch.mockResolvedValue({ data: serverItems })
    const onUpdate = vi.fn()
    render(<TaskChecklist task={task} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByText('Revisar con el cliente'))

    // Primer aviso al padre: optimista, antes de que responda el servidor.
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].checklist[1].done).toBe(true)
    expect(patch).toHaveBeenCalledWith('/tasks/2/checklist/11', { done: true })

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2))
    expect(onUpdate.mock.calls[1][0].checklist).toEqual(serverItems)
  })

  it('si el servidor falla, vuelve al estado anterior', async () => {
    patch.mockRejectedValue({ response: { data: {} } })
    const onUpdate = vi.fn()
    render(<TaskChecklist task={task} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByText('Revisar con el cliente'))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2))
    expect(onUpdate.mock.calls[1][0].checklist).toEqual(items) // rollback
  })

  it('agrega una subtarea y deja el campo listo para la siguiente', async () => {
    const serverItems = [...items, { id: 12, text: 'Publicar', done: false, order: 2 }]
    post.mockResolvedValue({ data: serverItems })
    const onUpdate = vi.fn()
    render(<TaskChecklist task={task} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: /Agregar otra/ }))
    const input = screen.getByPlaceholderText(/Agregar subtarea/)
    fireEvent.change(input, { target: { value: 'Publicar' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(post).toHaveBeenCalledWith('/tasks/2/checklist', { text: 'Publicar' }))
    expect(onUpdate.mock.calls[0][0].checklist).toEqual(serverItems)
    expect(screen.getByPlaceholderText(/Agregar subtarea/)).toHaveValue('')
  })

  it('en variant compact no ofrece agregar ni convertir en tarea', () => {
    render(<TaskChecklist task={task} onUpdate={vi.fn()} variant="compact" />)

    expect(screen.queryByRole('button', { name: /Agregar/ })).toBeNull()
    expect(screen.queryByTitle('Convertir en tarea propia')).toBeNull()
    expect(screen.getByText('Revisar con el cliente')).toBeInTheDocument()
  })
})

describe('TaskCard — badge de progreso', () => {
  function renderCard(props) {
    return render(
      <MemoryRouter>
        <TaskCard task={task} onUpdate={vi.fn()} onDelete={vi.fn()} onOpenComments={vi.fn()} {...props} />
      </MemoryRouter>
    )
  }

  it('muestra "1/2" y despliega el checklist al tocarlo', () => {
    renderCard()

    const badge = screen.getByTitle('Ver subtareas')
    expect(badge).toHaveTextContent('1/2')
    // Plegado: el texto de las subtareas todavía no está en la fila.
    expect(screen.queryByText('Revisar con el cliente')).toBeNull()

    fireEvent.click(badge)
    expect(screen.getByText('Revisar con el cliente')).toBeInTheDocument()
  })

  it('sin subtareas no muestra el badge', () => {
    renderCard({ task: { ...task, checklist: [] } })
    expect(screen.queryByTitle('Ver subtareas')).toBeNull()
  })
})
