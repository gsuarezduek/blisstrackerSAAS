// Inventario SEO del blog: la tabla, el refresco contra Search Console, la
// importación inicial del sitio y el vínculo entre traducciones.
jest.mock('../../src/lib/prisma', () => ({
  workspace:           { findUnique: jest.fn() },
  workspaceMember:     { findUnique: jest.fn(), findMany: jest.fn() },
  projectMember:       { findUnique: jest.fn(), findMany: jest.fn() },
  project:             { findFirst: jest.fn(), findUnique: jest.fn() },
  featureFlag:         { findUnique: jest.fn() },
  contentPiece:        { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  contentPieceSeoStat: { findFirst: jest.fn(), deleteMany: jest.fn(), upsert: jest.fn() },
  contentStatusEvent:  { create: jest.fn(), createMany: jest.fn() },
  projectIntegration:  { findUnique: jest.fn() },
  cannibalResolution:  { findMany: jest.fn() },
  projectClientPortal: { findUnique: jest.fn() },
  clientPortalContact: { findMany: jest.fn() },
  contentAsset:        { groupBy: jest.fn() },
}))
jest.mock('../../src/services/googleSearchConsole.service', () => ({
  querySearchConsole: jest.fn(),
  fetchSearchConsoleData: jest.fn(),
  fetchQueryPages: jest.fn(),
  clearCache: jest.fn(),
}))
jest.mock('../../src/services/tokenRefresh.service', () => ({
  getValidAccessToken: jest.fn().mockResolvedValue('tok'),
}))
jest.mock('../../src/lib/safeUrl', () => ({
  assertPublicUrl: jest.fn().mockResolvedValue(undefined),
  fetchPublicUrl:  jest.fn(),
  isPrivateIp:     jest.fn(() => false),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const { querySearchConsole } = require('../../src/services/googleSearchConsole.service')
const { fetchPublicUrl } = require('../../src/lib/safeUrl')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 7
const BASE           = `/api/contenido/projects/${PROJECT_ID}`

function req(method, url, role = 'admin') {
  const token = jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Ana', email: 'a@t.com' },
    SECRET,
  )
  return request(app)[method](url).set('Authorization', `Bearer ${token}`).set('X-Workspace', WORKSPACE_SLUG)
}

function mockBase({ workspaceRole = 'admin' } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]',
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role: workspaceRole, active: true }],
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: workspaceRole, active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'contenido', enabledGlobally: true, enabledWorkspaceIds: '[]' })
  prisma.project.findFirst.mockResolvedValue({
    id: PROJECT_ID, timezone: 'America/Argentina/Buenos_Aires', websiteUrl: 'https://mdz.com',
  })
  prisma.project.findUnique.mockResolvedValue({ isPrivate: false })
  prisma.projectMember.findUnique.mockResolvedValue({ projectId: PROJECT_ID, userId: 1 })
  prisma.projectMember.findMany.mockResolvedValue([])
  prisma.workspaceMember.findMany.mockResolvedValue([])
  prisma.projectClientPortal.findUnique.mockResolvedValue(null)
  prisma.cannibalResolution.findMany.mockResolvedValue([])
  prisma.contentPieceSeoStat.deleteMany.mockResolvedValue({ count: 0 })
  prisma.contentPieceSeoStat.findFirst.mockResolvedValue(null)
  prisma.contentPieceSeoStat.upsert.mockResolvedValue({})
  prisma.contentStatusEvent.createMany.mockResolvedValue({ count: 0 })
}

const stat = (over = {}) => ({
  matchedUrl: 'mdz.com/blog/a', periodStart: '2026-10-10', periodEnd: '2026-11-06',
  clicks: 80, impressions: 2000, ctr: 0.04, position: 4.2,
  prevClicks: 100, prevImpressions: 1900, prevCtr: 0.052, prevPosition: 3.1,
  topQueries: '[]', alerts: '[]', fetchedAt: new Date(), ...over,
})

