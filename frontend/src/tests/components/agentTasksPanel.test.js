import { describe, it, expect } from 'vitest'
import { groupAgentTasks } from '../../components/dashboard/AgentTasksPanel'

describe('groupAgentTasks', () => {
  const today = '2026-10-20'

  it('separa por lo que necesita la persona: bloqueadas, en curso, en lista, programadas y completadas', () => {
    const g = groupAgentTasks([
      { id: 1, status: 'BLOCKED' },
      { id: 2, status: 'IN_PROGRESS' },
      { id: 3, status: 'PENDING', scheduledFor: null },
      { id: 4, status: 'PAUSED' },
      { id: 5, status: 'PENDING', scheduledFor: '2026-10-25' },
      { id: 6, status: 'PENDING', scheduledFor: '2026-10-20' }, // vence hoy: ya está en su lista
      { id: 7, status: 'COMPLETED', completedAt: '2026-10-20T12:00:00Z' },
    ], today)
    expect(g.blocked.map(t => t.id)).toEqual([1])
    expect(g.running.map(t => t.id)).toEqual([2])
    expect(g.pending.map(t => t.id)).toEqual([3, 4, 6])
    expect(g.scheduled.map(t => t.id)).toEqual([5])
    expect(g.done.map(t => t.id)).toEqual([7])
  })

  it('ordena programadas por fecha y completadas de la más reciente a la más vieja', () => {
    const g = groupAgentTasks([
      { id: 1, status: 'PENDING', scheduledFor: '2026-11-02' },
      { id: 2, status: 'PENDING', scheduledFor: '2026-10-22' },
      { id: 3, status: 'COMPLETED', completedAt: '2026-10-20T09:00:00Z' },
      { id: 4, status: 'COMPLETED', completedAt: '2026-10-20T15:00:00Z' },
    ], today)
    expect(g.scheduled.map(t => t.id)).toEqual([2, 1])
    expect(g.done.map(t => t.id)).toEqual([4, 3])
  })
})
