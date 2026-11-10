import { describe, it, expect } from 'vitest'
import { filterPeopleByTime, homeDaysTakenByUser } from '../../pages/rrhh/tiempo'

// Los chips de "Tiempo y asistencia" recortan el equipo que ven LAS DOS tablas de
// la pantalla (la grilla de quién falta y la de asistencia). Si el recorte no es
// el mismo, vuelve el problema que la fusión resuelve: comparar dos conjuntos de
// gente distintos creyendo que son el mismo.

const ana  = { id: 1, name: 'Ana Pérez' }
const beto = { id: 2, name: 'Beto Gómez' }
const cora = { id: 3, name: 'Cora Díaz' }
const users = [ana, beto, cora]

const FROM = '2026-11-01', TO = '2026-11-30'

const leaves = [
  { id: 10, user: ana,  type: 'vacaciones', status: 'approved', startDate: '2026-11-18', endDate: '2026-11-20' },
  { id: 11, user: beto, type: 'enfermedad', status: 'approved', startDate: '2026-11-16', endDate: '2026-11-17' },
  // Rechazada: no cuenta como ausencia de nadie.
  { id: 12, user: cora, type: 'vacaciones', status: 'rejected', startDate: '2026-11-05', endDate: '2026-11-06' },
  // De otro mes: fuera de la ventana.
  { id: 13, user: cora, type: 'vacaciones', status: 'approved', startDate: '2026-12-10', endDate: '2026-12-12' },
]

const statsById = {
  1: { lateDays: 0, absentDays: 0 },
  2: { lateDays: 2, absentDays: 0 },
  3: { lateDays: 0, absentDays: 3 },
}

const ctx = { leaves, statsById, from: FROM, to: TO }
const ids = rows => rows.map(u => u.id)

describe('filtros de Tiempo y asistencia', () => {
  it('«Todo» no recorta', () => {
    expect(ids(filterPeopleByTime(users, { ...ctx, filter: 'all' }))).toEqual([1, 2, 3])
  })

  it('separa vacaciones del resto de las licencias', () => {
    expect(ids(filterPeopleByTime(users, { ...ctx, filter: 'vacaciones' }))).toEqual([1])
    expect(ids(filterPeopleByTime(users, { ...ctx, filter: 'licencias' }))).toEqual([2])
  })

  it('una licencia rechazada o de otro mes no pone a nadie en el filtro', () => {
    const solaCora = filterPeopleByTime([cora], { ...ctx, filter: 'vacaciones' })
    expect(solaCora).toEqual([])
  })

  it('tardanzas y ausencias salen de la asistencia del backend, no de las licencias', () => {
    expect(ids(filterPeopleByTime(users, { ...ctx, filter: 'tarde' }))).toEqual([2])
    expect(ids(filterPeopleByTime(users, { ...ctx, filter: 'ausencias' }))).toEqual([3])
  })

  it('el buscador se combina con el chip activo', () => {
    expect(ids(filterPeopleByTime(users, { ...ctx, filter: 'all', query: 'perez' }))).toEqual([1])
    expect(ids(filterPeopleByTime(users, { ...ctx, filter: 'tarde', query: 'ana' }))).toEqual([])
  })
})

describe('días home tomados en el mes', () => {
  const benefits = [
    { id: 1, user: ana,  bank: 'dias_home',   status: 'approved', date: '2026-11-05', amount: 1 },
    { id: 2, user: ana,  bank: 'dias_home',   status: 'approved', date: '2026-11-19', amount: 1 },
    { id: 3, user: beto, bank: 'dias_home',   status: 'pending',  date: '2026-11-07', amount: 1 },
    { id: 4, user: beto, bank: 'horas_libres', status: 'approved', date: '2026-11-07', amount: 3 },
    { id: 5, user: cora, bank: 'dias_home',   status: 'approved', date: '2026-10-30', amount: 1 },
  ]

  it('suma sólo los aprobados de ese banco dentro del mes', () => {
    // Beto: el pendiente no cuenta y las horas libres son otro banco.
    // Cora: su día home es de octubre.
    expect(homeDaysTakenByUser(benefits, FROM, TO)).toEqual({ 1: 2 })
  })
})
