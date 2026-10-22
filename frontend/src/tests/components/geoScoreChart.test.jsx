import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GeoScoreChart, { geoMonthlyPoints, geoBandOf } from '../../components/marketing/GeoScoreChart'

// Fechas a mediodía local: el mes no depende de la zona horaria de quien corre el test
const d = (y, m, day) => new Date(y, m - 1, day, 12).toISOString()

describe('geoMonthlyPoints', () => {
  it('se queda con la última auditoría de cada mes, en orden cronológico', () => {
    const pts = geoMonthlyPoints([
      { score: 70, date: d(2026, 9, 28) },
      { score: 50, date: d(2026, 8, 1) },
      { score: 60, date: d(2026, 9, 1) },
      { score: 55, date: d(2026, 8, 20) },
    ])
    expect(pts.map(p => [p.short, p.score])).toEqual([['ago', 55], ['sep', 70]])
    expect(pts[1].long).toBe('Septiembre 2026')
  })

  it('devuelve como máximo los últimos 6 meses', () => {
    const history = Array.from({ length: 9 }, (_, i) => ({ score: 40 + i, date: d(2026, i + 1, 5) }))
    const pts = geoMonthlyPoints(history)
    expect(pts).toHaveLength(6)
    expect(pts[0].short).toBe('abr')
    expect(pts[5].score).toBe(48)
  })

  it('si todas caen en el mismo mes, un punto por auditoría rotulado por día', () => {
    const pts = geoMonthlyPoints([{ score: 50, date: d(2026, 9, 3) }, { score: 58, date: d(2026, 9, 17) }])
    expect(pts.map(p => p.short)).toEqual(['3 sep', '17 sep'])
    expect(pts[0].perDay).toBe(true)
  })

  it('ignora entradas sin score o sin fecha', () => {
    expect(geoMonthlyPoints([{ score: null, date: d(2026, 1, 1) }, { score: 50 }])).toEqual([])
    expect(geoMonthlyPoints(null)).toEqual([])
  })
})

describe('geoBandOf', () => {
  it('usa los mismos cortes que el informe (36 / 68 / 86)', () => {
    expect(geoBandOf(35).name).toBe('Crítico')
    expect(geoBandOf(36).name).toBe('Base')
    expect(geoBandOf(68).name).toBe('Bueno')
    expect(geoBandOf(86).name).toBe('Excelente')
    expect(geoBandOf(100).name).toBe('Excelente')
  })
})

describe('GeoScoreChart', () => {
  const history = [
    { score: 52, date: d(2026, 8, 1) },
    { score: 61, date: d(2026, 9, 1) },
    { score: 72, date: d(2026, 10, 2) },
  ]

  it('al pasar el mouse muestra mes, puntaje, banda y variación contra el mes anterior', () => {
    render(<GeoScoreChart history={history} />)
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(screen.getByLabelText('Octubre 2026: 72 de 100'))
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toContain('Octubre 2026')
    expect(tip.textContent).toContain('72')
    expect(tip.textContent).toContain('Bueno')
    expect(tip.textContent).toContain('↑ 11 pts vs. septiembre')
    expect(tip.textContent).toContain('Auditoría del 2 de octubre')
  })

  it('el primer mes no tiene variación; al salir se oculta el tooltip', () => {
    const { container } = render(<GeoScoreChart history={history} />)
    fireEvent.mouseEnter(screen.getByLabelText('Agosto 2026: 52 de 100'))
    expect(screen.getByRole('tooltip').textContent).not.toContain('vs.')
    fireEvent.mouseLeave(container.firstChild)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('con menos de 2 puntos no dibuja nada', () => {
    const { container } = render(<GeoScoreChart history={[{ score: 50, date: d(2026, 9, 1) }]} />)
    expect(container.innerHTML).toBe('')
  })
})
