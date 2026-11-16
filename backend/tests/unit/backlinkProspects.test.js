jest.mock('../../src/lib/prisma', () => ({
  backlink:         { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
  backlinkProspect: { count: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  $transaction:     jest.fn(),
}))

const prisma = require('../../src/lib/prisma')
const {
  syncProspectOwnership, syncOwnershipQuietly, buildProspectData, shapeProspect,
  promoteProspect, OWNED_STATUSES,
} = require('../../src/services/backlinkProspects.service')

const ctx = { projectId: 7, workspaceId: 1 }

/** Prepara el cruce: qué dominios tenemos enlazados y si hay prospectos cargados. */
function given({ ownedDomains = [], prospects = 1 } = {}) {
  prisma.backlinkProspect.count.mockResolvedValue(prospects)
  prisma.backlink.findMany.mockResolvedValue(ownedDomains.map(sourceDomain => ({ sourceDomain })))
  prisma.backlinkProspect.updateMany.mockResolvedValue({ count: 0 })
}

/** Los dos updateMany del cruce, en orden: el que marca y el que desmarca. */
const marked   = () => prisma.backlinkProspect.updateMany.mock.calls.find(c => c[0].data.alreadyLinked === true)?.[0]
const unmarked = () => prisma.backlinkProspect.updateMany.mock.calls.find(c => c[0].data.alreadyLinked === false)?.[0]

beforeEach(() => jest.clearAllMocks())

describe('cruce automático de prospectos — qué cuenta como "ya lo tenemos"', () => {
  it('un enlace recién cargado a mano YA cuenta, sin esperar al verificador', () => {
    // Si `sin_verificar` no contara, cargar el enlace que conseguimos no marcaría
    // el prospecto hasta el lunes siguiente, y la pantalla mostraría como
    // oportunidad algo que ya está hecho.
    expect(OWNED_STATUSES).toContain('sin_verificar')
  })

  it('un enlace que Search Console reporta cuenta, aunque no se pueda verificar', () => {
    // `no_verificable` son las filas del reporte de GSC: es Google diciéndonos que
    // ese dominio nos enlaza, que es exactamente el hecho que el cruce busca.
    expect(OWNED_STATUSES).toContain('no_verificable')
  })

  it('los tres estados de pérdida NO cuentan: el cruce también desmarca', () => {
    for (const lost of ['perdido', 'roto', 'redirigido']) expect(OWNED_STATUSES).not.toContain(lost)
  })

  it('pide sólo los dominios distintos de los enlaces vivos', async () => {
    given({ ownedDomains: ['diario.com'] })
    await syncProspectOwnership(ctx)
    expect(prisma.backlink.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:    { ...ctx, status: { in: OWNED_STATUSES } },
      distinct: ['sourceDomain'],
    }))
  })
})

