jest.mock('../../src/lib/prisma', () => ({
  workspace:          { findUnique: jest.fn() },
  workspaceMember:    { findUnique: jest.fn(), findMany: jest.fn() },
  projectMember:      { findUnique: jest.fn(), findMany: jest.fn() },
  project:            { findFirst: jest.fn() },
  featureFlag:        { findUnique: jest.fn() },
  contentPiece:       { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), groupBy: jest.fn() },
  contentStatusEvent: { create: jest.fn(), findMany: jest.fn() },
  workDay:            { findUnique: jest.fn(), create: jest.fn() },
  task:               { create: jest.fn() },
  notification:       { create: jest.fn() },
  $transaction:       jest.fn(),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 7
const BASE           = `/api/contenido/projects/${PROJECT_ID}/pieces`

function authHeader(userId = 1, role = 'member') {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Ana', email: 'a@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function req(method, url) {
  return request(app)[method](url)
    .set('Authorization', authHeader())
    .set('X-Workspace', WORKSPACE_SLUG)
}

// Workspace + membresía + feature flag habilitado.
function mockBase({ workspaceRole = 'member', flagOn = true } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]',
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role: workspaceRole, active: true }],
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: workspaceRole, active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({
    key: 'contenido', enabledGlobally: flagOn, enabledWorkspaceIds: '[]',
  })
  prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID, timezone: 'America/Argentina/Buenos_Aires' })
  prisma.workspaceMember.findMany.mockResolvedValue([])
  prisma.projectMember.findMany.mockResolvedValue([])
}

const dbPiece = (over = {}) => ({
  id: 10, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID,
  title: 'Reel de lanzamiento', status: 'idea', type: 'reel',
  networks: '["instagram"]', copy: null, hashtags: null, internalNotes: null,
  scheduledAt: null, scheduledDate: null, publishedAt: null, publishedUrl: null,
  order: 0, ownerId: null, taskId: null,
  submittedAt: null, approvedAt: null, approvedByContactId: null, changesRequestedAt: null,
  createdById: 1, createdAt: new Date(), updatedAt: new Date(),
  owner: null, createdBy: null, task: null, approvedBy: null, assets: [],
  _count: { comments: 0 },
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  // $transaction real recibe un array de promesas (los update() ya invocados
  // síncronamente al construir el array); acá alcanza con resolverlo — lo que
  // se verifica en los tests son los argumentos con los que se llamó a cada update.
  prisma.$transaction.mockResolvedValue([])
})

describe('Contenido — gating del módulo', () => {
  it('403 FEATURE_NOT_ENABLED si el flag está apagado', async () => {
    mockBase({ flagOn: false })
    const res = await req('get', BASE)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FEATURE_NOT_ENABLED')
  })

  it('401 sin token', async () => {
    mockBase()
    const res = await request(app).get(BASE).set('X-Workspace', WORKSPACE_SLUG)
    expect(res.status).toBe(401)
  })

  it('404 si el proyecto no es de este workspace', async () => {
    mockBase()
    prisma.project.findFirst.mockResolvedValue(null)
    const res = await req('get', BASE)
    expect(res.status).toBe(404)
  })
})

