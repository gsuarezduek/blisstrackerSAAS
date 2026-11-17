// Las alertas de enlaces del aviso mensual de SEO. El riesgo de esta feature es el
// falso positivo: un mail que avisa una pérdida que no pasó quema la confianza en el
// aviso entero, y después nadie lo lee. De ahí que cada regla tenga su umbral y que
// "no se pudo chequear" nunca cuente como "se perdió".
jest.mock('../../src/lib/prisma', () => ({
  searchConsoleSnapshot: { findUnique: jest.fn() },
  keywordRanking:        { findMany: jest.fn() },
  backlinkSnapshot:      { findUnique: jest.fn() },
  backlinkCheck:         { findMany: jest.fn() },
  backlink:              { count: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const { buildProjectAlerts } = require('../../src/services/seoAlerts.service')

const MONTH = '2026-10'
const PREV  = '2026-09'

const bl = (over = {}) => ({ referringDomains: 20, activeLinks: 30, newLinks: 2, lostLinks: 0, ...over })

function snapshots({ cur = null, prev = null } = {}) {
  prisma.backlinkSnapshot.findUnique.mockImplementation(({ where }) =>
    Promise.resolve(where.projectId_month.month === MONTH ? cur : prev))
}

const alertsOf = async () => buildProjectAlerts(1, MONTH, PREV)
const find = (list, type) => list.find(a => a.type === type)

beforeEach(() => {
  Object.values(prisma).forEach(m => Object.values(m).forEach(fn => fn.mockReset()))
  prisma.searchConsoleSnapshot.findUnique.mockResolvedValue(null)
  prisma.keywordRanking.findMany.mockResolvedValue([])
  prisma.backlinkSnapshot.findUnique.mockResolvedValue(null)
  prisma.backlinkCheck.findMany.mockResolvedValue([])
  prisma.backlink.count.mockResolvedValue(0)
})

describe('alertas — enlaces perdidos', () => {
  it('avisa por un solo enlace perdido', async () => {
    // El umbral es 1 a propósito: un enlace conseguido es trabajo que se hizo y se
    // facturó. Esperar a que se caigan tres es enterarse tarde.
    snapshots({ cur: bl({ lostLinks: 1 }) })
    expect(find(await alertsOf(), 'backlinks_lost')).toBeTruthy()
  })

  it('sin enlaces perdidos no avisa nada', async () => {
    snapshots({ cur: bl({ lostLinks: 0 }) })
    expect(find(await alertsOf(), 'backlinks_lost')).toBeUndefined()
  })

  it('perder un dofollow es grave; perder solo nofollow, no tanto', async () => {
    snapshots({ cur: bl({ lostLinks: 2 }) })
    prisma.backlink.count.mockResolvedValue(1)
    const alta = find(await alertsOf(), 'backlinks_lost')
    expect(alta.severity).toBe('high')
    expect(alta.message).toContain('1 de ellos dofollow')

    prisma.backlink.count.mockResolvedValue(0)
    const media = find(await alertsOf(), 'backlinks_lost')
    expect(media.severity).toBe('medium')
    expect(media.message).not.toContain('dofollow')
  })

  it('los dofollow perdidos se cuentan DENTRO del mes, no en todo el histórico', async () => {
    snapshots({ cur: bl({ lostLinks: 1 }) })
    await alertsOf()
    const where = prisma.backlink.count.mock.calls[0][0].where
    expect(where.linkType).toBe('follow')
    expect(where.lostAt.gte.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(where.lostAt.lt.toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('sin snapshot del mes no se inventa ninguna alerta de enlaces', async () => {
    snapshots({ cur: null, prev: bl() })
    const list = await alertsOf()
    expect(find(list, 'backlinks_lost')).toBeUndefined()
    expect(find(list, 'referring_domains')).toBeUndefined()
  })
})

describe('alertas — dominios de referencia', () => {
  it('avisa una caída del 10% o más', async () => {
    snapshots({ cur: bl({ referringDomains: 17 }), prev: bl({ referringDomains: 20 }) })
    const a = find(await alertsOf(), 'referring_domains')
    expect(a.severity).toBe('medium')
    expect(a.message).toContain('−15%')
  })

  it('una caída chica no es una alerta', async () => {
    snapshots({ cur: bl({ referringDomains: 19 }), prev: bl({ referringDomains: 20 }) })
    expect(find(await alertsOf(), 'referring_domains')).toBeUndefined()
  })

  it('con un perfil chico no avisa: perder 1 de 4 es ruido, no una tendencia', async () => {
    // 1 de 4 es un −25% que dispararía la regla, y no dice nada: en un perfil de 4
    // dominios cualquier movimiento es un porcentaje enorme.
    snapshots({ cur: bl({ referringDomains: 3 }), prev: bl({ referringDomains: 4 }) })
    expect(find(await alertsOf(), 'referring_domains')).toBeUndefined()
  })

  it('crecer nunca es una alerta', async () => {
    snapshots({ cur: bl({ referringDomains: 30 }), prev: bl({ referringDomains: 20 }) })
    expect(find(await alertsOf(), 'referring_domains')).toBeUndefined()
  })
})

describe('alertas — enlaces que pasaron a nofollow', () => {
  const check = (backlinkId, linkType, createdAt, found = true) => ({ backlinkId, linkType, found, createdAt })

  it('avisa cuando un dofollow pasó a nofollow dentro del mes', async () => {
    // El enlace sigue puesto y la página sigue cargando: ningún otro contador lo ve.
    snapshots({ cur: bl() })
    prisma.backlinkCheck.findMany.mockResolvedValue([
      check(7, 'follow', '2026-09-28'),
      check(7, 'nofollow', '2026-10-05'),
    ])
    const a = find(await alertsOf(), 'backlink_nofollow')
    expect(a.severity).toBe('medium')
    expect(a.message).toContain('1 enlace(s)')
  })

  it('no avisa si el cambio pasó en un mes anterior', async () => {
    snapshots({ cur: bl() })
    prisma.backlinkCheck.findMany.mockResolvedValue([
      check(7, 'follow', '2026-09-01'),
      check(7, 'nofollow', '2026-09-20'),
    ])
    expect(find(await alertsOf(), 'backlink_nofollow')).toBeUndefined()
  })

  it('funciona sin snapshot: sale del historial de chequeos, no del snapshot mensual', async () => {
    // El historial existe desde la primera corrida del verificador, antes de que haya
    // cerrado ningún mes.
    snapshots({ cur: null })
    prisma.backlinkCheck.findMany.mockResolvedValue([
      check(7, 'follow', '2026-09-28'),
      check(7, 'nofollow', '2026-10-05'),
    ])
    expect(find(await alertsOf(), 'backlink_nofollow')).toBeTruthy()
  })

  it('pide los chequeos desde un mes antes, para tener con qué comparar el primero del mes', async () => {
    snapshots({ cur: bl() })
    await alertsOf()
    const where = prisma.backlinkCheck.findMany.mock.calls[0][0].where
    expect(where.createdAt.gte.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(where.createdAt.lt.toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(where.found).toBe(true)
  })
})
