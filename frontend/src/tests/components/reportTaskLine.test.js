import { describe, it, expect } from 'vitest'
import { reportTaskLine } from '../../components/marketing/ReportViewerParts'

// Lo que ve el CLIENTE en "Trabajo realizado en el mes". La regla de producto es que no
// distingue persona de agente de IA: el tiempo del agente es tiempo trabajado.
describe('reportTaskLine', () => {
  const base = { user: { name: 'Gastón Suárez' }, startedAt: '2026-10-20T10:00:00Z', completedAt: '2026-10-20T10:45:00Z' }

  it('una tarea de agente va con el nombre de la persona responsable, no "Agente de X"', () => {
    const { who } = reportTaskLine({ ...base, isAgentTask: true, minutes: 45 })
    expect(who).toBe('Gastón Suárez')
  })

  it('una tarea de agente muestra su duración, igual que una humana', () => {
    expect(reportTaskLine({ ...base, isAgentTask: true, minutes: 45 }).duration).toBe('45m')
    expect(reportTaskLine({ ...base, isAgentTask: false, minutes: 45 }).duration).toBe('45m')
  })

  it('usa el `minutes` del backend por sobre el cálculo crudo', () => {
    // El backend lo resuelve con taskMins, que respeta minutesOverride y topea en 8h.
    // Formato del fmtMins compartido de toda la app (horas exactas incluyen los "0m").
    const { duration } = reportTaskLine({ ...base, minutes: 480, minutesOverride: 480 })
    expect(duration).toBe('8h 0m')
  })

  it('cae al cálculo propio si el informe viene de un dataCache viejo sin `minutes`', () => {
    const { duration } = reportTaskLine({ ...base })
    expect(duration).toBe('45m')
  })

  it('descuenta las pausas en el fallback', () => {
    const { duration } = reportTaskLine({ ...base, pausedMinutes: 15 })
    expect(duration).toBe('30m')
  })

  it('sin duración calculable no inventa un chip', () => {
    expect(reportTaskLine({ user: { name: 'X' }, completedAt: '2026-10-20T10:45:00Z' }).duration).toBeNull()
    expect(reportTaskLine({ ...base, minutes: 0 }).duration).toBeNull()
  })

  it('tolera una tarea sin responsable', () => {
    expect(reportTaskLine({ minutes: 10 }).who).toBeNull()
  })
})
