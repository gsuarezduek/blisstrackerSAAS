import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AgentChannels, WakeConfigCard } from '../../components/preferences/agentChannels'

vi.mock('../../api/client', () => ({
  default: { get: vi.fn(), patch: vi.fn(), put: vi.fn() },
}))

import api from '../../api/client'

const token = { id: 7, label: 'Grok', webhookUrl: null, webhookSecret: null, wakeEnabled: false }

describe('AgentChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.patch.mockResolvedValue({ data: { ...token, webhookUrl: 'https://hooks.example.com/x' } })
  })

  function open(t = token) {
    const onSaved = vi.fn()
    render(<AgentChannels token={t} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole('button', { name: /Avisarle cuando hay novedades/ }))
    return onSaved
  }

  it('guarda la URL del webhook', async () => {
    const onSaved = open()
    fireEvent.change(screen.getByLabelText(/Webhook/), { target: { value: 'https://hooks.example.com/x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/mcp-tokens/7', { webhookUrl: 'https://hooks.example.com/x' }))
    expect(onSaved).toHaveBeenCalled()
  })

  it('el toggle del despertador se guarda solo', async () => {
    open()
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/mcp-tokens/7', { wakeEnabled: true }))
  })

  // El secret no sirve de nada si no se puede copiar: es lo que el receptor usa para
  // verificar la firma.
  it('muestra el secret de la firma cuando hay webhook', () => {
    open({ ...token, webhookUrl: 'https://hooks.example.com/x', webhookSecret: 'deadbeef' })
    expect(screen.getByText(/deadbeef/)).toBeTruthy()
    expect(screen.getByText(/X-Bliss-Signature/)).toBeTruthy()
  })

  it('un fallo de entrega se ve en rojo con el motivo', () => {
    open({ ...token, webhookUrl: 'https://hooks.example.com/x', webhookLastAt: new Date().toISOString(), webhookLastStatus: 'timeout' })
    expect(screen.getByText(/Falló: timeout/)).toBeTruthy()
  })

  it('el resumen del encabezado dice qué canales están activos', () => {
    render(<AgentChannels token={{ ...token, webhookUrl: 'https://x.example.com', wakeEnabled: true }} onSaved={() => {}} />)
    expect(screen.getByText(/webhook \+ despertador/)).toBeTruthy()
  })
})

describe('WakeConfigCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('avisa que sin API key el despertador no arranca', async () => {
    api.get.mockResolvedValue({ data: { configured: false, canEdit: true, model: 'grok-4', defaultModel: 'grok-4' } })
    render(<WakeConfigCard />)
    expect(await screen.findByText(/el despertador no va a poder arrancar/)).toBeTruthy()
  })

  it('guarda la API key y la vuelve a pedir desde el backend (no la deja en pantalla)', async () => {
    api.get.mockResolvedValue({ data: { configured: false, canEdit: true, model: 'grok-4', defaultModel: 'grok-4' } })
    api.put.mockResolvedValue({ data: { ok: true } })
    render(<WakeConfigCard />)

    const input = await screen.findByPlaceholderText(/API key de xAI/)
    fireEvent.change(input, { target: { value: 'xai-secreta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/mcp-tokens/wake-config', { apiKey: 'xai-secreta' }))
    await waitFor(() => expect(input.value).toBe(''))
  })

  // Sin permiso y sin nada configurado el bloque solo confundiría.
  it('no se muestra a quien no puede editarla si no hay nada configurado', async () => {
    api.get.mockResolvedValue({ data: { configured: false, canEdit: false, model: 'grok-4' } })
    const { container } = render(<WakeConfigCard />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })

  it('a quien no puede editarla pero ya está configurada, le dice el estado', async () => {
    api.get.mockResolvedValue({ data: { configured: true, canEdit: false, model: 'grok-4' } })
    render(<WakeConfigCard />)
    expect(await screen.findByText(/Configurada · modelo: grok-4/)).toBeTruthy()
    expect(screen.getByText(/La configura un admin/)).toBeTruthy()
  })
})
