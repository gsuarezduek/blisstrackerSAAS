import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('../../components/Navbar', () => ({ default: () => null }))
vi.mock('../../components/LoadingSpinner', () => ({ default: () => <p>Cargando</p> }))
vi.mock('../../components/TaskCommentsModal', () => ({ default: () => null }))
vi.mock('../../hooks/useMembers', () => ({ default: () => ({ members: [], byId: new Map() }) }))
vi.mock('../../hooks/useRoles', () => ({ default: () => ({ labelFor: r => r }) }))

import api from '../../api/client'
import AgentProfile from '../../pages/AgentProfile'
import { WAKE_UI_ENABLED } from '../../utils/agentWake'

const agent = {
  id: 2, label: 'Grok SEO', color: 'violet', teamRole: 'DESIGNER',
  description: 'Audita keywords y escribe briefs.',
  lastUsedAt: '2026-11-20T12:00:00.000Z',
  owner: { id: 1, name: 'Gastón Suárez', avatar: '2bee.png' },
  projects: [{ id: 5, name: 'Pastiza' }],
}

const ficha = {
  agent,
  summary: { day: { count: 2, minutes: 90 }, week: { count: 7, minutes: 400 }, month: { count: 20, minutes: 1200 } },
  active: {
    BLOCKED: [{ id: 11, description: '¿Publico el post?', status: 'BLOCKED', blockedReason: 'Necesito tu OK', project: { id: 5, name: 'Pastiza' }, _count: { comments: 0 } }],
    IN_PROGRESS: [], PAUSED: [], PENDING: [],
  },
  channels: { hasWebhook: true, wakeEnabled: false },
  canEdit: true,
}

function renderFicha() {
  return render(
    <MemoryRouter initialEntries={['/agentes/2']}>
      <Routes><Route path="/agentes/:id" element={<AgentProfile />} /></Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(url =>
    url.includes('/completed')
      ? Promise.resolve({ data: { period: 'day', items: [], total: { count: 0, minutes: 0 } } })
      : Promise.resolve({ data: ficha })
  )
})

describe('AgentProfile', () => {
  it('muestra la identidad del agente y de quién es', async () => {
    renderFicha()
    expect(await screen.findByText('Grok SEO')).toBeTruthy()
    expect(screen.getByText('Audita keywords y escribe briefs.')).toBeTruthy()
    expect(screen.getByText('Gastón Suárez')).toBeTruthy()
    expect(screen.getByText('Pastiza')).toBeTruthy()
  })

  it('pone las bloqueadas primero: son preguntas esperando respuesta', async () => {
    renderFicha()
    expect(await screen.findByText(/Necesitan tu ayuda/)).toBeTruthy()
    expect(screen.getByText('¿Publico el post?')).toBeTruthy()
    expect(screen.getByText('Necesito tu OK')).toBeTruthy()
  })

  it('muestra el estado de los canales pero nunca la URL del webhook', async () => {
    renderFicha()
    await screen.findByText('Grok SEO')
    expect(screen.getByText(/Webhook: configurado/)).toBeTruthy()
    // El despertador está escondido del producto (utils/agentWake.js): mientras lo esté,
    // la ficha no lo nombra. Si se vuelve a prender, esta línea lo vuelve a exigir.
    if (WAKE_UI_ENABLED) expect(screen.getByText(/Despertador: apagado/)).toBeTruthy()
    else expect(screen.queryByText(/Despertador/)).toBeNull()
  })

  it('a quien no puede editar no le muestra el bloque de canales', async () => {
    api.get.mockImplementation(url =>
      url.includes('/completed')
        ? Promise.resolve({ data: { period: 'day', items: [], total: { count: 0, minutes: 0 } } })
        : Promise.resolve({ data: { ...ficha, channels: null, canEdit: false } })
    )
    renderFicha()
    await screen.findByText('Grok SEO')
    expect(screen.queryByText(/Cómo se le avisa/)).toBeNull()
  })

  it('un agente sin proyectos aclara que igual puede trabajar en cualquiera', async () => {
    api.get.mockImplementation(url =>
      url.includes('/completed')
        ? Promise.resolve({ data: { period: 'day', items: [], total: { count: 0, minutes: 0 } } })
        : Promise.resolve({ data: { ...ficha, agent: { ...agent, projects: [] } } })
    )
    renderFicha()
    expect(await screen.findByText(/igual puede trabajar en cualquiera/)).toBeTruthy()
  })

  it('un agente que nunca se conectó lo dice', async () => {
    api.get.mockImplementation(url =>
      url.includes('/completed')
        ? Promise.resolve({ data: { period: 'day', items: [], total: { count: 0, minutes: 0 } } })
        : Promise.resolve({ data: { ...ficha, agent: { ...agent, lastUsedAt: null } } })
    )
    renderFicha()
    expect(await screen.findByText(/Todavía no se conectó/)).toBeTruthy()
  })

  it('si el agente no existe muestra el error y no rompe', async () => {
    api.get.mockRejectedValue({ response: { data: { error: 'Agente no encontrado' } } })
    renderFicha()
    await waitFor(() => expect(screen.getByText('Agente no encontrado')).toBeTruthy())
  })
})