const row = (over = {}) => ({
  id: 10, title: 'Alquiler de autos', status: 'publicado', language: 'es',
  publishedUrl: 'https://mdz.com/blog/a', publishedAt: new Date('2026-01-05'), scheduledDate: '2026-01-05',
  seoKeyword: 'alquiler de autos', seoKeywords: '[]', translationGroupId: null,
  owner: null, seoStat: stat(), ...over,
})

beforeEach(() => jest.clearAllMocks())

describe('GET /seo/inventory', () => {
  it('devuelve las notas con sus métricas y la variación ya calculada', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([row()])
    prisma.projectIntegration.findUnique.mockResolvedValue({ status: 'active' })

    const res = await req('get', `${BASE}/seo/inventory`)
    expect(res.status).toBe(200)
    expect(res.body.searchConsole).toBe('active')
    expect(res.body.period).toEqual({ start: '2026-10-10', end: '2026-11-06' })

    const [note] = res.body.pieces
    expect(note.seo.clicks).toBe(80)
    expect(note.seo.delta.clicks).toBe(-20) // 100 → 80
    // La posición se informa en posiciones y con el signo dado vuelta: bajar de
    // la 3.1 a la 4.2 es -1.1, no "+35%".
    expect(note.seo.delta.position).toBe(-1.1)
    expect(note.trend).toBe('baja')
  })

  it('sólo entran las piezas con URL publicada — eso es el inventario', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([])
    prisma.projectIntegration.findUnique.mockResolvedValue({ status: 'active' })

    await req('get', `${BASE}/seo/inventory`)
    expect(prisma.contentPiece.findMany.mock.calls[0][0].where.publishedUrl).toEqual({ not: null })
  })

  it('avisa que Search Console no está conectado en vez de mostrar ceros', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([row({ seoStat: null })])
    prisma.projectIntegration.findUnique.mockResolvedValue(null)

    const res = await req('get', `${BASE}/seo/inventory`)
    expect(res.body.searchConsole).toBe('missing')
    expect(res.body.pieces[0].seo).toBeNull()
    expect(res.body.pieces[0].trend).toBe('nuevo')
  })

  it('filtra "sin idioma", que es justo lo que hay que completar', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([])
    prisma.projectIntegration.findUnique.mockResolvedValue({ status: 'active' })

    await req('get', `${BASE}/seo/inventory?language=none`)
    expect(prisma.contentPiece.findMany.mock.calls[0][0].where.language).toBeNull()
  })

  it('filtra por tendencia y por "sólo con alertas"', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([
      row({ id: 1, seoStat: stat({ clicks: 150, prevClicks: 100 }) }),                            // sube, sin alertas
      row({ id: 2, seoStat: stat({ clicks: 10, prevClicks: 100, alerts: '[{"code":"losing_traffic","severity":"critical","message":"x"}]' }) }),
    ])
    prisma.projectIntegration.findUnique.mockResolvedValue({ status: 'active' })

    const subiendo = await req('get', `${BASE}/seo/inventory?trend=sube`)
    expect(subiendo.body.pieces.map(p => p.id)).toEqual([1])

    const conAlertas = await req('get', `${BASE}/seo/inventory?alert=1`)
    expect(conAlertas.body.pieces.map(p => p.id)).toEqual([2])
    // El conteo del encabezado se calcula sobre lo filtrado, no sobre el total.
    expect(conAlertas.body.counts.withAlerts).toBe(1)
  })

  it('ordena por clics de mayor a menor por default, y deja al final lo que no se midió', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([
      row({ id: 1, seoStat: stat({ clicks: 5 }) }),
      row({ id: 2, seoStat: null }),
      row({ id: 3, seoStat: stat({ clicks: 90 }) }),
    ])
    prisma.projectIntegration.findUnique.mockResolvedValue({ status: 'active' })

    const res = await req('get', `${BASE}/seo/inventory`)
    expect(res.body.pieces.map(p => p.id)).toEqual([3, 1, 2])
  })

  it('ordenar por posición pone PRIMERO la mejor (la 2 antes que la 30)', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([
      row({ id: 1, seoStat: stat({ position: 30 }) }),
      row({ id: 2, seoStat: stat({ position: 2 }) }),
    ])
    prisma.projectIntegration.findUnique.mockResolvedValue({ status: 'active' })

    const res = await req('get', `${BASE}/seo/inventory?sort=position`)
    expect(res.body.pieces.map(p => p.id)).toEqual([2, 1])
  })

  it('trae las traducciones de cada nota en un solo query, sin incluirse a sí misma', async () => {
    mockBase()
    prisma.contentPiece.findMany
      .mockResolvedValueOnce([row({ id: 10, translationGroupId: 'tg-1' })])
      .mockResolvedValueOnce([
        { id: 10, title: 'Alquiler de autos', language: 'es', publishedUrl: 'https://mdz.com/blog/a', status: 'publicado', translationGroupId: 'tg-1' },
        { id: 11, title: 'Car rental',        language: 'en', publishedUrl: 'https://mdz.com/en/blog/a', status: 'publicado', translationGroupId: 'tg-1' },
      ])
    prisma.projectIntegration.findUnique.mockResolvedValue({ status: 'active' })

    const res = await req('get', `${BASE}/seo/inventory`)
    expect(res.body.pieces[0].translations).toEqual([
      { id: 11, title: 'Car rental', language: 'en', publishedUrl: 'https://mdz.com/en/blog/a', status: 'publicado' },
    ])
  })
})

