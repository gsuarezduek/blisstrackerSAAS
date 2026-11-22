import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'

vi.mock('../../hooks/useMembers', () => ({ default: () => ({ members: [], byId: new Map() }) }))
vi.mock('../../hooks/useRoles', () => ({ default: () => ({ labelFor: r => r }) }))

import TareasTab from '../../pages/project-detail/tareas'

const ana = { id: 1, name: 'Ana', avatar: '2bee.png' }
const grok = { id: 8, label: 'Grok SEO', color: 'violet', teamRole: 'DESIGNER' }

const data = {
  project: { id: 1, name: 'Pastiza', agents: [{ agent: grok }] },
  activeCount: 3, activeLimit: 200,
  byUser: [{ user: ana, tasks: [
    { id: 1, description: 'Tarea bloqueada', status: 'BLOCKED', blockedReason: 'Falta acceso', _count: { comments: 0 } },
    { id: 2, description: 'Tarea en curso', status: 'IN_PROGRESS', _count: { comments: 0 } },
    { id: 3, description: 'Tarea pendiente', status: 'PENDING', _count: { comments: 0 } },
  ] }],
  byAgent: [],
}

// Con un agente trabajando en el proyecto: su tarea viaja en `byAgent`, no dentro de
// `byUser` de su dueño.
const dataConAgente = {
  ...data,
  byAgent: [{
    key: 'a:8', agent: grok, owner: ana,
    tasks: [{ id: 10, description: 'Auditoría de keywords', status: 'IN_PROGRESS', isAgentTask: true, agent: grok, _count: { comments: 0 } }],
  }],
}

function Harness({ initial = '', d = data }) {
  const [statusFilter, setStatusFilter] = useState(initial)
  return (
    <MemoryRouter>
      <TareasTab data={d} onOpenComments={() => {}} statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        archive={[]} archiveSkip={0} hasMore={false} archiveLoading={false} archiveFrom="" archiveTo="" archiveUserId="" archiveAgentId=""
        workspaceMembers={[]} onArchiveUserChange={() => {}} onArchiveAgentChange={() => {}} onArchiveDateSearch={() => {}}
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

describe('TareasTab — agentes con tarjeta propia', () => {
  it('el agente sale en su propia tarjeta, con su nombre y su dueño', () => {
    render(<Harness d={dataConAgente} />)
    // La tarjeta del agente se identifica por su nombre y por de quién es. El nombre
    // aparece además como <option> del filtro del historial, así que se busca el que
    // NO está en un select.
    const nombres = screen.getAllByText('Grok SEO').filter(el => el.tagName !== 'OPTION')
    expect(nombres.length).toBe(1)
    expect(screen.getByText('de Ana')).toBeTruthy()
    expect(screen.getByText('Auditoría de keywords')).toBeTruthy()
  })

  it('el conteo de los chips de estado incluye las tareas del agente', () => {
    // La tarea del agente está IN_PROGRESS igual que una de Ana: el chip tiene que
    // decir 2. Si el componente leyera solo `byUser`, diría 1.
    render(<Harness d={dataConAgente} />)
    const chip = screen.getByRole('button', { name: /En curso/ })
    expect(chip.textContent).toMatch(/2/)
  })

  it('el filtro por responsable aísla al agente', () => {
    render(<Harness d={dataConAgente} />)
    fireEvent.change(screen.getByLabelText('Responsable'), { target: { value: 'a:a:8' } })
    expect(screen.getByText('Auditoría de keywords')).toBeTruthy()
    expect(screen.queryByText('Tarea pendiente')).toBeNull()
  })

  it('sin agentes no aparece el filtro por responsable', () => {
    // Con un solo ejecutor el selector no filtraría nada.
    render(<Harness />)
    expect(screen.queryByLabelText('Responsable')).toBeNull()
  })
})
