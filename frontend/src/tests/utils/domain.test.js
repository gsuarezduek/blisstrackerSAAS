import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isWorkspaceSubdomain } from '../../utils/domain'

// domain.js lee import.meta.env.VITE_APP_DOMAIN — lo mockeamos antes de cada test
beforeEach(() => {
  vi.stubEnv('VITE_APP_DOMAIN', 'blisstracker.app')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isWorkspaceSubdomain', () => {
  // ── Dominio raíz — DEBE devolver false (muestra Landing) ──────────────────
  it('dominio raíz → false', () => {
    expect(isWorkspaceSubdomain('blisstracker.app')).toBe(false)
  })

  it('dominio raíz con www → false (reservado)', () => {
    expect(isWorkspaceSubdomain('www.blisstracker.app')).toBe(false)
  })

  it('localhost → false', () => {
    expect(isWorkspaceSubdomain('localhost')).toBe(false)
  })

  it('workspace en localhost → true', () => {
    expect(isWorkspaceSubdomain('bliss.localhost')).toBe(true)
  })

  it('slug reservado en localhost → false', () => {
    expect(isWorkspaceSubdomain('www.localhost')).toBe(false)
  })

  it('127.0.0.1 → false', () => {
    expect(isWorkspaceSubdomain('127.0.0.1')).toBe(false)
  })

  // ── Slugs reservados — DEBEN devolver false ───────────────────────────────
  it.each(['www', 'app', 'api', 'mail', 'static', 'cdn'])(
    'subdominio reservado "%s" → false',
    slug => {
      expect(isWorkspaceSubdomain(`${slug}.blisstracker.app`)).toBe(false)
    }
  )

  // ── Subdominios de workspace reales — DEBEN devolver true ─────────────────
  it('workspace normal → true', () => {
    expect(isWorkspaceSubdomain('bliss.blisstracker.app')).toBe(true)
  })

  it('workspace con guión → true', () => {
    expect(isWorkspaceSubdomain('mi-agencia.blisstracker.app')).toBe(true)
  })

  it('workspace con números → true', () => {
    expect(isWorkspaceSubdomain('agencia123.blisstracker.app')).toBe(true)
  })

  // ── Dominio distinto — siempre false ─────────────────────────────────────
  it('dominio completamente distinto → false', () => {
    expect(isWorkspaceSubdomain('bliss.otrositio.com')).toBe(false)
  })

  it('subdominio anidado → false', () => {
    expect(isWorkspaceSubdomain('a.b.blisstracker.app')).toBe(false)
  })
})

describe('dirección de prueba (<slug>--preview)', () => {
  it('se reconoce como el workspace real, sin el sufijo', async () => {
    const { workspaceSlugFromHostname, isPreviewHost } = await import('../../utils/domain')
    expect(workspaceSlugFromHostname('bliss--preview.blisstracker.app')).toBe('bliss')
    expect(isPreviewHost('bliss--preview.blisstracker.app')).toBe(true)
  })

  it('también en local', async () => {
    const { workspaceSlugFromHostname, isPreviewHost } = await import('../../utils/domain')
    expect(workspaceSlugFromHostname('bliss--preview.localhost')).toBe('bliss')
    expect(isPreviewHost('bliss--preview.localhost')).toBe(true)
  })

  it('el subdominio de siempre no es de prueba', async () => {
    const { workspaceSlugFromHostname, isPreviewHost } = await import('../../utils/domain')
    expect(workspaceSlugFromHostname('mi-agencia.blisstracker.app')).toBe('mi-agencia')
    expect(isPreviewHost('mi-agencia.blisstracker.app')).toBe(false)
  })

  it('el sufijo solo, o sobre un slug reservado, no es un workspace', async () => {
    const { isWorkspaceSubdomain, isPreviewHost } = await import('../../utils/domain')
    expect(isWorkspaceSubdomain('--preview.blisstracker.app')).toBe(false)
    expect(isWorkspaceSubdomain('www--preview.blisstracker.app')).toBe(false)
    expect(isPreviewHost('www--preview.blisstracker.app')).toBe(false)
  })
})