describe('POST /seo/refresh', () => {
  it('pide dos ventanas de 28 días + las consultas por página, y guarda una fila por nota', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([
      { id: 10, title: 'A', publishedUrl: 'https://mdz.com/blog/a', seoKeyword: 'alquiler', seoKeywords: '[]' },
      { id: 11, title: 'B', publishedUrl: 'https://mdz.com/blog/b', seoKeyword: null, seoKeywords: '[]' },
    ])
    prisma.projectIntegration.findUnique.mockResolvedValue({ id: 3, status: 'active', propertyId: 'https://mdz.com/' })
    querySearchConsole
      .mockResolvedValueOnce([{ keys: ['https://mdz.com/blog/a/'], clicks: 80, impressions: 2000, ctr: 0.04, position: 4.2 }])
      .mockResolvedValueOnce([{ keys: ['https://mdz.com/blog/a'],  clicks: 100, impressions: 1900, ctr: 0.052, position: 3.1 }])
      .mockResolvedValueOnce([
        { keys: ['https://mdz.com/blog/a', 'alquiler de autos'], clicks: 60, impressions: 900, ctr: 0.066, position: 3 },
        { keys: ['https://mdz.com/blog/a', 'rent a car'],        clicks: 20, impressions: 400, ctr: 0.05,  position: 6 },
      ])

    const res = await req('post', `${BASE}/seo/refresh`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ synced: 2, matched: 1 })

    // Tres queries para todo el blog, no una por nota.
    expect(querySearchConsole).toHaveBeenCalledTimes(3)
    const [, , current] = querySearchConsole.mock.calls[0]
    const [, , prev]    = querySearchConsole.mock.calls[1]
    expect(current.dimensions).toEqual(['page'])
    expect(querySearchConsole.mock.calls[2][2].dimensions).toEqual(['page', 'query'])
    // La ventana anterior termina el día antes de que empiece la actual.
    const dayBefore = new Date(`${current.startDate}T00:00:00Z`)
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
    expect(prev.endDate).toBe(dayBefore.toISOString().slice(0, 10))

    // La nota que matcheó guarda sus consultas; la que no, queda con la fila en
    // cero pero sin `matchedUrl` — "no se midió" no es lo mismo que "0 clics".
    const saved = prisma.contentPieceSeoStat.upsert.mock.calls.map(c => c[0])
    expect(saved[0].create.matchedUrl).toBe('mdz.com/blog/a')
    expect(JSON.parse(saved[0].create.topQueries)).toHaveLength(2)
    expect(saved[1].create.matchedUrl).toBeNull()
    expect(saved[1].create.prevClicks).toBeNull()
  })

  it('la URL con barra final de Search Console matchea la cargada sin barra', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([
      { id: 10, title: 'A', publishedUrl: 'https://MDZ.com/blog/a', seoKeyword: null, seoKeywords: '[]' },
    ])
    prisma.projectIntegration.findUnique.mockResolvedValue({ id: 3, status: 'active', propertyId: 'https://mdz.com/' })
    querySearchConsole
      .mockResolvedValueOnce([{ keys: ['https://mdz.com/blog/a/'], clicks: 7, impressions: 90, ctr: 0.077, position: 8 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await req('post', `${BASE}/seo/refresh`)
    expect(prisma.contentPieceSeoStat.upsert.mock.calls[0][0].create.clicks).toBe(7)
  })

  it('400 NO_SEARCH_CONSOLE si el proyecto no tiene la integración', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([
      { id: 10, title: 'A', publishedUrl: 'https://mdz.com/blog/a', seoKeyword: null, seoKeywords: '[]' },
    ])
    prisma.projectIntegration.findUnique.mockResolvedValue(null)

    const res = await req('post', `${BASE}/seo/refresh`)
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('NO_SEARCH_CONSOLE')
  })

  it('no vuelve a pedirle datos a Google si se refrescó hace un rato (salvo force)', async () => {
    mockBase()
    prisma.contentPieceSeoStat.findFirst.mockResolvedValue({ fetchedAt: new Date() })

    const res = await req('post', `${BASE}/seo/refresh`)
    expect(res.body).toMatchObject({ skipped: true, reason: 'cooldown' })
    expect(querySearchConsole).not.toHaveBeenCalled()
  })

  it('sin notas con URL no se le pega a Search Console', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([])

    const res = await req('post', `${BASE}/seo/refresh`)
    expect(res.body).toMatchObject({ synced: 0 })
    expect(querySearchConsole).not.toHaveBeenCalled()
    // Y la fila de una pieza a la que le sacaron la URL se limpia.
    expect(prisma.contentPieceSeoStat.deleteMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, pieceId: { notIn: [] } },
    })
  })

  it('403 si no es admin ni del equipo del proyecto (consume cuota del cliente)', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await req('post', `${BASE}/seo/refresh`, 'member')
    expect(res.status).toBe(403)
  })
})

