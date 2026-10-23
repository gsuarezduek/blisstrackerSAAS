import { describe, it, expect } from 'vitest'
import { isSeguimientoNew, seguimientoSignature } from '../../pages/DashboardParts'

const task = (overrides = {}) => ({ id: 1, status: 'PENDING', _count: { comments: 0 }, ...overrides })

describe('isSeguimientoNew', () => {
  it('sin firma guardada no es novedad (recién seguida o delegada)', () => {
    expect(isSeguimientoNew({}, task())).toBe(false)
  })

  it('misma firma que la guardada: sin cambios', () => {
    const t = task()
    expect(isSeguimientoNew({ 1: seguimientoSignature(t) }, t)).toBe(false)
  })

  it('cambió el estado: es novedad', () => {
    expect(isSeguimientoNew({ 1: 'PENDING:0' }, task({ status: 'IN_PROGRESS' }))).toBe(true)
  })

  it('llegó un comentario: es novedad', () => {
    expect(isSeguimientoNew({ 1: 'PENDING:0' }, task({ _count: { comments: 1 } }))).toBe(true)
  })

  it('los avisos de tarea eliminada nunca cuentan', () => {
    expect(isSeguimientoNew({ 1: 'PENDING:0' }, task({ status: 'DELETED', __deletedNotice: true }))).toBe(false)
  })
})
