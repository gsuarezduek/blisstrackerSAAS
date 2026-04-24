/**
 * Tests para los helpers de fecha de WebTab.jsx
 *
 * Las funciones están definidas en el componente, así que las reproducimos
 * aquí con la misma implementación para testearlas aisladamente.
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'

// ─── Implementaciones (copiadas exactas de WebTab.jsx) ────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function getDateParams(range, customStart, customEnd) {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  if (range === 'thisMonth') {
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
    return { startDate: start, endDate: todayStr() }
  }
  if (range === 'lastMonth') {
    const lm     = month === 0 ? 11 : month - 1
    const lmYear = month === 0 ? year - 1 : year
    const lastDay = new Date(lmYear, lm + 1, 0).getDate()
    const pad = n => String(n).padStart(2, '0')
    return {
      startDate: `${lmYear}-${pad(lm + 1)}-01`,
      endDate:   `${lmYear}-${pad(lm + 1)}-${pad(lastDay)}`,
    }
  }
  if (range === '90daysAgo') {
    return { startDate: '90daysAgo', endDate: 'today' }
  }
  // custom
  return { startDate: customStart || todayStr(), endDate: customEnd || todayStr() }
}

function formatDateLabel(range, customStart, customEnd) {
  const { startDate, endDate } = getDateParams(range, customStart, customEnd)
  if (range === 'thisMonth')  return 'Este mes'
  if (range === 'lastMonth')  return 'Mes anterior'
  if (range === '90daysAgo')  return 'Últimos 90 días'
  const fmt = d => {
    if (!d || d === 'today' || d === 'yesterday') return d
    const [y, m, dd] = d.split('-')
    return `${dd}/${m}/${y}`
  }
  return `${fmt(startDate)} → ${fmt(endDate)}`
}

// ─── Tests: getDateParams ─────────────────────────────────────────────────────

describe('getDateParams — thisMonth', () => {
  // Fijamos la fecha al 2026-04-23 para tener resultados deterministas
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-23T12:00:00Z'))
  })
  afterAll(() => vi.useRealTimers())

  test('startDate es el primer día del mes actual', () => {
    const { startDate } = getDateParams('thisMonth')
    expect(startDate).toBe('2026-04-01')
  })

  test('endDate es hoy', () => {
    const { endDate } = getDateParams('thisMonth')
    expect(endDate).toBe('2026-04-23')
  })
})

describe('getDateParams — lastMonth', () => {
  describe('mes normal (abril → marzo)', () => {
    beforeAll(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-15T12:00:00Z'))
    })
    afterAll(() => vi.useRealTimers())

    test('startDate es el primer día del mes anterior', () => {
      expect(getDateParams('lastMonth').startDate).toBe('2026-03-01')
    })

    test('endDate es el último día del mes anterior', () => {
      expect(getDateParams('lastMonth').endDate).toBe('2026-03-31')
    })
  })

  describe('enero → diciembre del año anterior', () => {
    beforeAll(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-10T12:00:00Z'))
    })
    afterAll(() => vi.useRealTimers())

    test('startDate es el 01/12 del año anterior', () => {
      expect(getDateParams('lastMonth').startDate).toBe('2025-12-01')
    })

    test('endDate es el 31/12 del año anterior', () => {
      expect(getDateParams('lastMonth').endDate).toBe('2025-12-31')
    })
  })

  describe('febrero de año bisiesto como mes anterior', () => {
    beforeAll(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-03-05T12:00:00Z'))
    })
    afterAll(() => vi.useRealTimers())

    test('endDate es 29/02/2024 (año bisiesto)', () => {
      expect(getDateParams('lastMonth').endDate).toBe('2024-02-29')
    })
  })
})

describe('getDateParams — 90daysAgo', () => {
  test('usa los valores especiales de GA4', () => {
    const { startDate, endDate } = getDateParams('90daysAgo')
    expect(startDate).toBe('90daysAgo')
    expect(endDate).toBe('today')
  })
})

describe('getDateParams — custom', () => {
  test('devuelve las fechas pasadas por parámetro', () => {
    const { startDate, endDate } = getDateParams('custom', '2026-01-01', '2026-01-31')
    expect(startDate).toBe('2026-01-01')
    expect(endDate).toBe('2026-01-31')
  })

  test('usa todayStr() como fallback si no se pasan fechas', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-23T12:00:00Z'))
    const { startDate, endDate } = getDateParams('custom', '', '')
    expect(startDate).toBe('2026-04-23')
    expect(endDate).toBe('2026-04-23')
    vi.useRealTimers()
  })
})

// ─── Tests: formatDateLabel ───────────────────────────────────────────────────

describe('formatDateLabel', () => {
  test('thisMonth → "Este mes"', () => {
    expect(formatDateLabel('thisMonth')).toBe('Este mes')
  })

  test('lastMonth → "Mes anterior"', () => {
    expect(formatDateLabel('lastMonth')).toBe('Mes anterior')
  })

  test('90daysAgo → "Últimos 90 días"', () => {
    expect(formatDateLabel('90daysAgo')).toBe('Últimos 90 días')
  })

  test('custom muestra el rango con formato DD/MM/YYYY → DD/MM/YYYY', () => {
    const label = formatDateLabel('custom', '2026-01-01', '2026-01-31')
    expect(label).toBe('01/01/2026 → 31/01/2026')
  })
})