describe('POST /seo/import', () => {
  const wpResponse = (posts, totalPages = 1) => ({
    status: 200,
    headers: { 'x-wp-totalpages': String(totalPages) },
    data: posts,
  })

  it('previsualiza sin crear nada', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([])
    fetchPublicUrl.mockResolvedValue(wpResponse([
      { id: 1, link: 'https://mdz.com/blog/a', title: { rendered: 'Nota A' }, date_gmt: '2026-01-05T13:00:00' },
      { id: 2, link: 'https://mdz.com/en/blog/a', title: { rendered: 'Note A' }, date_gmt: '2026-01-05T13:00:00' },
    ]))

    const res = await req('post', `${BASE}/seo/import`).send({ source: 'wordpress', defaultLanguage: 'es', dryRun: true })
    expect(res.status).toBe(200)
    expect(res.body.dryRun).toBe(true)
    expect(res.body.created).toHaveLength(2)
    expect(res.body.created.map(c => c.language)).toEqual(['es', 'en'])
    expect(prisma.contentPiece.create).not.toHaveBeenCalled()
  })

  it('crea las notas como publicadas, con fecha, idioma y mes asignado', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([])
    prisma.contentPiece.create.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }))
    fetchPublicUrl.mockResolvedValue(wpResponse([
      { id: 1, link: 'https://mdz.com/blog/a', title: { rendered: 'Nota A' }, date_gmt: '2026-01-05T13:00:00', lang: 'es' },
    ]))

    const res = await req('post', `${BASE}/seo/import`).send({ source: 'wordpress' })
    expect(res.status).toBe(200)
    const { data } = prisma.contentPiece.create.mock.calls[0][0]
    expect(data).toMatchObject({
      status: 'publicado',
      publishedUrl: 'https://mdz.com/blog/a',
      language: 'es',
      types: '["articulo"]',
      networks: '["blog"]',
    })
    // La fecha de publicación también va al calendario: la navegación de
    // Contenido es por mes, y 65 notas sin fecha serían una pila en "Sin programar".
    expect(data.scheduledDate).toBe('2026-01-05')
    expect(res.body.created).toHaveLength(1)
  })

  it('es idempotente: lo que ya está cargado se saltea (aunque la barra final difiera)', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([{ id: 5, publishedUrl: 'https://mdz.com/blog/a/' }])
    fetchPublicUrl.mockResolvedValue(wpResponse([
      { id: 1, link: 'https://mdz.com/blog/a', title: { rendered: 'Nota A' }, date_gmt: '2026-01-05T13:00:00' },
    ]))

    const res = await req('post', `${BASE}/seo/import`).send({ source: 'wordpress', dryRun: true })
    expect(res.body.created).toHaveLength(0)
    expect(res.body.skipped).toEqual([{ url: 'https://mdz.com/blog/a', reason: 'ya_cargada' }])
    expect(res.body.skippedCount).toBe(1)
  })

  it('filtra por un trozo de URL para no traer las páginas del sitio', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([])
    fetchPublicUrl.mockResolvedValue({
      status: 200,
      headers: {},
      data: `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://mdz.com/blog/alquiler-de-autos</loc></url>
        <url><loc>https://mdz.com/contacto</loc></url>
      </urlset>`,
    })

    const res = await req('post', `${BASE}/seo/import`).send({ source: 'sitemap', filter: '/blog/', dryRun: true })
    expect(res.body.created).toEqual([
      expect.objectContaining({ url: 'https://mdz.com/blog/alquiler-de-autos', title: 'Alquiler de autos' }),
    ])
  })

  it('400 con mensaje accionable si el sitio no tiene la API de WordPress', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([])
    fetchPublicUrl.mockRejectedValue(new Error('404'))

    const res = await req('post', `${BASE}/seo/import`).send({ source: 'wordpress' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('WP_API_UNAVAILABLE')
    expect(res.body.error).toContain('sitemap')
  })

  it('400 NO_SITE_URL si el proyecto no tiene sitio y no se indicó uno', async () => {
    mockBase()
    prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID, timezone: 'America/Argentina/Buenos_Aires', websiteUrl: null })

    const res = await req('post', `${BASE}/seo/import`).send({ source: 'wordpress' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('NO_SITE_URL')
  })
})

