jest.mock('../../src/lib/prisma', () => ({}))

const { pickHistoricalStock } = require('../../src/services/facebookSnapshot.service')

// Recalcular un mes ya cerrado recalcula los posts (van fechados) pero NO puede
// recalcular los seguidores: el scrape devuelve los de hoy. Esta es la regla que evita
// que "traer los posts de octubre" deje el snapshot de octubre con los seguidores de
// noviembre y el crecimiento mensual mintiendo.
describe('pickHistoricalStock', () => {
  const metrics = { followersCount: 90000, fanCount: 1000 }   // lo que trae el scrape HOY

  it('conserva los seguidores que ya tenía el snapshot del mes', () => {
    const r = pickHistoricalStock({ existing: { followersCount: 82669, fanCount: 950 }, lastLog: null, metrics })
    expect(r).toEqual({ followersCount: 82669, fanCount: 950, followersSource: 'snapshot' })
  })

  it('sin snapshot, usa el último registro diario de seguidores de ese mes', () => {
    const r = pickHistoricalStock({ existing: null, lastLog: { followersCount: 81000 }, metrics })
    expect(r.followersCount).toBe(81000)
    expect(r.followersSource).toBe('log')
  })

  it('el snapshot gana sobre el log diario (es el dato que se registró en su momento)', () => {
    const r = pickHistoricalStock({ existing: { followersCount: 82669 }, lastLog: { followersCount: 81000 }, metrics })
    expect(r.followersCount).toBe(82669)
    expect(r.followersSource).toBe('snapshot')
  })

  it('sin ninguna de las dos, cae a lo del scrape y lo declara (el llamador avisa)', () => {
    const r = pickHistoricalStock({ existing: null, lastLog: null, metrics })
    expect(r).toEqual({ followersCount: 90000, fanCount: 1000, followersSource: 'scrape' })
  })

  it('un 0 guardado es un dato, no un faltante', () => {
    const r = pickHistoricalStock({ existing: { followersCount: 0, fanCount: null }, lastLog: null, metrics })
    expect(r.followersCount).toBe(0)
    expect(r.followersSource).toBe('snapshot')
  })

  it('completa el fanCount con el del scrape si el snapshot no lo tenía', () => {
    // fan_count queda en null cuando el actor manda `likes: 0` — ahí el dato de hoy es
    // mejor que nada, y no distorsiona ningún gráfico (no hay serie histórica de likes).
    const r = pickHistoricalStock({ existing: { followersCount: 82669, fanCount: null }, lastLog: null, metrics })
    expect(r.fanCount).toBe(1000)
  })

  it('sin fanCount en ninguna fuente, queda en null', () => {
    const r = pickHistoricalStock({ existing: { followersCount: 10 }, lastLog: null, metrics: { followersCount: 20 } })
    expect(r.fanCount).toBeNull()
  })
})
