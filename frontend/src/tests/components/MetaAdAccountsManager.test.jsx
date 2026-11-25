import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MetaAdAccountsManager from '../../components/marketing/networks/MetaAdAccountsManager'

vi.mock('../../api/client', () => ({
  default: { get: vi.fn(), put: vi.fn() },
}))

import api from '../../api/client'

const accounts = [
  { id: 'act_1', name: 'Sucursal Centro', currency: 'ARS', accountStatus: 1, selected: true,  available: true },
  { id: 'act_2', name: 'Sucursal Norte',  currency: 'ARS', accountStatus: 1, selected: false, available: true },
  { id: 'act_3', name: 'Cuenta en dólares', currency: 'USD', accountStatus: 1, selected: false, available: true },
]

describe('MetaAdAccountsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { accounts, max: 10 } })
    api.put.mockResolvedValue({ data: { ok: true } })
  })

  it('suma una segunda cuenta y guarda las dos, la ya conectada primero', async () => {
    const onSaved = vi.fn()
    render(<MetaAdAccountsManager projectId={5} onSaved={onSaved} onClose={() => {}} />)
    fireEvent.click(await screen.findByLabelText(/Sucursal Norte/))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(api.put).toHaveBeenCalledWith('/marketing/projects/5/integrations/meta-ads/accounts', { accountIds: ['act_1', 'act_2'] })
  })

  it('no deja guardar cuentas con monedas distintas', async () => {
    render(<MetaAdAccountsManager projectId={5} onSaved={() => {}} onClose={() => {}} />)
    fireEvent.click(await screen.findByLabelText(/Cuenta en dólares/))
    expect(screen.getByText(/monedas distintas/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('muestra el error del backend al guardar', async () => {
    api.put.mockRejectedValue({ response: { data: { error: 'La cuenta act_2 no está disponible con la conexión actual' } } })
    render(<MetaAdAccountsManager projectId={5} onSaved={() => {}} onClose={() => {}} />)
    fireEvent.click(await screen.findByLabelText(/Sucursal Norte/))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/no está disponible/)).toBeInTheDocument()
  })
})
