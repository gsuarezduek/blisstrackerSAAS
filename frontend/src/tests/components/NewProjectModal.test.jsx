import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NewProjectModal from '../../components/NewProjectModal'

vi.mock('../../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('../../hooks/useMembers', () => ({
  default: () => ({ members: [
    { id: 1, name: 'Yo', avatar: '2bee.png', active: true },
    { id: 2, name: 'Ana', avatar: '2bee.png', active: true },
  ] }),
}))

import api from '../../api/client'

describe('NewProjectModal', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: [{ id: 10, name: 'SEO' }] })
    api.post.mockResolvedValue({ data: { id: 99, name: 'Pastiza' } })
  })

  it('crea el proyecto con nombre, servicios y equipo', async () => {
    const onCreated = vi.fn()
    render(<NewProjectModal open onClose={() => {}} onCreated={onCreated} currentUserId={1} />)
    fireEvent.change(screen.getByPlaceholderText('Ej. Pastiza'), { target: { value: ' Pastiza ' } })
    fireEvent.click(await screen.findByRole('button', { name: 'SEO' }))
    expect(screen.queryByRole('button', { name: /Yo/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ana/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 99, name: 'Pastiza' }))
    expect(api.post).toHaveBeenCalledWith('/projects', { name: 'Pastiza', serviceIds: [10], memberIds: [2] })
  })
})
