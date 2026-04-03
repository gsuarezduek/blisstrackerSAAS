import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fmtMins, activeMinutes, completedDuration } from '../../utils/format'

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
