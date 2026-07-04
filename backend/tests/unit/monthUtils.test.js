const { periodMonths, periodLabel, prevMonthStr, prevMonthsArr, monthLabel,
        monthsInRange, isWholeSingleMonth, isWholeMonths, rangeLabel, rangeDataLabel } = require('../../src/lib/monthUtils')

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

  // ── Rango de fechas (informes con período configurable) ──
  describe('monthsInRange', () => {
    it('un solo mes', () => {
      expect(monthsInRange('2026-06-01', '2026-06-30')).toEqual(['2026-06'])
    })
    it('trimestre', () => {
      expect(monthsInRange('2026-04-01', '2026-06-30')).toEqual(['2026-04', '2026-05', '2026-06'])
    })
    it('cruza el año', () => {
      expect(monthsInRange('2025-12-10', '2026-02-05')).toEqual(['2025-12', '2026-01', '2026-02'])
    })
    it('rango parcial dentro de un mes cuenta ese mes', () => {
      expect(monthsInRange('2026-06-10', '2026-06-20')).toEqual(['2026-06'])
    })
  })

  describe('isWholeSingleMonth / isWholeMonths', () => {
    it('mes completo', () => {
      expect(isWholeSingleMonth('2026-06-01', '2026-06-30')).toBe(true)
      expect(isWholeSingleMonth('2026-02-01', '2026-02-28')).toBe(true)
    })
    it('parcial no es mes completo', () => {
      expect(isWholeSingleMonth('2026-06-01', '2026-06-29')).toBe(false)
      expect(isWholeSingleMonth('2026-06-02', '2026-06-30')).toBe(false)
    })
    it('varios meses completos', () => {
      expect(isWholeMonths('2026-04-01', '2026-06-30')).toBe(true)
      expect(isWholeSingleMonth('2026-04-01', '2026-06-30')).toBe(false)
    })
  })

  describe('rangeLabel', () => {
    it('mes completo → nombre del mes', () => {
      expect(rangeLabel('2026-06-01', '2026-06-30')).toBe('Junio 2026')
    })
    it('meses completos mismo año', () => {
      expect(rangeLabel('2026-04-01', '2026-06-30')).toBe('Abril–Junio 2026')
    })
    it('meses completos cruzando año', () => {
      expect(rangeLabel('2025-12-01', '2026-02-28')).toBe('Dic 2025–Feb 2026')
    })
    it('parcial mismo mes', () => {
      expect(rangeLabel('2026-06-01', '2026-06-29')).toBe('1–29 Jun 2026')
    })
    it('parcial multi-mes', () => {
      expect(rangeLabel('2026-04-10', '2026-06-29')).toBe('10 Abr – 29 Jun 2026')
    })
  })

  it('rangeDataLabel', () => {
    expect(rangeDataLabel('2026-06-01', '2026-06-30')).toBe('Datos del 01/06/2026 al 30/06/2026')
  })
})
