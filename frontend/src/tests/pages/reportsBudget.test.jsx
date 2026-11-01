import { describe, it, expect } from 'vitest'
import { deriveBudget } from '../../utils/budget'

// Documenta el CAMBIO DE COMPORTAMIENTO de la Fase 2: el tiempo de los agentes de IA
// consume las horas contratadas. Un proyecto que estaba en verde puede pasar a "Sobre
// presupuesto" sin que ninguna persona haya trabajado una hora más — es esperado, y es
// el motivo por el que el desglose se muestra siempre al lado del total.
describe('Reportes — el presupuesto incluye el tiempo de los agentes', () => {
  const project = { hoursEnabled: true, monthlyHours: 10 }

  it('9h de persona + 2h de agente sobre un abono de 10h → sobre presupuesto', () => {
    const antes   = deriveBudget({ ...project, totalMinutes: 540 })
    const despues = deriveBudget({ ...project, totalMinutes: 540, agentMinutes: 120 })

    expect(antes.status).toBe('near')          // 90%, como se veía antes del cambio
    expect(despues.status).toBe('over')        // 110%, el criterio nuevo
    expect(despues.usedMinutes).toBe(660)
    // Y el desglose queda disponible para explicar el salto en la UI:
    expect(despues.personMinutes).toBe(540)
    expect(despues.agentMinutes).toBe(120)
  })

  it('el total del encabezado de Reportes suma las horas usadas de cada proyecto', () => {
    const rows = [
      { project, totalMinutes: 300, agentMinutes: 60 },
      { project, totalMinutes: 120, agentMinutes: 0 },
    ].map(d => deriveBudget({ ...project, ...d }))
    expect(rows.reduce((s, d) => s + d.usedMinutes, 0)).toBe(480)
    expect(rows.reduce((s, d) => s + d.personMinutes, 0)).toBe(420)
    expect(rows.reduce((s, d) => s + d.agentMinutes, 0)).toBe(60)
  })

  it('un proyecto sin agentes se comporta exactamente igual que antes', () => {
    for (const mins of [0, 300, 480, 540, 600, 700]) {
      const b = deriveBudget({ ...project, totalMinutes: mins })
      expect(b.usedMinutes).toBe(mins)
      expect(b.hasAgent).toBe(false)
    }
  })
})