describe('PATCH /pieces/:pid — campos SEO', () => {
  const existing = {
    id: 10, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, title: 'A', status: 'publicado',
    types: '[]', networks: '[]', seoKeywords: '[]', language: null, seoKeyword: null,
    tasks: [], assets: [], files: [], comments: [], _count: { comments: 0 },
  }

  it('guarda URL, idioma y keywords, recortando la keyword', async () => {
    mockBase()
    prisma.contentPiece.findFirst.mockResolvedValue(existing)
    prisma.contentPiece.findMany.mockResolvedValue([])
    prisma.contentPiece.update.mockResolvedValue({})

    const res = await req('patch', `${BASE}/pieces/10`).send({
      publishedUrl: 'https://mdz.com/blog/a',
      language: 'en',
      seoKeyword: '  alquiler de autos  ',
      seoKeywords: ['rent a car', 'rent a car', 'autos mendoza'],
    })
    expect(res.status).toBe(200)
    const { data } = prisma.contentPiece.update.mock.calls[0][0]
    expect(data.seoKeyword).toBe('alquiler de autos')
    expect(data.language).toBe('en')
    // Dedup antes del tope: una keyword repetida no gasta dos lugares.
    expect(JSON.parse(data.seoKeywords)).toEqual(['rent a car', 'autos mendoza'])
  })

  it('400 con un idioma fuera del catálogo (guardarlo dejaría la nota sin filtro que la encuentre)', async () => {
    mockBase()
    prisma.contentPiece.findFirst.mockResolvedValue(existing)

    const res = await req('patch', `${BASE}/pieces/10`).send({ language: 'fr' })
    expect(res.status).toBe(400)
    expect(prisma.contentPiece.update).not.toHaveBeenCalled()
  })

  it('cadena vacía borra el idioma y la keyword, no los deja en ""', async () => {
    mockBase()
    prisma.contentPiece.findFirst.mockResolvedValue({ ...existing, language: 'es', seoKeyword: 'algo' })
    prisma.contentPiece.findMany.mockResolvedValue([])
    prisma.contentPiece.update.mockResolvedValue({})

    await req('patch', `${BASE}/pieces/10`).send({ language: '', seoKeyword: '   ' })
    const { data } = prisma.contentPiece.update.mock.calls[0][0]
    expect(data.language).toBeNull()
    expect(data.seoKeyword).toBeNull()
  })
})