describe('GET /pieces', () => {
  it('lista sin exigir ser miembro del proyecto (lectura abierta)', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null) // no es del equipo
    prisma.contentPiece.count.mockResolvedValue(1)
    prisma.contentPiece.findMany.mockResolvedValue([dbPiece()])

    const res = await req('get', BASE)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.pieces[0].title).toBe('Reel de lanzamiento')
    // networks se deserializa; statusLabel sale del catálogo
    expect(res.body.pieces[0].networks).toEqual(['instagram'])
    expect(res.body.pieces[0].statusLabel).toBe('Idea')
  })

  it('filtra por rango de fechas, estado y red', async () => {
    mockBase()
    prisma.contentPiece.count.mockResolvedValue(0)
    prisma.contentPiece.findMany.mockResolvedValue([])

    await req('get', `${BASE}?from=2026-08-01&to=2026-08-31&status=aprobado,cambios&network=instagram`)

    const { where } = prisma.contentPiece.findMany.mock.calls[0][0]
    expect(where.scheduledDate).toEqual({ gte: '2026-08-01', lte: '2026-08-31' })
    expect(where.status).toEqual({ in: ['aprobado', 'cambios'] })
    // el match es por la clave entre comillas, para no cruzar redes con nombres contenidos
    expect(where.networks).toEqual({ contains: '"instagram"' })
  })

  it('descarta estados inválidos del filtro en vez de romper', async () => {
    mockBase()
    prisma.contentPiece.count.mockResolvedValue(0)
    prisma.contentPiece.findMany.mockResolvedValue([])

    await req('get', `${BASE}?status=inventado`)

    const { where } = prisma.contentPiece.findMany.mock.calls[0][0]
    expect(where.status).toBeUndefined()
  })

  it('clampea take al máximo permitido', async () => {
    mockBase()
    prisma.contentPiece.count.mockResolvedValue(0)
    prisma.contentPiece.findMany.mockResolvedValue([])

    await req('get', `${BASE}?take=9999`)

    expect(prisma.contentPiece.findMany.mock.calls[0][0].take).toBe(200)
  })
})

describe('POST /pieces', () => {
  it('crea una pieza y registra el evento "created"', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.create.mockResolvedValue(dbPiece())
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece())

    const res = await req('post', BASE).send({ title: 'Reel de lanzamiento', type: 'reel', networks: ['instagram'] })

    expect(res.status).toBe(201)
    expect(prisma.contentStatusEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'created', toStatus: 'idea' }) })
    )
  })

  it('403 si no es admin ni miembro del proyecto', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await req('post', BASE).send({ title: 'X' })

    expect(res.status).toBe(403)
    expect(prisma.contentPiece.create).not.toHaveBeenCalled()
  })

  it('permite crear a un miembro del equipo del proyecto', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue({ projectId: PROJECT_ID, userId: 1 })
    prisma.contentPiece.create.mockResolvedValue(dbPiece())
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece())

    const res = await req('post', BASE).send({ title: 'Post' })
    expect(res.status).toBe(201)
  })

  it('400 sin título', async () => {
    mockBase({ workspaceRole: 'admin' })
    const res = await req('post', BASE).send({ type: 'reel' })
    expect(res.status).toBe(400)
    expect(prisma.contentPiece.create).not.toHaveBeenCalled()
  })

  it('400 con tipo inválido', async () => {
    mockBase({ workspaceRole: 'admin' })
    const res = await req('post', BASE).send({ title: 'X', type: 'tiktok-dance' })
    expect(res.status).toBe(400)
  })

  it('descarta redes inválidas y deduplica', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.create.mockResolvedValue(dbPiece())
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece())

    await req('post', BASE).send({ title: 'X', networks: ['instagram', 'myspace', 'instagram'] })

    expect(prisma.contentPiece.create.mock.calls[0][0].data.networks).toBe('["instagram"]')
  })

  it('deriva scheduledDate de scheduledAt en la timezone del proyecto', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.create.mockResolvedValue(dbPiece())
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece())

    // 2026-08-16T02:00Z es todavía el 15 en Buenos Aires (UTC-3)
    await req('post', BASE).send({ title: 'X', scheduledAt: '2026-08-16T02:00:00.000Z' })

    expect(prisma.contentPiece.create.mock.calls[0][0].data.scheduledDate).toBe('2026-08-15')
  })
})

