import { describe, it, expect } from 'vitest'
import { orderTodayTasks, groupBacklogByProject, publishUrgency } from '../../pages/DashboardParts'

// Fábrica mínima: lo único que miran estas funciones es status, createdAt, project y la
// fecha de publicación de la pieza vinculada.
let seq = 0
function task({ status = 'PENDING', created = '2026-12-01T12:00:00Z', publish = null, project = 1 } = {}) {
  seq++
  return {
    id: seq,
    status,
    createdAt: created,
    project: { id: project, name: `P${project}` },
    contentPiece: publish ? { id: seq, scheduledDate: publish } : null,
  }
}
const ids = list => list.map(t => t.id)

describe('orderTodayTasks', () => {
  it('por publicación: la pieza más próxima primero aunque se haya creado antes', () => {
    // Caso real: las piezas se crean en orden de publicación, así que la más lejana es la más nueva.
    const p2 = task({ publish: '2026-12-04', created: '2026-12-01T10:00:00Z' })
    const p3 = task({ publish: '2026-12-07', created: '2026-12-01T11:00:00Z' })
    const p6 = task({ publish: '2026-12-14', created: '2026-12-01T12:00:00Z' })
    expect(ids(orderTodayTasks([p6, p3, p2], 'publish'))).toEqual([p2.id, p3.id, p6.id])
  })

  it('por publicación: las tareas sin pieza van después, más nuevas primero', () => {
    const vieja = task({ created: '2026-11-01T12:00:00Z' })
    const nueva = task({ created: '2026-11-20T12:00:00Z' })
    const pieza = task({ publish: '2026-12-20', created: '2026-10-01T12:00:00Z' })
    expect(ids(orderTodayTasks([vieja, pieza, nueva], 'publish'))).toEqual([pieza.id, nueva.id, vieja.id])
  })

  it('las pausadas van primero en cualquier orden', () => {
    const pausada = task({ status: 'PAUSED', created: '2026-01-01T12:00:00Z' })
    const pieza = task({ publish: '2026-12-02' })
    const nueva = task({ created: '2026-12-10T12:00:00Z' })
    for (const sort of ['publish', 'desc', 'asc']) {
      expect(orderTodayTasks([nueva, pieza, pausada], sort)[0].id).toBe(pausada.id)
    }
  })

  it('más nuevas / más antiguas ignoran la fecha de publicación', () => {
    const a = task({ created: '2026-11-01T12:00:00Z', publish: '2026-12-30' })
    const b = task({ created: '2026-11-10T12:00:00Z', publish: '2026-12-02' })
    const c = task({ created: '2026-11-20T12:00:00Z' })
    expect(ids(orderTodayTasks([b, c, a], 'desc'))).toEqual([c.id, b.id, a.id])
    expect(ids(orderTodayTasks([b, c, a], 'asc'))).toEqual([a.id, b.id, c.id])
  })

  it('no muta la lista recibida', () => {
    const list = [task({ publish: '2026-12-10' }), task({ publish: '2026-12-01' })]
    const before = ids(list)
    orderTodayTasks(list, 'publish')
    expect(ids(list)).toEqual(before)
  })
})

describe('groupBacklogByProject', () => {
  it('el proyecto con la publicación más próxima queda primero', () => {
    const sinPieza = task({ project: 1, created: '2026-12-01T12:00:00Z' })
    const lejana = task({ project: 2, publish: '2026-12-20' })
    const proxima = task({ project: 3, publish: '2026-12-05' })
    const groups = groupBacklogByProject([sinPieza, lejana, proxima], 'desc')
    expect(groups.map(g => g.project.id)).toEqual([3, 2, 1])
  })

  it('dentro del proyecto: piezas por publicación y el resto según el toggle', () => {
    const vieja = task({ project: 1, created: '2026-11-01T12:00:00Z' })
    const nueva = task({ project: 1, created: '2026-11-20T12:00:00Z' })
    const pieza = task({ project: 1, publish: '2026-12-05' })
    expect(ids(groupBacklogByProject([vieja, nueva, pieza], 'desc')[0].tasks)).toEqual([pieza.id, nueva.id, vieja.id])
    expect(ids(groupBacklogByProject([vieja, nueva, pieza], 'asc')[0].tasks)).toEqual([pieza.id, vieja.id, nueva.id])
  })
})

describe('publishUrgency', () => {
  const now = new Date('2026-12-04T15:00:00Z') // mediodía del 4 dic en Buenos Aires

  it('sin contenido próximo → sin nivel', () => {
    const r = publishUrgency([task(), task({ publish: '2026-12-10' })], now)
    expect(r).toMatchObject({ urgent: 0, soon: 0, level: null })
    expect(r.tasks).toEqual([])
  })

  it('mañana o en 2 días → naranja', () => {
    const r = publishUrgency([task({ publish: '2026-12-05' }), task({ publish: '2026-12-06' }), task({ publish: '2026-12-07' })], now)
    expect(r).toMatchObject({ urgent: 0, soon: 2, level: 'orange' })
    expect(r.tasks).toHaveLength(2)
  })

  it('hoy o vencida → rojo, aunque también haya naranjas', () => {
    const hoy = task({ publish: '2026-12-04' })
    const vencida = task({ publish: '2026-12-01' })
    const manana = task({ publish: '2026-12-05' })
    const r = publishUrgency([hoy, vencida, manana], now)
    expect(r).toMatchObject({ urgent: 2, soon: 1, level: 'red' })
    expect(ids(r.tasks)).toEqual([hoy.id, vencida.id, manana.id])
  })
})
