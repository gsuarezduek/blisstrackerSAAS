jest.mock('../../src/lib/prisma', () => ({
  backlinkJob:      { create: jest.fn(), update: jest.fn() },
  backlinkProspect: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
  project:          { findUnique: jest.fn() },
  projectBrief:     { findUnique: jest.fn() },
}))
jest.mock('../../src/lib/claude', () => ({
  createMessage:  jest.fn(),
  hasTokenBudget: jest.fn(),
}))

const prisma = require('../../src/lib/prisma')
const { createMessage, hasTokenBudget } = require('../../src/lib/claude')
const {
  buildClassifyPrompt, parseClassification, candidateWhere, runClassification,
  failureMessage, BATCH_SIZE, MAX_PROSPECTS_PER_RUN, MODEL,
} = require('../../src/services/backlinkClassifier.service')

const item = (over = {}) => ({
  id: 1, domain: 'diario.com', competitors: '[{"domain":"compA.com","links":4}]',
  linksToCompetitors: 4, domainRating: 62, traffic: 12500,
  exampleAnchor: null, language: null, ...over,
})

/** Una respuesta del modelo con el texto que le pasemos. */
const reply = text => ({ content: [{ text }], usage: { input_tokens: 100, output_tokens: 50 } })

/** El último estado con el que se cerró el job. */
const finalJob = () => {
  const calls = prisma.backlinkJob.update.mock.calls.filter(c => ['completed', 'failed'].includes(c[0].data.status))
  return calls.length ? calls[calls.length - 1][0].data : null
}

beforeEach(() => {
  jest.clearAllMocks()
  hasTokenBudget.mockResolvedValue(true)
  prisma.backlinkJob.update.mockResolvedValue({})
  prisma.project.findUnique.mockResolvedValue({ name: 'Acme', websiteUrl: 'https://acme.com' })
  prisma.projectBrief.findUnique.mockResolvedValue(null)
  prisma.backlinkProspect.updateMany.mockResolvedValue({ count: 1 })
})

describe('clasificación IA — qué filas se le mandan', () => {
  it('nunca manda las que ya tenemos: la pregunta ya tiene respuesta', () => {
    expect(candidateWhere({ projectId: 1, workspaceId: 2 }).alreadyLinked).toBe(false)
  })

  it('nunca manda las corregidas a mano, ni con rerun', () => {
    // El candado va en los DOS lados: el where de los candidatos y el de la
    // escritura. Acá se afirma el primero.
    expect(candidateWhere({ projectId: 1, workspaceId: 2 }).verdictLockedAt).toBeNull()
    expect(candidateWhere({ projectId: 1, workspaceId: 2, rerun: true }).verdictLockedAt).toBeNull()
  })

  it('sin rerun sólo las sin evaluar; con rerun, también las que ya opinó la IA', () => {
    expect(candidateWhere({ projectId: 1, workspaceId: 2 }).verdict).toBe('sin_evaluar')
    expect(candidateWhere({ projectId: 1, workspaceId: 2, rerun: true }).verdict).toBeUndefined()
  })
})

