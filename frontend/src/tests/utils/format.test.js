import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fmtMins, activeMinutes, activeSeconds, fmtDuration, completedDuration } from '../../utils/format'

// ── fmtMins ───────────────────────────────────────────────────────────────────

describe('fmtMins', () => {
  it('devuelve "0m" para 0', () => expect(fmtMins(0)).toBe('0m'))
  it('devuelve "0m" para undefined/null', () => {
    expect(fmtMins(null)).toBe('0m')
    expect(fmtMins(undefined)).toBe('0m')
  })
  it('devuelve "1m" para 1', () => expect(fmtMins(1)).toBe('1m'))
  it('devuelve "59m" para 59', () => expect(fmtMins(59)).toBe('59m'))
  it('devuelve "1h 0m" para 60', () => expect(fmtMins(60)).toBe('1h 0m'))
  it('devuelve "1h 30m" para 90', () => expect(fmtMins(90)).toBe('1h 30m'))
  it('devuelve "2h 0m" para 120', () => expect(fmtMins(120)).toBe('2h 0m'))
  it('devuelve "8h 15m" para 495', () => expect(fmtMins(495)).toBe('8h 15m'))
})

// ── activeMinutes ─────────────────────────────────────────────────────────────

describe('activeMinutes', () => {
  const FAKE_NOW = new Date('2024-01-15T10:00:00Z').getTime()

  beforeEach(() => vi.useFakeTimers({ now: FAKE_NOW }))
  afterEach(() => vi.useRealTimers())

  it('devuelve 0 si la tarea no tiene startedAt', () => {
    expect(activeMinutes({ startedAt: null })).toBe(0)
  })

  it('calcula minutos desde startedAt hasta ahora para tarea IN_PROGRESS', () => {
    const task = {
      status: 'IN_PROGRESS',
      startedAt: new Date('2024-01-15T09:30:00Z').toISOString(), // 30 min atrás
      pausedMinutes: 0,
    }
    expect(activeMinutes(task)).toBe(30)
  })

  it('descuenta pausedMinutes del total', () => {
    const task = {
      status: 'IN_PROGRESS',
      startedAt: new Date('2024-01-15T09:00:00Z').toISOString(), // 60 min atrás
      pausedMinutes: 15,
    }
    expect(activeMinutes(task)).toBe(45)
  })

  it('usa pausedAt como tope para tarea PAUSED (no sigue contando)', () => {
    const task = {
      status: 'PAUSED',
      startedAt: new Date('2024-01-15T09:00:00Z').toISOString(), // 60 min antes del inicio
      pausedAt:  new Date('2024-01-15T09:30:00Z').toISOString(), // pausada a los 30 min
      pausedMinutes: 0,
    }
    expect(activeMinutes(task)).toBe(30)
  })

  it('nunca devuelve negativo', () => {
    const task = {
      status: 'IN_PROGRESS',
      startedAt: new Date('2024-01-15T09:55:00Z').toISOString(),
      pausedMinutes: 100, // más que el tiempo transcurrido
    }
    expect(activeMinutes(task)).toBeGreaterThanOrEqual(0)
  })

  // ── cálculo por sesiones (fuente de verdad) ─────────────────────────────────

  it('cuando hay sessions las usa e ignora startedAt inflado/pausedMinutes', () => {
    // startedAt de hace 24h (drift), pero las sesiones reales suman solo 30 min
    const task = {
      status: 'IN_PROGRESS',
      startedAt: new Date('2024-01-14T10:00:00Z').toISOString(),
      pausedMinutes: 0,
      sessions: [
        { startedAt: '2024-01-15T09:00:00Z', endedAt: '2024-01-15T09:20:00Z' }, // 20 min
        { startedAt: '2024-01-15T09:50:00Z', endedAt: null },                   // sesión abierta: 10 min hasta now
      ],
    }
    expect(activeMinutes(task)).toBe(30)
  })

  it('no cuenta la sesión abierta si la tarea no está IN_PROGRESS', () => {
    const task = {
      status: 'PAUSED',
      sessions: [
        { startedAt: '2024-01-15T09:00:00Z', endedAt: '2024-01-15T09:25:00Z' }, // 25 min
        { startedAt: '2024-01-15T09:50:00Z', endedAt: null },                   // huérfana: ignorada
      ],
    }
    expect(activeMinutes(task)).toBe(25)
  })

  it('topea tareas IN_PROGRESS con sesión abierta muy larga a 12h', () => {
    const task = {
      status: 'IN_PROGRESS',
      sessions: [{ startedAt: '2024-01-14T00:00:00Z', endedAt: null }], // >24h abierta
    }
    expect(activeMinutes(task)).toBe(12 * 60)
  })
})

describe('fmtDuration', () => {
  it('formatea horas, minutos y segundos', () => {
    expect(fmtDuration(45)).toBe('45s')
    expect(fmtDuration(90)).toBe('1m 30s')
    expect(fmtDuration(3700)).toBe('1h 1m')
  })
})

// ── completedDuration ─────────────────────────────────────────────────────────

describe('completedDuration', () => {
  it('devuelve null si no tiene startedAt', () => {
    expect(completedDuration({ startedAt: null, completedAt: '2024-01-15T10:00:00Z' })).toBeNull()
  })

  it('devuelve null si no tiene completedAt', () => {
    expect(completedDuration({ startedAt: '2024-01-15T09:00:00Z', completedAt: null })).toBeNull()
  })

  it('calcula duración simple de 30 minutos', () => {
    const task = {
      startedAt:   '2024-01-15T09:00:00Z',
      completedAt: '2024-01-15T09:30:00Z',
      pausedMinutes: 0,
    }
    expect(completedDuration(task)).toBe('30m')
  })

  it('descuenta pausedMinutes de la duración total', () => {
    const task = {
      startedAt:   '2024-01-15T09:00:00Z',
      completedAt: '2024-01-15T10:00:00Z', // 60 min total
      pausedMinutes: 15,
    }
    expect(completedDuration(task)).toBe('45m')
  })

  it('devuelve formato horas para tareas largas', () => {
    const task = {
      startedAt:   '2024-01-15T08:00:00Z',
      completedAt: '2024-01-15T10:30:00Z', // 150 min = 2h 30m
      pausedMinutes: 0,
    }
    expect(completedDuration(task)).toBe('2h 30m')
  })
})
