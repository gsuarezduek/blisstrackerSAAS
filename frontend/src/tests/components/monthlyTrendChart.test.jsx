import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import MonthlyTrendChart, { pctChange, monthShort, monthLong } from '../../components/marketing/web/MonthlyTrendChart'
import { queryPeriodLabel, formatDimensionValue, formatMetricValue } from '../../components/marketing/web/ga4QueryCatalog'

const serie = (over = []) => [
  { month: '2026-09', sessions: 1000, activeUsers: 800, pageviews: 2000, keyEvents: 10, partial: false },
  { month: '2026-10', sessions: 1500, activeUsers: 1200, pageviews: 3000, keyEvents: 18, partial: false },
  { month: '2026-11', sessions: 600,  activeUsers: 500,  pageviews: 1200, keyEvents: 7,  partial: true },
  ...over,
]

describe('pctChange', () => {
  it('calcula la variación contra el mes anterior', () => {
    expect(pctChange(150, 100)).toBe(50)
    expect(pctChange(50, 100)).toBe(-50)
    expect(pctChange(100, 100)).toBe(0)
  })

  it('un mes sin dato no produce una variación (ni la trata como 0)', () => {
    expect(pctChange(100, null)).toBeNull()
    expect(pctChange(null, 100)).toBeNull()
    expect(pctChange(100, 0)).toBeNull()
  })
})

describe('rótulos de mes', () => {
  it('corto con año de dos dígitos y marca de enero', () => {
    expect(monthShort('2026-11')).toEqual({ label: 'nov', year: '26', isJan: false })
    expect(monthShort('2026-01').isJan).toBe(true)
  })
  it('largo con año completo', () => {
    expect(monthLong('2026-11')).toBe('Noviembre 2026')
  })
})

describe('MonthlyTrendChart', () => {
  it('no se dibuja con menos de dos meses medidos', () => {
    const { container } = render(<MonthlyTrendChart series={[{ month: '2026-11', sessions: 10, keyEvents: 1 }]} />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('un mes sin dato se dibuja como "s/d" y no como una barra en cero', () => {
    render(<MonthlyTrendChart series={[...serie(), { month: '2026-12', sessions: null, keyEvents: null, partial: false }]} />)
    expect(screen.getByText('s/d')).toBeInTheDocument()
  })

  it('al pararse en un mes muestra visitas, eventos clave y la variación', () => {
    render(<MonthlyTrendChart series={serie()} />)
    fireEvent.mouseEnter(screen.getByLabelText('Octubre 2026: 1500 visitas'))
    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('Octubre 2026')).toBeInTheDocument()
    expect(within(tip).getByText('1.500')).toBeInTheDocument()
    expect(within(tip).getByText('18')).toBeInTheDocument()
    expect(within(tip).getByText(/↑ 50% vs sep/)).toBeInTheDocument()
  })

  it('el mes en curso avisa que no es comparable con un mes cerrado', () => {
    render(<MonthlyTrendChart series={serie()} throughDate="2026-11-13" />)
    fireEvent.mouseEnter(screen.getByLabelText('Noviembre 2026: 600 visitas'))
    expect(screen.getByText(/Mes en curso — datos hasta el 13/)).toBeInTheDocument()
    expect(screen.getByText(/No es comparable con un mes cerrado/)).toBeInTheDocument()
  })

  it('sin eventos clave en ningún mes, la serie de eventos no se ofrece', () => {
    const sinEventos = serie().map(m => ({ ...m, keyEvents: 0 }))
    render(<MonthlyTrendChart series={sinEventos} />)
    expect(screen.queryByText('Eventos clave')).toBeNull()
    expect(screen.getByText('Visitas (sesiones)')).toBeInTheDocument()
  })
})

describe('catálogo GA4 (espejo del backend)', () => {
  it('los valores crudos de GA4 se muestran legibles', () => {
    expect(formatDimensionValue('date', '20261113')).toBe('13/11/2026')
    expect(formatDimensionValue('yearMonth', '202611')).toBe('nov 2026')
    expect(formatDimensionValue('hour', '8')).toBe('08 h')
    expect(formatDimensionValue('country', '(not set)')).toBe('sin definir')
    expect(formatDimensionValue('country', 'Chile')).toBe('Chile')
  })

  it('cada métrica se formatea según su tipo (tasa, duración, entero)', () => {
    expect(formatMetricValue('sessions', 1500)).toBe('1.500')
    expect(formatMetricValue('bounceRate', 0.4213)).toBe('42,1%')
    expect(formatMetricValue('averageSessionDuration', 95)).toBe('1m 35s')
    expect(formatMetricValue('sessionsPerUser', 1.26)).toBe('1,3')
  })

  it('una clave desconocida no rompe la tabla: se muestra tal cual', () => {
    expect(formatMetricValue('metricaNueva', 5)).toBe('5')
    expect(formatDimensionValue('dimensionNueva', 'x')).toBe('x')
  })

  it('el período de la consulta se lee en castellano', () => {
    expect(queryPeriodLabel('2026-11-01', '2026-11-13')).toBe('1 nov 2026 → 13 nov 2026')
    expect(queryPeriodLabel('365daysAgo', 'today')).toBe('hace 365 días → hoy')
  })
})
