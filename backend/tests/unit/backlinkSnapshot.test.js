// El snapshot mensual del perfil de enlaces. Lo que se afirma acá es la distinción que
// hace al número: los contadores de STOCK son el estado de hoy, los de FLUJO son del
// mes. Confundirlos le muestra al cliente la pérdida acumulada de dos años como si
// fuera la del mes.
jest.mock('../../src/lib/prisma', () => ({
  backlink:               { findMany: jest.fn() },
  backlinkProfileReading: { findFirst: jest.fn() },
  backlinkSnapshot:       { upsert: jest.fn() },
  project:                { findFirst: jest.fn(), findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { saveBacklinkSnapshot, saveAllBacklinkSnapshots, monthRangeUtc } = require('../../src/services/backlinkSnapshot.service')

const link = (over = {}) => ({
  sourceDomain: 'diario.com', status: 'activo', linkType: 'follow',
  domainRating: null, firstSeenAt: null, lostAt: null, ...over,
})

function setup(links, { reading = null, domainRating = 55 } = {}) {
  prisma.backlink.findMany.mockResolvedValue(links)
  prisma.project.findFirst.mockResolvedValue({ domainRating })
  prisma.backlinkProfileReading.findFirst.mockResolvedValue(reading)
  prisma.backlinkSnapshot.upsert.mockImplementation(({ create }) => Promise.resolve(create))
}

const written = () => prisma.backlinkSnapshot.upsert.mock.calls[0][0].create

beforeEach(() => {
  Object.values(prisma).forEach(model => Object.values(model).forEach(fn => fn.mockReset()))
})

describe('snapshot de enlaces — los contadores de stock', () => {
  it('cuenta un dominio una sola vez por más enlaces que tenga de ese sitio', async () => {
    setup([
      link({ sourceDomain: 'diario.com' }),
      link({ sourceDomain: 'diario.com' }),
      link({ sourceDomain: 'blog.com' }),
    ])
    await saveBacklinkSnapshot(1, 1, '2026-10')
    expect(written().activeLinks).toBe(3)
    expect(written().referringDomains).toBe(2)
  })

  it('deja afuera del stock los enlaces que no están activos', async () => {
    setup([link(), link({ status: 'perdido' }), link({ status: 'sin_verificar' })])
    await saveBacklinkSnapshot(1, 1, '2026-10')
    expect(written().activeLinks).toBe(1)
  })

  it('copia el Domain Rating del sitio propio tal como está al cierre', async () => {
    setup([link()], { domainRating: 41 })
    await saveBacklinkSnapshot(1, 1, '2026-10')
    expect(written().domainRating).toBe(41)
  })
})

describe('snapshot de enlaces — los contadores de flujo', () => {
  it('cuenta como perdidos del mes solo los que se cayeron EN ese mes', async () => {
    // Es la regresión que importa: el `lostLinks` del perfil son todos los que están
    // perdidos hoy. Si el snapshot usara ese número, el informe de octubre diría que
    // se perdieron 3 enlaces cuando dos se habían caído el año pasado.
    setup([
      link({ status: 'perdido', lostAt: new Date('2026-10-14T12:00:00Z') }),
      link({ status: 'perdido', lostAt: new Date('2025-03-02T12:00:00Z') }),
      link({ status: 'perdido', lostAt: new Date('2025-07-20T12:00:00Z') }),
    ])
    await saveBacklinkSnapshot(1, 1, '2026-10')
    expect(written().lostLinks).toBe(1)
  })

  it('cuenta como nuevos del mes los que aparecieron en ese mes', async () => {
    setup([
      link({ firstSeenAt: new Date('2026-10-01T00:00:00Z') }),
      link({ firstSeenAt: new Date('2026-10-31T23:00:00Z') }),
      link({ firstSeenAt: new Date('2026-11-01T01:00:00Z') }),
    ])
    await saveBacklinkSnapshot(1, 1, '2026-10')
    expect(written().newLinks).toBe(2)
  })

  it('un enlace sin fecha de aparición no cuenta como nuevo', async () => {
    // No sabemos desde cuándo existe. Asumir que nació el día que se cargó inflaría
    // el mes de la importación con años de historia.
    setup([link({ firstSeenAt: null })])
    await saveBacklinkSnapshot(1, 1, '2026-10')
    expect(written().newLinks).toBe(0)
  })
})

describe('snapshot de enlaces — el dato externo del mes', () => {
  it('guarda lo último que reportó la herramienta dentro del mes', async () => {
    setup([link()], { reading: { reportedDomains: 412 } })
    await saveBacklinkSnapshot(1, 1, '2026-10')
    expect(written().reportedDomains).toBe(412)
  })

  it('sin lectura en el mes queda nulo y no en cero', async () => {
    // Un 0 diría "Ahrefs reporta cero dominios", que es un dato; nulo dice "nadie lo
    // leyó este mes", que es la verdad.
    setup([link()])
    await saveBacklinkSnapshot(1, 1, '2026-10')
    expect(written().reportedDomains).toBeNull()
  })

  it('solo mira lecturas que traigan el dato de dominios', async () => {
    setup([link()])
    await saveBacklinkSnapshot(1, 1, '2026-10')
    const where = prisma.backlinkProfileReading.findFirst.mock.calls[0][0].where
    expect(where.reportedDomains).toEqual({ not: null })
  })

  it('la ventana del mes es media abierta: el 1° del siguiente ya no entra', async () => {
    const r = monthRangeUtc('2026-10')
    expect(r.gte.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(r.lt.toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('la ventana cruza bien el fin de año', async () => {
    const r = monthRangeUtc('2026-12')
    expect(r.lt.toISOString()).toBe('2027-01-01T00:00:00.000Z')
  })
})

describe('snapshot de enlaces — a qué proyectos les corresponde', () => {
  it('solo a los que tengan algo cargado, para no sembrar informes en cero', async () => {
    // `availability.js` publica la sección "Autoridad y enlaces" cuando hay snapshot:
    // una fila en cero le ofrecería al cliente un informe que dice "0 enlaces" como si
    // fuera un resultado medido, en una cuenta que nunca usó la feature.
    prisma.project.findMany.mockResolvedValue([])
    await saveAllBacklinkSnapshots({ month: '2026-10' })
    const where = prisma.project.findMany.mock.calls[0][0].where
    expect(where.OR).toEqual([{ backlinks: { some: {} } }, { backlinkProfileReadings: { some: {} } }])
    expect(where.marketingEnabled).toBe(true)
    expect(where.active).toBe(true)
  })

  it('un proyecto que falla no corta la corrida del resto', async () => {
    prisma.project.findMany.mockResolvedValue([
      { id: 1, workspaceId: 1, name: 'roto' },
      { id: 2, workspaceId: 1, name: 'sano' },
    ])
    prisma.backlink.findMany
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue([link()])
    prisma.project.findFirst.mockResolvedValue({ domainRating: 30 })
    prisma.backlinkProfileReading.findFirst.mockResolvedValue(null)
    prisma.backlinkSnapshot.upsert.mockResolvedValue({ id: 9 })

    const res = await saveAllBacklinkSnapshots({ month: '2026-10' })
    expect(res).toMatchObject({ total: 2, saved: 1, failed: 1 })
  })
})
