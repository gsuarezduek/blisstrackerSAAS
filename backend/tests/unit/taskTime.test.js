const { taskWorkedMinutes } = require('../../src/lib/taskTime')

const NOW = new Date('2024-01-15T10:00:00Z').getTime()

describe('taskWorkedMinutes', () => {
  it('suma intervalos de sesiones cerradas', () => {
    const task = {
      status: 'COMPLETED',
      sessions: [
        { startedAt: '2024-01-15T09:00:00Z', endedAt: '2024-01-15T09:20:00Z' }, // 20
        { startedAt: '2024-01-15T09:30:00Z', endedAt: '2024-01-15T09:45:00Z' }, // 15
      ],
    }
    expect(taskWorkedMinutes(task, NOW)).toBe(35)
  })

  it('cuenta la sesión abierta hasta now solo si IN_PROGRESS', () => {
    const task = {
      status: 'IN_PROGRESS',
      sessions: [
        { startedAt: '2024-01-15T09:00:00Z', endedAt: '2024-01-15T09:20:00Z' }, // 20
        { startedAt: '2024-01-15T09:50:00Z', endedAt: null },                   // 10 hasta now
      ],
    }
    expect(taskWorkedMinutes(task, NOW)).toBe(30)
  })

  it('ignora sesión abierta huérfana en tarea no activa', () => {
    const task = {
      status: 'PAUSED',
      sessions: [
        { startedAt: '2024-01-15T09:00:00Z', endedAt: '2024-01-15T09:25:00Z' }, // 25
        { startedAt: '2024-01-15T09:50:00Z', endedAt: null },                   // ignorada
      ],
    }
    expect(taskWorkedMinutes(task, NOW)).toBe(25)
  })

  it('ignora startedAt inflado cuando hay sesiones', () => {
    const task = {
      status: 'IN_PROGRESS',
      startedAt: '2024-01-14T10:00:00Z', // 24h atrás
      pausedMinutes: 0,
      sessions: [{ startedAt: '2024-01-15T09:30:00Z', endedAt: null }], // 30 min reales
    }
    expect(taskWorkedMinutes(task, NOW)).toBe(30)
  })

  it('fallback legacy sin sesiones: completada usa completedAt - startedAt - pausedMinutes', () => {
    const task = {
      status: 'COMPLETED',
      startedAt: '2024-01-15T09:00:00Z',
      completedAt: '2024-01-15T09:50:00Z',
      pausedMinutes: 10,
    }
    expect(taskWorkedMinutes(task, NOW)).toBe(40)
  })

  it('fallback legacy sin sesiones: en curso usa now - startedAt - pausedMinutes', () => {
    const task = {
      status: 'IN_PROGRESS',
      startedAt: '2024-01-15T09:00:00Z',
      pausedMinutes: 15,
    }
    expect(taskWorkedMinutes(task, NOW)).toBe(45)
  })

  it('devuelve 0 sin sesiones ni startedAt', () => {
    expect(taskWorkedMinutes({ status: 'PENDING' }, NOW)).toBe(0)
  })
})