describe('clasificación IA — el prompt', () => {
  it('dice cuál es NUESTRO dominio', () => {
    // Sin eso el modelo propone conseguir un enlace de nuestro propio sitio, que
    // es el error fácil cuando una fila del export de un competidor es nuestra.
    const p = buildClassifyPrompt({ items: [item()], projectName: 'Acme', ownDomain: 'acme.com', briefText: null })
    expect(p).toContain('acme.com')
    expect(p).toContain('Acme')
  })

  it('lleva la evidencia de cada dominio: a quién enlaza y con cuántas páginas', () => {
    const p = buildClassifyPrompt({ items: [item()], projectName: 'Acme', ownDomain: 'acme.com', briefText: null })
    expect(p).toContain('diario.com')
    expect(p).toContain('DR 62')
    expect(p).toContain('4 página(s) enlazando a competidores')
    expect(p).toContain('compA.com')
  })

  it('dice "s/d" en vez de 0 cuando el dato falta', () => {
    // Un DR desconocido no es un DR de cero: escribir 0 le diría al modelo que el
    // dominio no tiene autoridad, que es una afirmación que nadie hizo.
    const p = buildClassifyPrompt({ items: [item({ domainRating: null, traffic: null })], projectName: 'Acme', ownDomain: null, briefText: null })
    expect(p).toContain('DR s/d')
    expect(p).toContain('tráfico s/d')
  })

  it('suma el brief del cliente cuando está cargado', () => {
    // El mismo medio es conseguible para una agencia con prensa y no para un
    // e-commerce nuevo: el contexto de quién pregunta es lo que decide.
    const p = buildClassifyPrompt({ items: [item()], projectName: 'Acme', ownDomain: 'acme.com', briefText: 'Alquiler de autos en Mendoza' })
    expect(p).toContain('Alquiler de autos en Mendoza')
  })

  it('pide los tres veredictos y ninguno más', () => {
    const p = buildClassifyPrompt({ items: [item()], projectName: 'Acme', ownDomain: null, briefText: null })
    for (const v of ['conseguible', 'no_conseguible', 'no_vale_la_pena']) expect(p).toContain(v)
    // "ya lo tenemos" es un hecho del cruce, no algo que la IA pueda opinar.
    expect(p).not.toContain('ya_lo_tenemos')
  })
})

describe('clasificación IA — qué de la respuesta se puede escribir', () => {
  const allowed = ['diario.com', 'blog.org']

  it('descarta un dominio que no estaba en el lote', () => {
    // Es el filtro central: sin él, una alucinación escribiría una decisión sobre
    // una fila que nadie pidió evaluar.
    const out = parseClassification(JSON.stringify({ verdicts: [
      { domain: 'diario.com', verdict: 'conseguible', reason: 'ok' },
      { domain: 'inventado.com', verdict: 'conseguible', reason: 'no existe' },
    ] }), allowed)
    expect(out.map(v => v.domain)).toEqual(['diario.com'])
  })

  it('descarta un veredicto fuera del enum', () => {
    const out = parseClassification(JSON.stringify({ verdicts: [{ domain: 'diario.com', verdict: 'quizás', reason: 'x' }] }), allowed)
    expect(out).toEqual([])
  })

  it('descarta "ya_lo_tenemos" y "sin_evaluar"', () => {
    // El primero es un hecho del cruce automático; el segundo sería gastar tokens
    // para dejar la fila como estaba.
    const out = parseClassification(JSON.stringify({ verdicts: [
      { domain: 'diario.com', verdict: 'ya_lo_tenemos', reason: 'x' },
      { domain: 'blog.org',   verdict: 'sin_evaluar',   reason: 'x' },
    ] }), allowed)
    expect(out).toEqual([])
  })

  it('tolera la coma colgante que a veces deja el modelo', () => {
    const out = parseClassification('{"verdicts":[{"domain":"diario.com","verdict":"conseguible","reason":"ok"},]}', allowed)
    expect(out).toHaveLength(1)
  })

  it('tolera el bloque de markdown alrededor del JSON', () => {
    const out = parseClassification('```json\n{"verdicts":[{"domain":"blog.org","verdict":"no_vale_la_pena","reason":"sin tráfico"}]}\n```', allowed)
    expect(out[0]).toMatchObject({ domain: 'blog.org', verdict: 'no_vale_la_pena' })
  })

  it('una respuesta que no es JSON devuelve lista vacía, no explota el job', () => {
    expect(parseClassification('Perdón, no puedo ayudarte con eso.', allowed)).toEqual([])
    expect(parseClassification('', allowed)).toEqual([])
  })

  it('normaliza el www y las mayúsculas con las que el modelo escribe el dominio', () => {
    const out = parseClassification(JSON.stringify({ verdicts: [{ domain: 'WWW.Diario.com', verdict: 'conseguible', reason: 'ok' }] }), allowed)
    expect(out[0].domain).toBe('diario.com')
  })

  it('un dominio repetido en la respuesta se toma una sola vez', () => {
    const out = parseClassification(JSON.stringify({ verdicts: [
      { domain: 'diario.com', verdict: 'conseguible', reason: 'primera' },
      { domain: 'diario.com', verdict: 'no_conseguible', reason: 'segunda' },
    ] }), allowed)
    expect(out).toHaveLength(1)
    expect(out[0].reason).toBe('primera')
  })

  it('recorta la razón a 300 chars y deja null si viene vacía', () => {
    const long = parseClassification(JSON.stringify({ verdicts: [{ domain: 'diario.com', verdict: 'conseguible', reason: 'x'.repeat(400) }] }), allowed)
    expect(long[0].reason).toHaveLength(300)
    const empty = parseClassification(JSON.stringify({ verdicts: [{ domain: 'diario.com', verdict: 'conseguible', reason: '  ' }] }), allowed)
    expect(empty[0].reason).toBeNull()
  })
})