describe('PATCH /pieces/:pid', () => {
  it('actualiza campos y no registra evento si el estado no cambió', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece())
    prisma.contentPiece.update.mockResolvedValue(dbPiece({ title: 'Nuevo' }))

    const res = await req('patch', `${BASE}/10`).send({ title: 'Nuevo' })

    expect(res.status).toBe(200)
    expect(prisma.contentStatusEvent.create).not.toHaveBeenCalled()
  })

  it('registra ContentStatusEvent al cambiar de estado', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ status: 'produccion' }))
    prisma.contentPiece.update.mockResolvedValue(dbPiece({ status: 'aprobacion' }))

    const res = await req('patch', `${BASE}/10`).send({ status: 'aprobacion' })

    expect(res.status).toBe(200)
    expect(prisma.contentStatusEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'status_change', fromStatus: 'produccion', toStatus: 'aprobacion' }),
      })
    )
    // "esperando aprobación" sella submittedAt
    expect(prisma.contentPiece.update.mock.calls[0][0].data.submittedAt).toBeInstanceOf(Date)
  })

  it('400 con estado inválido', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece())

    const res = await req('patch', `${BASE}/10`).send({ status: 'casi-listo' })

    expect(res.status).toBe(400)
    expect(prisma.contentPiece.update).not.toHaveBeenCalled()
  })

  it('404 si la pieza es de otro proyecto', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(null)

    const res = await req('patch', `${BASE}/999`).send({ title: 'X' })
    expect(res.status).toBe(404)
  })

  it('403 si no puede escribir', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await req('patch', `${BASE}/10`).send({ title: 'X' })
    expect(res.status).toBe(403)
  })
})

describe('DELETE /pieces/:pid', () => {
  it('borra una pieza del proyecto', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece())
    prisma.contentPiece.delete.mockResolvedValue(dbPiece())

    const res = await req('delete', `${BASE}/10`)

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
    expect(prisma.contentPiece.delete).toHaveBeenCalledWith({ where: { id: 10 } })
  })

  it('403 si no puede escribir', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await req('delete', `${BASE}/10`)
    expect(res.status).toBe(403)
    expect(prisma.contentPiece.delete).not.toHaveBeenCalled()
  })
})