describe('traducciones de una nota', () => {
  it('vincula dos piezas y fusiona los grupos que ya existían', async () => {
    mockBase()
    prisma.contentPiece.findMany
      .mockResolvedValueOnce([
        { id: 10, translationGroupId: 'tg-es' },
        { id: 11, translationGroupId: 'tg-en' },
      ])
      .mockResolvedValueOnce([]) // loadTranslationGroups de la respuesta
    prisma.contentPiece.updateMany.mockResolvedValue({ count: 2 })
    prisma.contentPiece.findFirst.mockResolvedValue({
      id: 10, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, title: 'A', status: 'publicado',
      types: '[]', networks: '[]', seoKeywords: '[]', translationGroupId: 'tg-es',
      tasks: [], assets: [], files: [], comments: [], _count: { comments: 0 },
    })

    const res = await req('post', `${BASE}/pieces/10/translations`).send({ pieceId: 11 })
    expect(res.status).toBe(200)
    // El grupo de la otra pieza se absorbe en el de esta, no se mueve una sola fila.
    expect(prisma.contentPiece.updateMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, translationGroupId: { in: ['tg-en'] } },
      data:  { translationGroupId: 'tg-es' },
    })
  })

  it('400 si se intenta vincular una nota consigo misma', async () => {
    mockBase()
    const res = await req('post', `${BASE}/pieces/10/translations`).send({ pieceId: 10 })
    expect(res.status).toBe(400)
  })

  it('404 si alguna de las dos no es de este proyecto', async () => {
    mockBase()
    prisma.contentPiece.findMany.mockResolvedValue([{ id: 10, translationGroupId: null }])
    const res = await req('post', `${BASE}/pieces/10/translations`).send({ pieceId: 999 })
    expect(res.status).toBe(404)
  })

  it('al desvincular, un grupo que queda con una sola nota deja de ser grupo', async () => {
    mockBase()
    prisma.contentPiece.findFirst
      .mockResolvedValueOnce({ id: 10, translationGroupId: 'tg-1' })
      .mockResolvedValueOnce({
        id: 10, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, title: 'A', status: 'publicado',
        types: '[]', networks: '[]', seoKeywords: '[]', translationGroupId: null,
        tasks: [], assets: [], files: [], comments: [], _count: { comments: 0 },
      })
    prisma.contentPiece.findMany.mockResolvedValueOnce([{ id: 11 }]).mockResolvedValueOnce([])
    prisma.contentPiece.update.mockResolvedValue({})

    const res = await req('delete', `${BASE}/pieces/10/translations`)
    expect(res.status).toBe(200)
    expect(res.body.unlinked).toBe(true)
    expect(prisma.contentPiece.update).toHaveBeenCalledWith({ where: { id: 11 }, data: { translationGroupId: null } })
  })
})