describe('clasificación IA — la corrida', () => {
  it('sin presupuesto el job termina failed con el mensaje del límite, sin llamar a la IA', async () => {
    // Y no con un 429 crudo ni un job colgado en "running": lo que ve la pantalla
    // tiene que explicar por qué no se hizo.
    hasTokenBudget.mockResolvedValue(false)
    await runClassification(1, 2, 7)
    expect(createMessage).not.toHaveBeenCalled()
    expect(finalJob()).toMatchObject({ status: 'failed', errorMsg: 'Límite mensual de tokens de IA alcanzado.' })
  })

  it('60 dominios se mandan en 3 llamadas', async () => {
    const items = Array.from({ length: 60 }, (_, i) => item({ id: i + 1, domain: `d${i}.com` }))
    prisma.backlinkProspect.findMany.mockResolvedValue(items)
    createMessage.mockResolvedValue(reply('{"verdicts":[]}'))

    await runClassification(1, 2, 7)
    expect(createMessage).toHaveBeenCalledTimes(Math.ceil(60 / BATCH_SIZE))
    expect(finalJob()).toMatchObject({ status: 'completed', checked: 60 })
  })

  it('topea la corrida para que un export enorme no se coma el presupuesto de un click', async () => {
    prisma.backlinkProspect.findMany.mockResolvedValue([])
    await runClassification(1, 2, 7)
    expect(prisma.backlinkProspect.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: MAX_PROSPECTS_PER_RUN }),
    )
    expect(MAX_PROSPECTS_PER_RUN / BATCH_SIZE).toBeLessThanOrEqual(6)
  })

  it('usa Haiku: es clasificación estructurada, no redacción', async () => {
    prisma.backlinkProspect.findMany.mockResolvedValue([item()])
    createMessage.mockResolvedValue(reply('{"verdicts":[]}'))
    await runClassification(1, 2, 7)
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODEL }),
      expect.objectContaining({ workspaceId: 2, source: 'backlinkClassify' }),
    )
  })

  it('escribe con compare-and-set: el candado va en el WHERE, no en una lectura previa', async () => {
    // Los jobs tardan minutos. Si alguien corrige esa fila mientras la corrida
    // está en curso, la escritura tiene que ser un no-op y no un pisotón.
    prisma.backlinkProspect.findMany.mockResolvedValue([item()])
    createMessage.mockResolvedValue(reply('{"verdicts":[{"domain":"diario.com","verdict":"conseguible","reason":"acepta guest posts"}]}'))

    await runClassification(1, 2, 7)
    expect(prisma.backlinkProspect.updateMany).toHaveBeenCalledWith({
      where: { id: 1, projectId: 7, workspaceId: 2, verdictLockedAt: null, alreadyLinked: false },
      data:  expect.objectContaining({ verdict: 'conseguible', verdictSource: 'ai', verdictReason: 'acepta guest posts' }),
    })
  })

  it('cuenta los veredictos que ENTRARON, no los que propuso el modelo', async () => {
    // `updateMany` devuelve 0 cuando el candado lo frenó: el job reporta ese
    // número, que es el honesto.
    prisma.backlinkProspect.findMany.mockResolvedValue([item()])
    prisma.backlinkProspect.updateMany.mockResolvedValue({ count: 0 })
    createMessage.mockResolvedValue(reply('{"verdicts":[{"domain":"diario.com","verdict":"conseguible","reason":"x"}]}'))

    await runClassification(1, 2, 7)
    expect(finalJob()).toMatchObject({ status: 'completed', checked: 1, changed: 0 })
  })

  it('registra los tokens gastados en el job', async () => {
    prisma.backlinkProspect.findMany.mockResolvedValue([item()])
    createMessage.mockResolvedValue(reply('{"verdicts":[]}'))
    await runClassification(1, 2, 7)
    expect(finalJob().tokensUsed).toBe(150)
  })

  it('sin nada que evaluar cierra completed en cero, sin llamar a la IA', async () => {
    prisma.backlinkProspect.findMany.mockResolvedValue([])
    await runClassification(1, 2, 7)
    expect(createMessage).not.toHaveBeenCalled()
    expect(finalJob()).toMatchObject({ status: 'completed', checked: 0, changed: 0 })
  })

  it('una key de IA inválida se explica como problema del SERVIDOR, no del usuario', async () => {
    // Sin esto el job mostraba el cuerpo crudo de Anthropic
    // (`401 {"type":"error",...,"invalid x-api-key"}`), que no le dice nada a quien
    // apretó el botón y suena a que hizo algo mal. Lo encontró la verificación
    // contra la API real, con la key del .env local vencida.
    prisma.backlinkProspect.findMany.mockResolvedValue([item()])
    const err = new Error('401 {"type":"error","error":{"message":"invalid x-api-key"}}')
    err.status = 401
    createMessage.mockRejectedValue(err)

    await runClassification(1, 2, 7)
    expect(finalJob().errorMsg).toMatch(/API key de IA de este servidor no es válida/)
    expect(finalJob().errorMsg).not.toMatch(/x-api-key/)
  })

  it('un rate limit de Anthropic NO se confunde con el presupuesto propio', async () => {
    // Son dos problemas distintos con dos acciones distintas: uno se arregla
    // subiendo el cupo en SuperAdmin, el otro esperando. Mandar a alguien a
    // revisar su cupo por una sobrecarga de Anthropic es hacerle perder el tiempo.
    expect(failureMessage({ status: 429 })).toMatch(/sobrecargado/)
    expect(failureMessage({ status: 429, code: 'TOKEN_BUDGET_EXCEEDED' })).toMatch(/Límite mensual/)
    expect(failureMessage({ status: 529 })).toMatch(/sobrecargado/)
    expect(failureMessage({ status: 500 })).toMatch(/sobrecargado/)
  })

  it('si el presupuesto se agota a mitad de la corrida, el job lo dice con el mismo mensaje', async () => {
    // Para quien mira la pantalla es la misma cosa que el gate de arranque, y
    // `createMessage` corta en el batch donde se cruzó el límite en vez de gastar
    // los seis.
    prisma.backlinkProspect.findMany.mockResolvedValue([item()])
    const err = new Error('Límite excedido')
    err.code = 'TOKEN_BUDGET_EXCEEDED'
    createMessage.mockRejectedValue(err)

    await runClassification(1, 2, 7)
    expect(finalJob()).toMatchObject({ status: 'failed', errorMsg: 'Límite mensual de tokens de IA alcanzado.' })
  })

  it('un error inesperado deja el job failed con el motivo, no colgado en running', async () => {
    prisma.backlinkProspect.findMany.mockRejectedValue(new Error('DB caída'))
    await runClassification(1, 2, 7)
    expect(finalJob()).toMatchObject({ status: 'failed', errorMsg: 'DB caída' })
  })
})