describe('PATCH /pieces/:pid/position', () => {
  it('mueve a otra columna vacía: 1 sola pieza reindexada a order 0 + evento de estado', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ id: 10, status: 'idea' }))
    prisma.contentPiece.findMany.mockResolvedValue([]) // columna destino vacía

    const res = await req('patch', `${BASE}/10/position`).send({ status: 'produccion', order: 0 })

    expect(res.status).toBe(200)
    expect(prisma.contentPiece.update).toHaveBeenCalledTimes(1)
    expect(prisma.contentPiece.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data:  expect.objectContaining({ status: 'produccion', order: 0 }),
    })
    expect(prisma.contentStatusEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'status_change', fromStatus: 'idea', toStatus: 'produccion' }) })
    )
  })

  it('reordena dentro de la misma columna sin loguear evento de estado', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ id: 10, status: 'idea' }))
    // La pieza que se mueve queda excluida de los siblings (id: { not: 10 })
    prisma.contentPiece.findMany.mockResolvedValue([{ id: 20 }, { id: 21 }])

    const res = await req('patch', `${BASE}/10/position`).send({ status: 'idea', order: 1 })

    expect(res.status).toBe(200)
    // ids = [20, 21] → splice(1, 0, 10) → [20, 10, 21]
    expect(prisma.contentPiece.update).toHaveBeenNthCalledWith(1, { where: { id: 20 }, data: { order: 0 } })
    expect(prisma.contentPiece.update).toHaveBeenNthCalledWith(2, { where: { id: 10 }, data: { status: 'idea', order: 1 } })
    expect(prisma.contentPiece.update).toHaveBeenNthCalledWith(3, { where: { id: 21 }, data: { order: 2 } })
    expect(prisma.contentStatusEvent.create).not.toHaveBeenCalled()
  })

  it('clampea un order negativo a 0 y uno excesivo al final de la columna', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ id: 10, status: 'idea' }))
    prisma.contentPiece.findMany.mockResolvedValue([{ id: 20 }])

    await req('patch', `${BASE}/10/position`).send({ status: 'idea', order: -5 })
    expect(prisma.contentPiece.update).toHaveBeenNthCalledWith(1, { where: { id: 10 }, data: { status: 'idea', order: 0 } })

    jest.clearAllMocks()
    prisma.$transaction.mockResolvedValue([])
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ id: 10, status: 'idea' }))
    prisma.contentPiece.findMany.mockResolvedValue([{ id: 20 }])

    await req('patch', `${BASE}/10/position`).send({ status: 'idea', order: 999 })
    // ids=[20] → splice(1,0,10) → [20,10] → 10 queda en index 1 (el final)
    expect(prisma.contentPiece.update).toHaveBeenNthCalledWith(2, { where: { id: 10 }, data: { status: 'idea', order: 1 } })
  })

  it('sin order en el body, agrega al final de la columna', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ id: 10, status: 'idea' }))
    prisma.contentPiece.findMany.mockResolvedValue([{ id: 20 }, { id: 21 }])

    await req('patch', `${BASE}/10/position`).send({ status: 'idea' })

    expect(prisma.contentPiece.update).toHaveBeenNthCalledWith(3, { where: { id: 10 }, data: { status: 'idea', order: 2 } })
  })

  it('400 con estado inválido', async () => {
    mockBase({ workspaceRole: 'admin' })
    const res = await req('patch', `${BASE}/10/position`).send({ status: 'volando', order: 0 })
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('404 si la pieza no es del proyecto', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(null)
    const res = await req('patch', `${BASE}/999/position`).send({ status: 'idea', order: 0 })
    expect(res.status).toBe(404)
  })

  it('403 si no puede escribir', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null)
    const res = await req('patch', `${BASE}/10/position`).send({ status: 'idea', order: 0 })
    expect(res.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('GET /pieces/:pid/history', () => {
  it('devuelve el timeline de eventos, más antiguo primero', async () => {
    mockBase()
    prisma.contentPiece.findFirst.mockResolvedValue({ id: 10 })
    prisma.contentStatusEvent.findMany.mockResolvedValue([
      { id: 1, action: 'created', fromStatus: null, toStatus: 'idea', actorUserId: 1, actorContactId: null, actorName: 'Ana', comment: null, createdAt: new Date('2026-08-01') },
      { id: 2, action: 'status_change', fromStatus: 'idea', toStatus: 'produccion', actorUserId: 1, actorContactId: null, actorName: 'Ana', comment: null, createdAt: new Date('2026-08-02') },
    ])

    const res = await req('get', `${BASE}/10/history`)

    expect(res.status).toBe(200)
    expect(res.body.events).toHaveLength(2)
    expect(res.body.events[0].action).toBe('created')
    expect(res.body.events[1].toStatus).toBe('produccion')
    expect(prisma.contentStatusEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pieceId: 10 }, orderBy: { createdAt: 'asc' } })
    )
  })

  it('404 si la pieza no es de este proyecto', async () => {
    mockBase()
    prisma.contentPiece.findFirst.mockResolvedValue(null)
    const res = await req('get', `${BASE}/999/history`)
    expect(res.status).toBe(404)
  })

  it('lectura abierta a cualquier miembro del workspace', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null) // no es del equipo
    prisma.contentPiece.findFirst.mockResolvedValue({ id: 10 })
    prisma.contentStatusEvent.findMany.mockResolvedValue([])

    const res = await req('get', `${BASE}/10/history`)
    expect(res.status).toBe(200)
  })
})

describe('GET /summary', () => {
  it('agrupa por estado y expone cuántas esperan al cliente', async () => {
    mockBase()
    prisma.contentPiece.groupBy.mockResolvedValue([
      { status: 'idea',       _count: { _all: 3 } },
      { status: 'aprobacion', _count: { _all: 2 } },
    ])

    const res = await req('get', `/api/contenido/projects/${PROJECT_ID}/summary`)

    expect(res.status).toBe(200)
    expect(res.body.byStatus).toEqual({ idea: 3, aprobacion: 2 })
    expect(res.body.total).toBe(5)
    expect(res.body.awaitingClient).toBe(2)
  })
})

