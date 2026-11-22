import { describe, it, expect } from 'vitest'
import { AGENT_COLORS, agentColorName, agentChipClass, agentTextClass } from '../../utils/agentColor'

// El color es lo que deja distinguir un agente de OTRO agente de un vistazo. Lo que más
// importa acá es que funcione SIN que nadie lo haya elegido: los agentes que ya existían
// cuando esto se agregó tienen `color: null` y no hubo backfill.
describe('agentColor', () => {
  it('deriva un color del nombre cuando no hay uno elegido', () => {
    const c = agentColorName({ id: 1, label: 'Grok SEO', color: null })
    expect(AGENT_COLORS).toContain(c)
  })

  it('el color derivado es estable: el mismo agente siempre sale igual', () => {
    const a = { id: 1, label: 'Grok SEO', color: null }
    expect(agentColorName(a)).toBe(agentColorName({ ...a }))
  })

  it('dos agentes con nombres distintos no colisionan siempre', () => {
    // No se puede garantizar que dos cualesquiera difieran (la paleta tiene 8), pero un
    // conjunto realista tiene que usar más de un color — si no, el color no sirve.
    const nombres = ['Grok SEO', 'Grok Ventas', 'Claude Redactor', 'Bot de soporte', 'Analista']
    const colores = new Set(nombres.map(l => agentColorName({ id: 1, label: l, color: null })))
    expect(colores.size).toBeGreaterThan(1)
  })

  it('el color elegido gana sobre el derivado', () => {
    expect(agentColorName({ id: 1, label: 'Grok SEO', color: 'rose' })).toBe('rose')
  })

  it('ignora un color que no está en la paleta en vez de romper', () => {
    // El backend lo valida, pero un dato viejo o tocado a mano no puede dejar la UI sin
    // clases (devolvería `undefined` y el chip quedaría transparente).
    const c = agentColorName({ id: 1, label: 'Grok SEO', color: '#ff0000' })
    expect(AGENT_COLORS).toContain(c)
  })

  it('un agente sin nombre igual tiene color (cae al id)', () => {
    expect(AGENT_COLORS).toContain(agentColorName({ id: 42, label: null, color: null }))
  })

  it('siempre devuelve clases reales, nunca undefined', () => {
    for (const c of [...AGENT_COLORS, null, 'inventado']) {
      const agent = { id: 1, label: 'X', color: c }
      expect(agentChipClass(agent)).toMatch(/bg-/)
      expect(agentTextClass(agent)).toMatch(/text-/)
    }
  })

  it('las clases son literales completos, no interpolados', () => {
    // El JIT de Tailwind escanea el fuente: una clase armada en runtime (`bg-${c}-100`)
    // no se genera y el chip sale sin fondo.
    for (const c of AGENT_COLORS) {
      expect(agentChipClass({ id: 1, label: 'X', color: c })).toContain(`bg-${c}-100`)
    }
  })
})
