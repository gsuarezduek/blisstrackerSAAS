import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  ReportHistoryContext, SectionHistory,
  formatHistoryValue, historyDelta, isBestMonth, historyMonthLabel,
} from '../../components/marketing/ReportHistory'

const count   = { format: 'number',  invert: false }
const percent = { format: 'percent', invert: false }
const pos     = { format: 'decimal', invert: true }

describe('formatHistoryValue', () => {
  it('compacta números grandes y respeta el formato', () => {
    expect(formatHistoryValue(950, 'number')).toBe('950')
    expect(formatHistoryValue(12500, 'number')).toBe('12,5k')
    expect(formatHistoryValue(2_300_000, 'number')).toBe('2,3M')
    expect(formatHistoryValue(15000, 'money')).toBe('$15k')
    expect(formatHistoryValue(3.456, 'percent')).toBe('3,46%')
    expect(formatHistoryValue(null, 'number')).toBe('—')
  })
})

describe('historyDelta', () => {
  it('volúmenes: % contra el mes anterior', () => {
    expect(historyDelta(120, 100, count)).toEqual({ dir: 1, good: true, text: '↑20%' })
    expect(historyDelta(80, 100, count)).toEqual({ dir: -1, good: false, text: '↓20%' })
  })

  it('tasas: diferencia en puntos, no % de un %', () => {
    expect(historyDelta(3.5, 3, percent).text).toBe('↑0,5 pts')
  })

  it('posición: bajar es bueno', () => {
    expect(historyDelta(8, 10, pos)).toMatchObject({ dir: -1, good: true })
  })

  it('mes anterior ≤ 0 (seguidores nuevos negativos): diferencia absoluta', () => {
    expect(historyDelta(50, -20, count).text).toBe('↑70')
  })

  it('sin dato en alguno de los dos meses no hay flecha', () => {
    expect(historyDelta(null, 10, count)).toBeNull()
    expect(historyDelta(10, null, count)).toBeNull()
  })
})

describe('isBestMonth', () => {
  it('requiere al menos 3 meses con dato y un máximo único', () => {
    expect(isBestMonth([1, 5, 3], 1)).toBe(true)
    expect(isBestMonth([1, 5], 1)).toBe(false)
    expect(isBestMonth([5, 5, 3], 1)).toBe(false)
    expect(isBestMonth([10, 8, null, 6], 3, true)).toBe(true)
  })
})

describe('historyMonthLabel', () => {
  it('abrevia en español', () => {
    expect(historyMonthLabel('2026-09')).toBe('sep')
    expect(historyMonthLabel('2026-01', true)).toBe('ene 26')
  })
})

const history = {
  months: ['2026-07', '2026-08', '2026-09'],
  highlight: ['2026-09'],
  partialMonth: null,
  sections: {
    instagram: {
      metrics: [
        { key: 'newFollowers', label: 'Seguidores nuevos', format: 'number', chart: 'bar', invert: false, values: [100, 150, 300] },
        { key: 'engagementRate', label: 'Engagement', format: 'percent', chart: 'line', invert: false, values: [2, 2.5, 3] },
      ],
    },
  },
}

function renderWith(value, key = 'instagram') {
  return render(
    <ReportHistoryContext.Provider value={{ brandPrimary: '#f97316', printMode: false, ...value }}>
      <SectionHistory sectionKey={key} />
    </ReportHistoryContext.Provider>,
  )
}

describe('SectionHistory', () => {
  it('muestra la primera métrica por defecto, con flechas por mes y el sello de mejor mes', () => {
    renderWith({ history })
    expect(screen.getByText('Últimos 3 meses')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Seguidores nuevos' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('↑50%')).toBeTruthy()
    expect(screen.getByText('↑100%')).toBeTruthy()
    expect(screen.getByText('Mejor mes del período')).toBeTruthy()
  })

  it('cambia de métrica con los chips', () => {
    renderWith({ history })
    fireEvent.click(screen.getByRole('button', { name: 'Engagement' }))
    expect(screen.getAllByText('↑0,5 pts')).toHaveLength(2)
  })

  it('se puede plegar', () => {
    renderWith({ history })
    fireEvent.click(screen.getByText('Últimos 3 meses'))
    expect(screen.queryByRole('button', { name: 'Engagement' })).toBeNull()
  })

  it('en el PDF va abierto, sin chips, con la métrica en el título', () => {
    renderWith({ history, printMode: true })
    expect(screen.getByText('Últimos 3 meses · Seguidores nuevos')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Engagement' })).toBeNull()
  })

  it('avisa cuando el último mes es parcial', () => {
    renderWith({ history: { ...history, partialMonth: '2026-09' } })
    expect(screen.getByText('* Mes en curso: datos parciales.')).toBeTruthy()
  })

  it('no renderiza nada si la sección no tiene historial', () => {
    const { container } = renderWith({ history }, 'tiktok')
    expect(container.innerHTML).toBe('')
    const { container: c2 } = renderWith({ history: null })
    expect(c2.innerHTML).toBe('')
  })
})
