import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'

vi.mock('../../hooks/useMembers', () => ({ default: () => ({ members: [], byId: new Map() }) }))
vi.mock('../../hooks/useRoles', () => ({ default: () => ({ labelFor: r => r }) }))

import TareasTab from '../../pages/project-detail/tareas'

const ana = { id: 1, name: 'Ana', avatar: '2bee.png' }
const data = {
  project: { id: 1, name: 'Pastiza' },
  activeCount: 3, activeLimit: 200,
  byUser: [{ user: ana, tasks: [
    { id: 1, description: 'Tarea bloqueada', status: 'BLOCKED', blockedReason: 'Falta acceso', _count: { comments: 0 } },
    { id: 2, description: 'Tarea en curso', status: 'IN_PROGRESS', _count: { comments: 0 } },
    { id: 3, description: 'Tarea pendiente', status: 'PENDING', _count: { comments: 0 } },
  ] }],
}

function Harness({ initial = '' }) {
  const [statusFilter, setStatusFilter] = useState(initial)
  return (
    <MemoryRouter>
      <TareasTab data={data} onOpenComments={() => {}} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        archive={[]} archiveSkip={0} hasMore={false} archiveLoading={false} archiveFrom="" archiveTo="" archiveUserId=""
        workspaceMembers={[]} onArchiveUserChange={() => {}} onArchiveDateSearch={() => {}}
        setArchiveFrom={() => {}} setArchiveTo={() => {}} onLoadMore={() => {}} />
    </MemoryRouter>
  )
}

describe('TareasTab (ficha del proyecto)', () => {
  it('el filtro "Bloqueadas" deja solo las bloqueadas, con su motivo', () => {
    render(<Harness />)
    expect(screen.getByText('Tarea pendiente')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Bloqueadas/ }))
    expect(screen.getByText('Tarea bloqueada')).toBeTruthy()
    expect(screen.getByText('Falta acceso')).toBeTruthy()
    expect(screen.queryByText('Tarea pendiente')).toBeNull()
    expect(screen.queryByText('Tarea en curso')).toBeNull()
  })

  it('no muestra chips de estados sin tareas', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: /Pausadas/ })).toBeNull()
  })
})