describe('cruce automático de prospectos — lo que escribe y lo que no', () => {
  it('NUNCA toca el veredicto', async () => {
    // Es la razón de que `alreadyLinked` sea un campo aparte: "ya lo tenemos" es
    // un hecho y el veredicto una opinión. Si compartieran campo, cada corrida
    // destruiría la opinión, y al perder el enlace la fila volvería a "sin
    // evaluar" habiendo estado evaluada.
    given({ ownedDomains: ['diario.com'] })
    await syncProspectOwnership(ctx)
    for (const [call] of prisma.backlinkProspect.updateMany.mock.calls) {
      expect(Object.keys(call.data)).toEqual(expect.not.arrayContaining([
        'verdict', 'verdictSource', 'verdictReason', 'verdictAt', 'verdictLockedAt',
      ]))
    }
  })

  it('marca los prospectos de los dominios que ahora tenemos', async () => {
    given({ ownedDomains: ['diario.com', 'blog.org'] })
    await syncProspectOwnership(ctx)
    expect(marked().where).toMatchObject({ ...ctx, alreadyLinked: false, domain: { in: ['diario.com', 'blog.org'] } })
    expect(marked().data.alreadyLinkedAt).toBeInstanceOf(Date)
  })

  it('desmarca los que dejamos de tener', async () => {
    // El caso real: el enlace se cayó, el verificador lo marcó perdido, y el
    // dominio vuelve a ser una oportunidad.
    given({ ownedDomains: ['diario.com'] })
    await syncProspectOwnership(ctx)
    expect(unmarked().where).toMatchObject({ ...ctx, alreadyLinked: true, domain: { notIn: ['diario.com'] } })
    expect(unmarked().data).toEqual({ alreadyLinked: false, alreadyLinkedAt: null })
  })

  it('sin ningún enlace vivo desmarca TODOS los prospectos', async () => {
    // `notIn: []` matchea todo, que es justo lo correcto acá.
    given({ ownedDomains: [] })
    await syncProspectOwnership(ctx)
    expect(unmarked().where.domain).toEqual({ notIn: [] })
  })

  it('es idempotente: cada updateMany filtra por el valor que va a escribir', async () => {
    // Por eso `alreadyLinkedAt` significa "cuándo lo conseguimos" y no "cuándo lo
    // chequeamos": la segunda corrida no matchea nada y no reescribe la fecha.
    given({ ownedDomains: ['diario.com'] })
    await syncProspectOwnership(ctx)
    expect(marked().where.alreadyLinked).toBe(false)
    expect(unmarked().where.alreadyLinked).toBe(true)
  })

  it('un proyecto sin prospectos no paga ningún updateMany', async () => {
    // Es el camino más común (sólo se cargan los enlaces propios) y no tiene por
    // qué costar dos escrituras en cada alta.
    given({ ownedDomains: ['diario.com'], prospects: 0 })
    expect(await syncProspectOwnership(ctx)).toEqual({ gained: 0, lost: 0 })
    expect(prisma.backlinkProspect.updateMany).not.toHaveBeenCalled()
  })

  it('si el cruce falla, el alta que lo disparó no falla con él', async () => {
    // El dato que la persona quiso guardar ya está guardado, y la próxima
    // escritura recalcula el cruce igual porque es idempotente.
    prisma.backlinkProspect.count.mockRejectedValue(new Error('DB caída'))
    await expect(syncOwnershipQuietly(ctx)).resolves.toEqual({ gained: 0, lost: 0 })
  })
})

describe('prospectos — qué se puede editar', () => {
  it('el dominio no se puede cambiar: es la identidad de la fila', () => {
    // Cambiarlo convertiría el prospecto en otro conservando su veredicto y su
    // pipeline, que es peor que obligar a borrarlo y cargarlo de nuevo.
    expect(buildProspectData({ domain: 'otro.com' }).error).toMatch(/no se puede cambiar/i)
  })

  it('al dar de alta, acepta una URL completa y guarda el dominio', () => {
    expect(buildProspectData({ domain: 'https://www.Diario.com/nota' }, { isCreate: true }).data.domain).toBe('diario.com')
  })

  it('un veredicto escrito a mano sella el candado y se marca como manual', () => {
    const { data } = buildProspectData({ verdict: 'no_vale_la_pena' })
    expect(data).toMatchObject({ verdict: 'no_vale_la_pena', verdictSource: 'manual' })
    expect(data.verdictLockedAt).toBeInstanceOf(Date)
  })

  it('un veredicto manual borra la razón que había escrito la IA', () => {
    // Dejarla sería atribuirle a la decisión nueva el argumento de la vieja.
    expect(buildProspectData({ verdict: 'conseguible' }).data.verdictReason).toBeNull()
  })

  it('resetVerdict libera el candado y devuelve la fila a la cola de la IA', () => {
    const { data } = buildProspectData({ resetVerdict: true })
    expect(data).toMatchObject({ verdict: 'sin_evaluar', verdictSource: 'none', verdictLockedAt: null, verdictAt: null })
  })

  it('no se puede escribir "ya lo tenemos" a mano: es un hecho, no una opinión', () => {
    // Lo escribe sólo el cruce. Aceptarlo acá dejaría una fila que dice que
    // tenemos un enlace que nadie cargó.
    const { data, error } = buildProspectData({ alreadyLinked: true, verdict: 'ya_lo_tenemos' })
    expect(error).toMatch(/veredicto/i)
    expect(data).toBeUndefined()
  })

  it('rechaza un estado de pipeline que no existe', () => {
    expect(buildProspectData({ pipelineStatus: 'inventado' }).error).toMatch(/pipeline/i)
  })

  it('rechaza un costo negativo', () => {
    expect(buildProspectData({ cost: -5 }).error).toMatch(/número/i)
  })

  it('exige la fecha en YYYY-MM-DD', () => {
    expect(buildProspectData({ dueDate: '12/03/2026' }).error).toMatch(/YYYY-MM-DD/)
    expect(buildProspectData({ dueDate: '2026-03-12' }).data.dueDate).toBe('2026-03-12')
  })
})

