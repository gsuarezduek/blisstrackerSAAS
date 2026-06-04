const { periodMonths, periodLabel, prevMonthStr, prevMonthsArr, monthLabel } = require('../../src/lib/monthUtils')

describe('monthUtils', () => {
  describe('periodMonths', () => {
    it('monthly devuelve solo el mes', () => {
      expect(periodMonths('2026-05', 'monthly')).toEqual(['2026-05'])
    })
    it('quarterly acumula desde el inicio del trimestre calendario', () => {
      expect(periodMonths('2026-05', 'quarterly')).toEqual(['2026-04', '2026-05'])
      expect(periodMonths('2026-03', 'quarterly')).toEqual(['2026-01', '2026-02', '2026-03'])
      expect(periodMonths('2026-12', 'quarterly')).toEqual(['2026-10', '2026-11', '2026-12'])
    })
    it('annual acumula desde enero', () => {
      expect(periodMonths('2026-03', 'annual')).toEqual(['2026-01', '2026-02', '2026-03'])
    })
  })

  describe('periodLabel', () => {
    it('arma etiquetas legibles', () => {
      expect(periodLabel('2026-05', 'monthly')).toBe('Mayo 2026')
      expect(periodLabel('2026-05', 'quarterly')).toBe('Q2 2026')
      expect(periodLabel('2026-12', 'quarterly')).toBe('Q4 2026')
      expect(periodLabel('2026-05', 'annual')).toBe('2026')
    })
  })

  describe('prevMonthStr / prevMonthsArr', () => {
    it('retrocede meses cruzando el año', () => {
      expect(prevMonthStr('2026-01')).toBe('2025-12')
      expect(prevMonthsArr('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
    })
  })

  it('monthLabel', () => {
    expect(monthLabel('2026-01')).toBe('Enero 2026')
  })
})