describe('POST /pieces/:pid/send-to-dashboard', () => {
  const OWNER_ID = 5

  // workspaceMember.findUnique se llama UNA sola vez en este flujo: resolveWorkspace
  // ya trae la membresía del requester embebida en workspace.findUnique (ver
  // middleware/workspace.js:33-37), así que la única llamada real es la del chequeo
  // de "el responsable sigue siendo miembro activo" dentro de sendToDashboard.
  function mockHappyPath(over = {}) {
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ id: 10, ownerId: OWNER_ID, taskId: null, ...over }))
    prisma.workspaceMember.findUnique.mockResolvedValue({ active: true })
    prisma.workDay.findUnique.mockResolvedValue({ id: 99 })
    prisma.task.create.mockResolvedValue({ id: 500 })
  }

  it('crea la Task en el dashboard del responsable y la vincula a la pieza', async () => {
    mockBase({ workspaceRole: 'admin' })
    mockHappyPath()

    const res = await req('post', `${BASE}/10/send-to-dashboard`)

    expect(res.status).toBe(201)
    expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ description: 'Contenido - Reel de lanzamiento', userId: OWNER_ID, projectId: PROJECT_ID }),
    }))
    expect(prisma.contentPiece.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { taskId: 500 } })
  })

  it('notifica al responsable cuando quien envía es otra persona', async () => {
    mockBase({ workspaceRole: 'admin' })
    mockHappyPath()

    await req('post', `${BASE}/10/send-to-dashboard`)

    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: OWNER_ID, type: 'TASK_MENTION', contentPieceId: 10 }),
    }))
  })

  it('no se auto-notifica si el responsable es quien envía', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ id: 10, ownerId: 1, taskId: null })) // ownerId === requester (userId 1)
    prisma.workspaceMember.findUnique.mockResolvedValue({ active: true })
    prisma.workDay.findUnique.mockResolvedValue({ id: 99 })
    prisma.task.create.mockResolvedValue({ id: 500 })

    await req('post', `${BASE}/10/send-to-dashboard`)

    expect(prisma.notification.create).not.toHaveBeenCalled()
    // createdById va null: la creó ella misma, no la delegó otra persona
    expect(prisma.task.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ createdById: null }),
    }))
  })

  it('crea el WorkDay del responsable si todavía no tiene uno hoy', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ id: 10, ownerId: OWNER_ID, taskId: null }))
    prisma.workspaceMember.findUnique.mockResolvedValue({ active: true })
    prisma.workDay.findUnique.mockResolvedValue(null)
    prisma.workDay.create.mockResolvedValue({ id: 99 })
    prisma.task.create.mockResolvedValue({ id: 500 })

    const res = await req('post', `${BASE}/10/send-to-dashboard`)

    expect(res.status).toBe(201)
    expect(prisma.workDay.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: OWNER_ID, workspaceId: WORKSPACE_ID }),
    }))
  })

  it('400 si la pieza no tiene responsable', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ id: 10, ownerId: null, taskId: null }))

    const res = await req('post', `${BASE}/10/send-to-dashboard`)

    expect(res.status).toBe(400)
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('409 si la pieza ya tiene una tarea vinculada', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ id: 10, ownerId: OWNER_ID, taskId: 123 }))

    const res = await req('post', `${BASE}/10/send-to-dashboard`)

    expect(res.status).toBe(409)
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('400 si el responsable ya no es miembro activo del workspace', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(dbPiece({ id: 10, ownerId: OWNER_ID, taskId: null }))
    prisma.workspaceMember.findUnique.mockResolvedValue({ active: false })

    const res = await req('post', `${BASE}/10/send-to-dashboard`)

    expect(res.status).toBe(400)
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('403 si no puede escribir', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null)

    const res = await req('post', `${BASE}/10/send-to-dashboard`)

    expect(res.status).toBe(403)
    expect(prisma.task.create).not.toHaveBeenCalled()
  })

  it('404 si la pieza no existe', async () => {
    mockBase({ workspaceRole: 'admin' })
    prisma.contentPiece.findFirst.mockResolvedValue(null)

    const res = await req('post', `${BASE}/999/send-to-dashboard`)
    expect(res.status).toBe(404)
  })
})
