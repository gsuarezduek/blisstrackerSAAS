import { describe, it, expect } from 'vitest'
import { groupAgentTasks, pendingNewsLabel } from '../../components/dashboard/AgentTasksPanel'

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

describe('pendingNewsLabel', () => {
  const at = '2026-10-20T15:00:00Z'

  it('sin novedad sin ver no dice nada', () => {
    expect(pendingNewsLabel({ status: 'PAUSED', agentUpdateAt: null })).toBeNull()
  })

  it('distingue el desbloqueo del comentario', () => {
    expect(pendingNewsLabel({ status: 'PAUSED', agentUpdateAt: at, agentUpdateKind: 'unblocked' }))
      .toMatch(/Desbloqueada/)
    expect(pendingNewsLabel({ status: 'PAUSED', agentUpdateAt: at, agentUpdateKind: 'comment' }))
      .toMatch(/comentario/)
  })

  // Si el agente ya la retomó, lo que le dejaste dejó de estar pendiente de entrega.
  it('una tarea que el agente ya retomó no muestra el aviso', () => {
    expect(pendingNewsLabel({ status: 'IN_PROGRESS', agentUpdateAt: at, agentUpdateKind: 'unblocked' })).toBeNull()
  })

  // La excepción: 'completed' llega siempre con la tarea en COMPLETED, así que la regla
  // de estado la escondería justo cuando el cartel es lo único que avisa que el cierre
  // todavía no le llegó.
  it('el cierre propio se muestra aunque la tarea esté COMPLETED', () => {
    expect(pendingNewsLabel({ status: 'COMPLETED', agentUpdateAt: at, agentUpdateKind: 'completed' }))
      .toMatch(/La cerraste vos/)
  })

  it('una completada sin novedad pendiente no dice nada', () => {
    expect(pendingNewsLabel({ status: 'COMPLETED', agentUpdateAt: null, agentUpdateKind: 'completed' })).toBeNull()
  })
})
