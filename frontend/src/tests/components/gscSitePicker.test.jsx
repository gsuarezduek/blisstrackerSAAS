import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GscSitePicker from '../../components/marketing/seo/GscSitePicker'

vi.mock('../../api/client', () => ({
  default: { get: vi.fn() },
}))

import api from '../../api/client'

// El 403 "User does not have sufficient permission for site" casi siempre es esto:
// la propiedad está en Search Console como Dominio (`sc-domain:x`) y se la pidió como
// prefijo de URL. El picker muestra el id exacto para elegirlo con un click.
describe('GscSitePicker', () => {
  beforeEach(() => {
    api.get.mockReset()
  })

  it('lista las propiedades con la cuenta conectada y marca la de Dominio', async () => {
    api.get.mockResolvedValue({
      data: {
        accountEmail: 'dueño@ejemplo.com',
        current: 'https://ejemplo.com/',
        sites: [
          { siteUrl: 'sc-domain:ejemplo.com', permissionLevel: 'siteOwner', isDomainProperty: true,  verified: true, matchesProject: true },
          { siteUrl: 'https://otro.com/',     permissionLevel: 'siteFullUser', isDomainProperty: false, verified: true, matchesProject: false },
        ],
      },
    })

    render(<GscSitePicker projectId={7} onPick={() => {}} />)

    expect(await screen.findByText('sc-domain:ejemplo.com')).toBeInTheDocument()
    expect(screen.getByText('dueño@ejemplo.com')).toBeInTheDocument()
    expect(screen.getByText('Dominio')).toBeInTheDocument()
    expect(screen.getByText('coincide con el sitio del proyecto')).toBeInTheDocument()
    expect(screen.getByText('Propietario')).toBeInTheDocument()
  })

  it('al elegir una propiedad devuelve el id exacto que espera la API', async () => {
    const onPick = vi.fn()
    api.get.mockResolvedValue({
      data: {
        accountEmail: 'dueño@ejemplo.com',
        current: 'https://ejemplo.com/',
        sites: [{ siteUrl: 'sc-domain:ejemplo.com', permissionLevel: 'siteOwner', isDomainProperty: true, verified: true, matchesProject: true }],
      },
    })

    render(<GscSitePicker projectId={7} onPick={onPick} />)
    fireEvent.click(await screen.findByText('sc-domain:ejemplo.com'))

    expect(onPick).toHaveBeenCalledWith('sc-domain:ejemplo.com')
  })

  it('marca "en uso" la propiedad que ya está configurada y no la deja re-elegir', async () => {
    const onPick = vi.fn()
    api.get.mockResolvedValue({
      data: {
        accountEmail: 'dueño@ejemplo.com',
        current: 'sc-domain:ejemplo.com',
        sites: [{ siteUrl: 'sc-domain:ejemplo.com', permissionLevel: 'siteOwner', isDomainProperty: true, verified: true, matchesProject: true }],
      },
    })

    render(<GscSitePicker projectId={7} onPick={onPick} />)
    const row = (await screen.findByText('sc-domain:ejemplo.com')).closest('button')

    expect(screen.getByText('en uso')).toBeInTheDocument()
    expect(row).toBeDisabled()
  })

  it('avisa cuando una propiedad está sin verificar (Google la lista pero no devuelve datos)', async () => {
    api.get.mockResolvedValue({
      data: {
        accountEmail: 'dueño@ejemplo.com',
        current: null,
        sites: [{ siteUrl: 'https://ejemplo.com/', permissionLevel: 'siteUnverifiedUser', isDomainProperty: false, verified: false, matchesProject: true }],
      },
    })

    render(<GscSitePicker projectId={7} onPick={() => {}} />)

    expect(await screen.findByText(/Verificación pendiente o perdida/)).toBeInTheDocument()
  })

  it('si la cuenta no tiene propiedades, apunta a reconectar con otra cuenta', async () => {
    api.get.mockResolvedValue({ data: { accountEmail: 'otra@ejemplo.com', current: null, sites: [] } })

    render(<GscSitePicker projectId={7} onPick={() => {}} />)

    expect(await screen.findByText(/no tiene ninguna propiedad en Search Console/)).toBeInTheDocument()
  })
})