describe('prospectos — la fila como la ve quien la lee', () => {
  it('resuelve el estado único y cuenta los competidores', () => {
    const out = shapeProspect({ competitors: '[{"domain":"a.com","links":3},{"domain":"b.com","links":1}]', alreadyLinked: false, verdict: 'conseguible', verdictLockedAt: null })
    expect(out).toMatchObject({ effectiveVerdict: 'conseguible', competitorCount: 2, verdictLocked: false })
  })

  it('"ya lo tenemos" gana sobre el veredicto, sin borrarlo', () => {
    // El veredicto sigue ahí: si mañana perdemos el enlace, la fila vuelve a ser
    // una oportunidad evaluada y no una sin evaluar.
    const out = shapeProspect({ competitors: '[]', alreadyLinked: true, verdict: 'conseguible', verdictLockedAt: null })
    expect(out.effectiveVerdict).toBe('ya_lo_tenemos')
    expect(out.verdict).toBe('conseguible')
  })

  it('marca la fila corregida a mano, para distinguirla de la que opinó la IA', () => {
    expect(shapeProspect({ competitors: '[]', verdictLockedAt: new Date() }).verdictLocked).toBe(true)
  })
})

describe('promover una oportunidad — qué enlace nace', () => {
  /** El prospecto y el `tx` de la transacción, con lo mínimo para que corra. */
  function given(prospect = {}) {
    prisma.backlinkProspect.findFirst.mockResolvedValue({
      id: 5, domain: 'diario.com', domainRating: 62, traffic: 12500, language: null, backlinkId: null, ...prospect,
    })
    const tx = {
      backlink:         { upsert: jest.fn(async a => ({ id: 9, ...a.create })) },
      backlinkProspect: { update: jest.fn(async () => ({ competitors: '[]', pipelineStatus: 'conseguido', backlinkId: 9 })) },
    }
    prisma.$transaction.mockImplementation(fn => fn(tx))
    return tx
  }

  const ctx = { projectId: 7, workspaceId: 1, author: {} }

  it('sin la URL de la página, el enlace nace FUERA de la verificación automática', async () => {
    // El verificador chequearía la home del sitio y daría "perdido" en casi todas:
    // el mismo motivo por el que existe `verifiable: false` para las filas de GSC.
    const tx = given()
    await promoteProspect({ ...ctx, prospectId: 5, link: {} })
    expect(tx.backlink.upsert.mock.calls[0][0].create).toMatchObject({
      sourceUrl: 'https://diario.com', verifiable: false,
    })
  })

  it('con la URL concreta, sí entra a la verificación', async () => {
    const tx = given()
    await promoteProspect({ ...ctx, prospectId: 5, link: { sourceUrl: 'https://diario.com/nos-mencionan' } })
    expect(tx.backlink.upsert.mock.calls[0][0].create).toMatchObject({
      sourceUrl: 'https://diario.com/nos-mencionan', verifiable: true,
    })
  })

  it('NUNCA usa el exampleUrl del prospecto como origen del enlace', async () => {
    // Esa es la página donde el sitio enlaza al COMPETIDOR. Usarla registraría un
    // enlace que no existe, y el verificador lo marcaría perdido en el primer chequeo.
    const tx = given({ exampleUrl: 'https://diario.com/nota-del-rival' })
    await promoteProspect({ ...ctx, prospectId: 5, link: {} })
    expect(tx.backlink.upsert.mock.calls[0][0].create.sourceUrl).not.toContain('nota-del-rival')
  })

  it('el enlace hereda lo que ya sabíamos del dominio', async () => {
    const tx = given()
    await promoteProspect({ ...ctx, prospectId: 5, link: {} })
    expect(tx.backlink.upsert.mock.calls[0][0].create).toMatchObject({
      domainRating: 62, traffic: 12500, source: 'prospect',
    })
  })

  it('vincular un enlace que ya existía NO pisa su anchor ni su tipo', async () => {
    // El camino real es "lo cargué a mano y después cerré la oportunidad": lo que
    // alguien escribió mirando la página vale más que lo que se declara acá.
    const tx = given()
    await promoteProspect({ ...ctx, prospectId: 5, link: { sourceUrl: 'https://diario.com/x', anchor: 'otro' } })
    const call = tx.backlink.upsert.mock.calls[0][0]
    expect(Object.keys(call.update)).toEqual(expect.not.arrayContaining(['anchor', 'linkType', 'placement']))
  })

  it('cierra la oportunidad en la MISMA transacción que crea el enlace', async () => {
    // Si no, un fallo en el medio dejaba un enlace creado con la oportunidad abierta.
    const tx = given()
    await promoteProspect({ ...ctx, prospectId: 5, link: {} })
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(tx.backlinkProspect.update.mock.calls[0][0].data).toMatchObject({ pipelineStatus: 'conseguido', backlinkId: 9 })
  })

  it('NO escribe "ya lo tenemos": ese hecho lo pone sólo el cruce', async () => {
    const tx = given()
    await promoteProspect({ ...ctx, prospectId: 5, link: {} })
    expect(Object.keys(tx.backlinkProspect.update.mock.calls[0][0].data))
      .toEqual(expect.not.arrayContaining(['alreadyLinked', 'alreadyLinkedAt']))
  })

  it('promover dos veces devuelve el enlace que ya había, sin crear otro', async () => {
    given({ backlinkId: 9 })
    prisma.backlink.findFirst.mockResolvedValue({ id: 9, sourceUrl: 'https://diario.com/x' })
    const out = await promoteProspect({ ...ctx, prospectId: 5, link: {} })
    expect(out).toMatchObject({ alreadyPromoted: true, backlink: { id: 9 } })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('si el enlace que había se borró, se puede volver a promover', async () => {
    // El FK quedó en SetNull, así que la fila apunta a un id que ya no existe.
    const tx = given({ backlinkId: 9 })
    prisma.backlink.findFirst.mockResolvedValue(null)
    await promoteProspect({ ...ctx, prospectId: 5, link: {} })
    expect(tx.backlink.upsert).toHaveBeenCalled()
  })

  it('un prospecto de otro proyecto no se puede promover', async () => {
    prisma.backlinkProspect.findFirst.mockResolvedValue(null)
    expect(await promoteProspect({ ...ctx, prospectId: 5, link: {} })).toEqual({ notFound: true })
  })
})

describe('el tablero de oportunidades — qué filas trae', () => {
  it('la vista pipeline NO filtra por alreadyLinked', async () => {
    // Con el filtro, promover hacía desaparecer la fila justo cuando mostraba el
    // resultado: la etapa "Conseguido" quedaba siempre vacía.
    const { listProspects } = require('../../src/services/backlinkProspects.service')
    prisma.backlinkProspect.findMany.mockResolvedValue([])
    prisma.backlinkProspect.count.mockResolvedValue(0)
    prisma.backlinkProspect.groupBy = jest.fn().mockResolvedValue([])

    await listProspects({ projectId: 7, workspaceId: 1, verdict: 'conseguible', view: 'pipeline' })
    const where = prisma.backlinkProspect.findMany.mock.calls[0][0].where
    expect(where.alreadyLinked).toBeUndefined()
    expect(where.verdict).toBeUndefined()
    // Lo conseguible MÁS lo que alguien ya empezó a trabajar.
    expect(where.AND).toEqual([{ OR: [{ verdict: 'conseguible' }, { pipelineStatus: { not: 'sin_empezar' } }] }])
  })

  it('el filtro "conseguible" de Competencia sí excluye lo que ya tenemos', async () => {
    const { listProspects } = require('../../src/services/backlinkProspects.service')
    prisma.backlinkProspect.findMany.mockResolvedValue([])
    prisma.backlinkProspect.count.mockResolvedValue(0)
    prisma.backlinkProspect.groupBy = jest.fn().mockResolvedValue([])

    await listProspects({ projectId: 7, workspaceId: 1, verdict: 'conseguible' })
    expect(prisma.backlinkProspect.findMany.mock.calls[0][0].where).toMatchObject({
      verdict: 'conseguible', alreadyLinked: false,
    })
  })
})
