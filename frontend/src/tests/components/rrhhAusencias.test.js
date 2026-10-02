import { describe, it, expect } from 'vitest'
import { buildAbsenceGrid, groupRequests } from '../../pages/rrhh/ausencias'

const ana = { id: 1, name: 'Ana Pérez' }
const beto = { id: 2, name: 'Beto Gómez' }

describe('buildAbsenceGrid', () => {
  const leaves = [
    { id: 1, user: ana, type: 'vacaciones', status: 'approved', startDate: '2026-09-28', endDate: '2026-10-02' },
    { id: 2, user: beto, type: 'estudio', status: 'pending', startDate: '2026-10-20', endDate: '2026-10-20' },
    { id: 3, user: beto, type: 'vacaciones', status: 'rejected', startDate: '2026-10-05', endDate: '2026-10-09' },
  ]
  const benefits = [
    { id: 9, user: ana, bank: 'dias_home', status: 'approved', amount: 1, date: '2026-10-15' },
    { id: 10, user: beto, bank: 'horas_libres', status: 'pending', amount: 2.5, date: '2026-11-01' },
  ]

  it('arma los días del mes con fin de semana y hoy', () => {
    const { days } = buildAbsenceGrid({ users: [ana], year: 2026, month: 9, today: '2026-10-02' })
    expect(days).toHaveLength(31)
    expect(days[1]).toMatchObject({ date: '2026-10-02', today: true, weekend: false })
    expect(days[2]).toMatchObject({ date: '2026-10-03', weekend: true })
  })

  it('recorta licencias al mes, ignora rechazadas y suma beneficios del mes', () => {
    const { rows } = buildAbsenceGrid({ users: [ana, beto], leaves, benefits, year: 2026, month: 9, today: '2026-10-02' })
    const a = rows.find(r => r.user.id === 1)
    const b = rows.find(r => r.user.id === 2)
    expect(Object.keys(a.cells).sort()).toEqual(['2026-10-01', '2026-10-02', '2026-10-15'])
    expect(a.cells['2026-10-15'][0]).toMatchObject({ kind: 'home', status: 'approved' })
    expect(a.count).toBe(3)
    expect(Object.keys(b.cells)).toEqual(['2026-10-20'])
    expect(b.cells['2026-10-20'][0].label).toMatch(/pendiente/)
  })
})

describe('groupRequests', () => {
  const leaves = [
    { id: 1, user: ana, type: 'vacaciones', status: 'approved', startDate: '2026-10-01', endDate: '2026-10-05' },
    { id: 2, user: beto, type: 'estudio', status: 'pending', startDate: '2026-10-20', endDate: '2026-10-20' },
    { id: 3, user: beto, type: 'vacaciones', status: 'approved', startDate: '2026-08-01', endDate: '2026-08-05' },
    { id: 4, user: ana, type: 'otro', status: 'rejected', startDate: '2026-09-01', endDate: '2026-09-01' },
  ]
  const benefits = [{ id: 9, user: ana, bank: 'dias_home', status: 'approved', amount: 1, date: '2026-10-15' }]

  it('separa pendientes, próximas/en curso y anteriores', () => {
    const g = groupRequests({ leaves, benefits, today: '2026-10-02' })
    expect([...g.pendingIds]).toEqual(['leave-2'])
    expect(g.upcoming.map(r => r.key)).toEqual(['leave-1', 'benefit-9'])
    expect(g.past.map(r => r.key)).toEqual(['leave-4', 'leave-3'])
  })

  it('filtra por tipo y por persona', () => {
    expect(groupRequests({ leaves, benefits, filter: 'dias_home', today: '2026-10-02' }).upcoming.map(r => r.key)).toEqual(['benefit-9'])
    const g = groupRequests({ leaves, benefits, query: 'beto', today: '2026-10-02' })
    expect([...g.pendingIds]).toEqual(['leave-2'])
    expect(g.upcoming).toHaveLength(0)
  })
})
