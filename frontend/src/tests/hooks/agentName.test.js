import { describe, it, expect, vi } from 'vitest'

vi.mock('../../api/client', () => ({ default: { get: vi.fn() } }))
const { agentName } = await import('../../hooks/useMyAgents')

describe('agentName', () => {
  it('suma el nombre que declaró el agente al del token', () => {
    expect(agentName({ id: 7, label: 'grokbot' }, 'Ventas')).toBe('grokbot · Ventas')
  })
  it('sin nombre declarado queda el del token (o "Agente #id")', () => {
    expect(agentName({ id: 7, label: 'grokbot' })).toBe('grokbot')
    expect(agentName({ id: 9, label: null }, '  ')).toBe('Agente #9')
  })
  it('sin token: el nombre declarado o "tu agente"', () => {
    expect(agentName(null, 'SEO')).toBe('SEO')
    expect(agentName(null)).toBe('tu agente')
  })
})
