import { describe, it, expect } from 'vitest'
import { tenureLabel, lastLoginLabel, filterPeople, missingLegajoFields } from '../../pages/rrhh/personas'

const fields = [
  { key: 'phone', label: 'Teléfono', builtin: true, enabled: true, required: true, order: 1 },
  { key: 'dni',   label: 'DNI',      builtin: true, enabled: true, required: true, order: 2 },
  { key: 'talle', label: 'Talle',    builtin: false, enabled: true, required: false, order: 3 },
]

const users = [
  { id: 1, name: 'Beto Gómez', email: 'beto@b.com', role: 'DESIGNER', vacationDays: 3, workspaceJoinedAt: '2020-01-10', phone: '1', dni: '2', workStartTime: '09:00', workEndTime: '18:00' },
  { id: 2, name: 'ana pérez',  email: 'ana@b.com',  role: 'CM',       vacationDays: 12, workspaceJoinedAt: '2024-05-01', phone: '1' },
  { id: 3, name: 'Carla Ruiz', email: 'carla@b.com', role: 'DESIGNER', vacationDays: 7, workspaceJoinedAt: '2022-03-01', phone: '1', dni: '9', workStartTime: '09:00' },
]

describe('personas — helpers', () => {
  it('antigüedad legible', () => {
    const now = new Date('2026-10-02T12:00:00')
    expect(tenureLabel('2026-09-20', now)).toBe('Nuevo')
    expect(tenureLabel('2026-04-01', now)).toBe('6 meses')
    expect(tenureLabel('2025-10-01', now)).toBe('1 año')
    expect(tenureLabel('2023-06-01', now)).toBe('3 años y 4 m')
  })

  it('último ingreso relativo', () => {
    expect(lastLoginLabel(null)).toBeNull()
    expect(lastLoginLabel('2026-10-02T13:00:00Z', '2026-10-02')).toBe('hoy')
    expect(lastLoginLabel('2026-10-01T13:00:00Z', '2026-10-02')).toBe('ayer')
    expect(lastLoginLabel('2026-09-25T13:00:00Z', '2026-10-02')).toBe('hace 7 días')
  })

  it('campos obligatorios faltantes', () => {
    expect(missingLegajoFields(users[1], fields).map(f => f.key)).toEqual(['dni'])
    expect(missingLegajoFields(users[0], fields)).toEqual([])
  })
})

describe('personas — filterPeople', () => {
  const ctx = { legajoFields: fields, legajoReady: true, awayIds: new Set([3]), lastLogins: { 1: '2026-10-01T12:00:00Z', 3: '2026-10-02T12:00:00Z' }, roleLabel: r => ({ CM: 'Community Manager', DESIGNER: 'Diseño' })[r] }

  it('ordena por nombre sin importar mayúsculas', () => {
    expect(filterPeople(users, {}, ctx).map(u => u.id)).toEqual([2, 1, 3])
  })

  it('busca por nombre, email o etiqueta del rol', () => {
    expect(filterPeople(users, { query: 'carla' }, ctx).map(u => u.id)).toEqual([3])
    expect(filterPeople(users, { query: 'community' }, ctx).map(u => u.id)).toEqual([2])
    expect(filterPeople(users, { query: 'b.com' }, ctx)).toHaveLength(3)
  })

  it('filtra legajo incompleto, sin horario y fuera hoy', () => {
    expect(filterPeople(users, { filter: 'incomplete' }, ctx).map(u => u.id)).toEqual([2])
    expect(filterPeople(users, { filter: 'noSchedule' }, ctx).map(u => u.id)).toEqual([2, 3])
    expect(filterPeople(users, { filter: 'away' }, ctx).map(u => u.id)).toEqual([3])
  })

  it('ordena por antigüedad, vacaciones y último ingreso', () => {
    expect(filterPeople(users, { sort: 'tenure' }, ctx).map(u => u.id)).toEqual([1, 3, 2])
    expect(filterPeople(users, { sort: 'vacation' }, ctx).map(u => u.id)).toEqual([2, 3, 1])
    expect(filterPeople(users, { sort: 'login' }, ctx).map(u => u.id)).toEqual([3, 1, 2])
  })
})
