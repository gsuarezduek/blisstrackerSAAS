jest.mock('../../src/lib/prisma', () => ({
  backlink:         { findMany: jest.fn() },
  backlinkProspect: { count: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
}))

const prisma = require('../../src/lib/prisma')
const {
  syncProspectOwnership, syncOwnershipQuietly, buildProspectData, shapeProspect, OWNED_STATUSES,
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
