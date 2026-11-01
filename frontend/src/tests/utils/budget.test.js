import { describe, it, expect } from 'vitest'
import { deriveBudget, budgetColor } from '../../utils/budget'

// La política de "qué consume el presupuesto del proyecto", en un solo lugar.
// Decisión de producto: el tiempo de los agentes de IA SÍ consume horas contratadas.
describe('deriveBudget', () => {
  const tracked = { hoursEnabled: true, monthlyHours: 10 } // 600 min de abono

  it('el tiempo de agente consume presupuesto: suma al total usado', () => {
    const b = deriveBudget({ ...tracked, totalMinutes: 300, agentMinutes: 120 })
    expect(b.personMinutes).toBe(300)
    expect(b.agentMinutes).toBe(120)
    expect(b.usedMinutes).toBe(420)
    expect(b.pctRaw).toBe(70)
    expect(b.status).toBe('onTrack')
  })

  it('un proyecto en verde por personas puede quedar sobre presupuesto con los agentes', () => {
    // 9h de persona (90%) + 2h de agente = 110% → el caso que cambia de un día para el otro.
    const soloPersonas = deriveBudget({ ...tracked, totalMinutes: 540 })
    expect(soloPersonas.status).toBe('near')
    const conAgentes = deriveBudget({ ...tracked, totalMinutes: 540, agentMinutes: 120 })
    expect(conAgentes.status).toBe('over')
    expect(Math.round(conAgentes.pctRaw)).toBe(110)
  })

  it('umbrales: 79% en curso, 80% cerca, 100% cerca, 101% excedido', () => {
    const at = used => deriveBudget({ ...tracked, totalMinutes: used }).status
    expect(at(474)).toBe('onTrack')  // 79%
    expect(at(480)).toBe('near')     // 80%
    expect(at(600)).toBe('near')     // 100% exacto: todavía no se pasó
    expect(at(606)).toBe('over')     // 101%
  })

  it('sin nada registrado es "sin actividad", no 0% en curso', () => {
    const b = deriveBudget({ ...tracked })
    expect(b.status).toBe('noActivity')
    expect(b.usedMinutes).toBe(0)
  })

  it('un proyecto donde SOLO trabajaron agentes consume presupuesto igual', () => {
    const b = deriveBudget({ ...tracked, totalMinutes: 0, agentMinutes: 660 })
    expect(b.status).toBe('over')
    expect(b.hasAgent).toBe(true)
  })

  it('con seguimiento pero sin abono definido → noBudget, sin porcentaje', () => {
    const b = deriveBudget({ hoursEnabled: true, monthlyHours: null, totalMinutes: 300 })
    expect(b.status).toBe('noBudget')
    expect(b.pctRaw).toBeNull()
    expect(b.remainingHours).toBeNull()
  })

  it('proyecto fuera del seguimiento de horas → untracked', () => {
    const b = deriveBudget({ hoursEnabled: false, monthlyHours: 10, totalMinutes: 9999 })
    expect(b.status).toBe('untracked')
    expect(b.useBudget).toBe(false)
  })

  it('months > 1 multiplica el abono (rangos de varios meses)', () => {
    const b = deriveBudget({ ...tracked, totalMinutes: 600, agentMinutes: 600, months: 3 })
    expect(b.budgetMins).toBe(1800)
    expect(Math.round(b.pctRaw)).toBe(67)
  })

  it('horas restantes descuentan también el tiempo de agente, y pueden ser negativas', () => {
    expect(deriveBudget({ ...tracked, totalMinutes: 300, agentMinutes: 120 }).remainingHours).toBe(3)
    expect(deriveBudget({ ...tracked, totalMinutes: 540, agentMinutes: 120 }).remainingHours).toBe(-1)
  })

  it('hasAgent es false sin tiempo de agente (la UI no mete ruido si no hay agentes)', () => {
    expect(deriveBudget({ ...tracked, totalMinutes: 300 }).hasAgent).toBe(false)
  })
})

describe('budgetColor', () => {
  it('sigue los mismos umbrales que el estado', () => {
    expect(budgetColor(null)).toContain('primary')
    expect(budgetColor(50)).toContain('primary')
    expect(budgetColor(85)).toContain('amber')
    expect(budgetColor(101)).toContain('red')
  })
})
