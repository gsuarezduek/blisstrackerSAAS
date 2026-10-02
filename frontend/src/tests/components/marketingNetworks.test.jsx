import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { connectionMode, engColor, ENG_THRESHOLDS, fmtK } from '../../components/marketing/networks/format'
import { BRANDS } from '../../components/marketing/networks/brands'
import ConnectScreen from '../../components/marketing/networks/ConnectScreen'
import AccountHeader from '../../components/marketing/networks/AccountHeader'

vi.mock('../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

describe('networks/format', () => {
  it('distingue scraping, token de Business Manager y login oficial', () => {
    expect(connectionMode({ scopes: 'scrape' })).toBe('scrape')
    expect(connectionMode({ scopes: 'fb_graph,pages_show_list' })).toBe('token')
    expect(connectionMode({ type: 'meta_ads', scopes: 'ads_read', expiresAt: null })).toBe('token')
    expect(connectionMode({ type: 'meta_ads', scopes: 'ads_read', expiresAt: '2026-12-01T00:00:00Z' })).toBe('official')
    expect(connectionMode({ type: 'tiktok', scopes: 'user.info.basic' })).toBe('official')
  })

  it('Instagram usa umbrales de engagement más bajos', () => {
    expect(engColor(4)).toContain('yellow')
    expect(engColor(4, ENG_THRESHOLDS.instagram)).toContain('green')
  })

  it('fmtK abrevia desde 10 mil y redondea', () => {
    expect(fmtK(9999.6)).toBe('10.000')
    expect(fmtK(12500)).toBe('12.5K')
    expect(fmtK(null)).toBe('—')
  })
})

describe('ConnectScreen', () => {
  const methods = [
    { key: 'a', icon: '🔗', title: 'Oficial', body: <p>cuerpo A</p> },
    { key: 'b', icon: '🔑', title: 'Token', badge: 'recommended', body: <p>cuerpo B</p> },
    { key: 'c', icon: '⏳', title: 'Login', badge: 'soon', body: <p>cuerpo C</p> },
  ]

  it('arranca abierto el método recomendado y nunca muestra el de "próximamente"', () => {
    render(<ConnectScreen brand={BRANDS.facebook} title="Conectá" methods={methods} />)
    expect(screen.getByText('cuerpo B')).toBeInTheDocument()
    expect(screen.queryByText('cuerpo A')).not.toBeInTheDocument()
    expect(screen.queryByText('cuerpo C')).not.toBeInTheDocument()
    expect(screen.getByText('Próximamente')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Oficial'))
    expect(screen.getByText('cuerpo A')).toBeInTheDocument()
    expect(screen.queryByText('cuerpo B')).not.toBeInTheDocument()
  })

  it('con un solo método lo muestra abierto, sin acordeón', () => {
    render(<ConnectScreen brand={BRANDS.tiktok} title="Conectá" methods={[methods[0]]} />)
    expect(screen.getByText('cuerpo A')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Oficial/ })).not.toBeInTheDocument()
  })
})

describe('AccountHeader', () => {
  it('muestra cómo está conectada la cuenta y las acciones', () => {
    const onRefresh = vi.fn()
    render(
      <AccountHeader brand={BRANDS.instagram} name="@pastiza"
        integration={{ scopes: 'scrape', connectedAt: '2026-09-01T12:00:00Z' }}
        actions={[{ key: 'r', label: '↻ Actualizar', onClick: onRefresh }]}
        onDisconnect={() => {}} />
    )
    expect(screen.getByText('@pastiza')).toBeInTheDocument()
    expect(screen.getByText('Scraping · datos públicos')).toBeInTheDocument()
    fireEvent.click(screen.getByText('↻ Actualizar'))
    expect(onRefresh).toHaveBeenCalled()
    expect(screen.getByText('Desconectar')).toBeInTheDocument()
  })
})
