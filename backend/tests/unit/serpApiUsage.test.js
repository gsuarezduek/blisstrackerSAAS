jest.mock('../../src/lib/prisma', () => ({
  serpSnapshot:   { groupBy: jest.fn() },
  contentGap:     { groupBy: jest.fn() },
  contentBrief:   { groupBy: jest.fn() },
  workspace:      { findMany: jest.fn() },
  trackedKeyword: { count: jest.fn() },
  project:        { findMany: jest.fn() },
}))
jest.mock('axios')

const group = (rows) => rows.map(([workspaceId, projectId, n]) => ({ workspaceId, projectId, _count: { _all: n } }))

// El controller cachea la lectura de la cuenta 5 min en una variable de módulo
// (a propósito: el panel no tiene que pegarle a SerpAPI en cada render). Por eso
// cada test se corre sobre una instancia FRESCA del módulo, o el primero que
// cachea un éxito le tapa la respuesta a todos los demás.
let axios, prisma, getSerpApiUsage

/** Corre el handler y devuelve el body que mandó a res.json. */
async function call() {
  let body
  await getSerpApiUsage({}, { json: d => { body = d } }, err => { throw err })
  return body
}

beforeEach(() => {
  jest.resetModules()
  axios  = require('axios')
  prisma = require('../../src/lib/prisma')
  ;({ getSerpApiUsage } = require('../../src/controllers/superadmin/serpApiUsage.controller'))

  process.env.SERP_API_KEY = 'test-key'
  prisma.serpSnapshot.groupBy.mockResolvedValue([])
  prisma.contentGap.groupBy.mockResolvedValue([])
  prisma.contentBrief.groupBy.mockResolvedValue([])
  prisma.workspace.findMany.mockResolvedValue([{ id: 1, name: 'Bliss', slug: 'bliss' }])
  prisma.trackedKeyword.count.mockResolvedValue(0)
  prisma.project.findMany.mockResolvedValue([{ id: 7, name: 'Cliente A' }])
  axios.get.mockResolvedValue({ data: { plan_name: 'Free Plan', searches_per_month: 250, this_month_usage: 10, total_searches_left: 240 } })
})

describe('SerpAPI — la cuota de la cuenta', () => {
  it('devuelve plan, límite y lo que queda', async () => {
    const { account } = await call()
    expect(account).toMatchObject({ configured: true, plan: 'Free Plan', searchesPerMonth: 250, totalSearchesLeft: 240, error: null })
  })

  it('sin SERP_API_KEY no llama a SerpAPI y lo dice', async () => {
    delete process.env.SERP_API_KEY
    const { account } = await call()
    expect(account).toEqual({ configured: false, error: 'NOT_CONFIGURED' })
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('una key rechazada se distingue de un fallo del servicio', async () => {
    // Importa la diferencia: UNAUTHORIZED manda a revisar la credencial, UPSTREAM
    // a esperar. Mismo criterio que ahrefs.service.js.
    axios.get.mockRejectedValueOnce({ response: { status: 401 } })
    expect((await call()).account.error).toBe('UNAUTHORIZED')
  })

  it('un 500 del proveedor es UPSTREAM', async () => {
    axios.get.mockRejectedValueOnce({ response: { status: 500 } })
    expect((await call()).account.error).toBe('UPSTREAM')
  })

  it('un fallo de la cuenta no tira abajo la atribución, que sale de nuestra base', async () => {
    axios.get.mockRejectedValueOnce({ response: { status: 500 } })
    prisma.serpSnapshot.groupBy.mockResolvedValue(group([[1, 7, 4]]))
    const body = await call()
    expect(body.account.error).toBe('UPSTREAM')
    expect(body.consumption.total).toBe(4)
  })
})

describe('SerpAPI — caché de la lectura de la cuenta', () => {
  it('una segunda lectura seguida no vuelve a pegarle a SerpAPI', async () => {
    await call()
    await call()
    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('pero un error NO se cachea: el botón "Actualizar" tiene que poder reintentar', async () => {
    axios.get.mockRejectedValueOnce({ response: { status: 500 } })
    expect((await call()).account.error).toBe('UPSTREAM')
    expect((await call()).account.error).toBeNull()   // el reintento sale bien
    expect(axios.get).toHaveBeenCalledTimes(2)
  })
})

describe('SerpAPI — atribución de nuestro consumo', () => {
  it('suma las tres fuentes que gastan búsquedas', async () => {
    prisma.serpSnapshot.groupBy.mockResolvedValue(group([[1, 7, 12]]))
    prisma.contentGap.groupBy.mockResolvedValue(group([[1, 7, 2]]))
    prisma.contentBrief.groupBy.mockResolvedValue(group([[1, 7, 1]]))
    const { consumption } = await call()
    expect(consumption.bySource).toEqual({ keywords: 12, contentGap: 2, contentBrief: 1 })
    expect(consumption.total).toBe(15)
  })

  it('agrupa por proyecto y ordena por consumo descendente', async () => {
    prisma.project.findMany.mockResolvedValue([{ id: 7, name: 'Cliente A' }, { id: 8, name: 'Cliente B' }])
    prisma.serpSnapshot.groupBy.mockResolvedValue(group([[1, 7, 3], [1, 8, 20]]))
    const { consumption } = await call()
    expect(consumption.byProject.map(r => r.projectName)).toEqual(['Cliente B', 'Cliente A'])
    expect(consumption.byProject[0]).toMatchObject({ total: 20, workspaceName: 'Bliss' })
  })

  it('un mismo proyecto con consumo de varias fuentes es UNA fila', async () => {
    prisma.serpSnapshot.groupBy.mockResolvedValue(group([[1, 7, 5]]))
    prisma.contentGap.groupBy.mockResolvedValue(group([[1, 7, 3]]))
    const { consumption } = await call()
    expect(consumption.byProject).toHaveLength(1)
    expect(consumption.byProject[0]).toMatchObject({ keywords: 5, contentGap: 3, total: 8 })
  })

  it('informa lo que va a costar el próximo cron: 1 búsqueda por keyword trackeada', async () => {
    // Es la proyección que permite decidir antes de quedarse sin cuota a mitad de mes.
    prisma.trackedKeyword.count.mockResolvedValue(47)
    expect((await call()).consumption.weeklyCronCost).toBe(47)
  })

  it('sin consumo devuelve la estructura vacía, no null', async () => {
    const { consumption } = await call()
    expect(consumption).toMatchObject({ total: 0, byProject: [], bySource: { keywords: 0, contentGap: 0, contentBrief: 0 } })
  })

  it('un workspace que ya no existe no rompe la fila', async () => {
    prisma.workspace.findMany.mockResolvedValue([])
    prisma.serpSnapshot.groupBy.mockResolvedValue(group([[99, 7, 1]]))
    expect((await call()).consumption.byProject[0].workspaceName).toBe('#99')
  })
})
