// Subtareas de una tarea (checklist) — rutas /api/tasks/:id/checklist.
// Ver controllers/tasks/checklist.controller.js: las subtareas NO son Task (son texto +
// tilde), el acceso es el mismo "equipo = etiqueta, no barrera" que los comentarios, y
// cada llamada devuelve la lista completa de la tarea.

jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  task:              { findFirst: jest.fn(), create: jest.fn() },
  projectMember:     { findFirst: jest.fn() },
  workDay:           { findUnique: jest.fn(), create: jest.fn() },
  taskChecklistItem: {
    findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(),
    createMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn(), delete: jest.fn(),
  },
  $transaction: jest.fn(),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const TZ             = 'America/Argentina/Buenos_Aires'
const TODAY          = new Date().toLocaleDateString('en-CA', { timeZone: TZ })

function authHeader(extra = {}) {
  return `Bearer ${jwt.sign(
    { userId: 1, workspaceId: WORKSPACE_ID, role: 'member', isSuperAdmin: false, name: 'Test', email: 't@t.com', ...extra },
    SECRET,
  )}`
}

const TASK = {
  id: 1, userId: 1, projectId: 1, status: 'PENDING', isBacklog: false, description: 'Tarea',
  project: { id: 1, name: 'Proyecto Test', isPrivate: false },
}

const ITEMS = [
  { id: 10, text: 'uno', done: true,  doneAt: new Date(), doneById: 1, order: 0 },
  { id: 11, text: 'dos', done: false, doneAt: null, doneById: null, order: 1 },
]

beforeEach(() => {
  jest.clearAllMocks()
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss', timezone: TZ,
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true }],
  })
  prisma.task.findFirst.mockResolvedValue(TASK)
  prisma.taskChecklistItem.findMany.mockResolvedValue(ITEMS)
  prisma.taskChecklistItem.count.mockResolvedValue(ITEMS.length)
  prisma.taskChecklistItem.findFirst.mockResolvedValue(ITEMS[1])
  prisma.taskChecklistItem.createMany.mockResolvedValue({ count: 1 })
  prisma.taskChecklistItem.deleteMany.mockResolvedValue({ count: 1 })
})

const req = (method, path) => request(app)[method](`/api/tasks/1/checklist${path}`)
  .set('Authorization', authHeader())
  .set('X-Workspace', WORKSPACE_SLUG)

describe('POST /tasks/:id/checklist — agregar', () => {
  it('agrega una subtarea al final y devuelve la lista completa', async () => {
    // El último `order` existente es 1 → la nueva va con 2.
    prisma.taskChecklistItem.findFirst.mockResolvedValueOnce({ order: 1 })

    const res = await req('post', '').send({ text: '  tres  ' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveLength(2) // lo que devuelve listItems (mockeado)
    expect(prisma.taskChecklistItem.createMany).toHaveBeenCalledWith({
      data: [{ taskId: 1, text: 'tres', order: 2 }],
    })
  })

  it('un pegado de varias líneas entra como varias subtareas, sin viñetas', async () => {
    prisma.taskChecklistItem.count.mockResolvedValue(0)
    prisma.taskChecklistItem.findFirst.mockResolvedValueOnce(null)

    const res = await req('post', '').send({ text: '- uno\n[ ] dos\n\n• tres' })

    expect(res.status).toBe(201)
    expect(prisma.taskChecklistItem.createMany).toHaveBeenCalledWith({
      data: [
        { taskId: 1, text: 'uno',  order: 0 },
        { taskId: 1, text: 'dos',  order: 1 },
        { taskId: 1, text: 'tres', order: 2 },
      ],
    })
  })

  it('rechaza el texto vacío', async () => {
    const res = await req('post', '').send({ text: '   ' })
    expect(res.status).toBe(400)
    expect(prisma.taskChecklistItem.createMany).not.toHaveBeenCalled()
  })

  // El tope es la contención del riesgo de que el checklist quiera ser un gestor de
  // proyectos: con 20 ítems ya tocados, lo que corresponde es partir la tarea.
  it('rechaza pasar el tope de 20 ítems por tarea', async () => {
    prisma.taskChecklistItem.count.mockResolvedValue(20)

    const res = await req('post', '').send({ text: 'una más' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/hasta 20 subtareas/)
    expect(prisma.taskChecklistItem.createMany).not.toHaveBeenCalled()
  })

  it('sin acceso a la tarea devuelve 403 y no toca nada', async () => {
    prisma.task.findFirst.mockResolvedValue(null) // otra workspace, o privada

    const res = await req('post', '').send({ text: 'uno' })

    expect(res.status).toBe(403)
    expect(prisma.taskChecklistItem.createMany).not.toHaveBeenCalled()
  })
})

describe('PATCH /tasks/:id/checklist/:itemId — tildar y editar', () => {
  it('tildar guarda quién y cuándo', async () => {
    const res = await req('patch', '/11').send({ done: true })

    expect(res.status).toBe(200)
    const { data } = prisma.taskChecklistItem.update.mock.calls[0][0]
    expect(data.done).toBe(true)
    expect(data.doneById).toBe(1)
    expect(data.doneAt).toBeInstanceOf(Date)
  })

  it('destildar borra el rastro de quién lo había tildado', async () => {
    const res = await req('patch', '/11').send({ done: false })

    expect(res.status).toBe(200)
    expect(prisma.taskChecklistItem.update.mock.calls[0][0].data).toMatchObject({
      done: false, doneAt: null, doneById: null,
    })
  })

  it('editar el texto no toca el tilde', async () => {
    const res = await req('patch', '/11').send({ text: 'dos y medio' })

    expect(res.status).toBe(200)
    const { data } = prisma.taskChecklistItem.update.mock.calls[0][0]
    expect(data).toEqual({ text: 'dos y medio' })
  })

  it('rechaza dejar el texto vacío y un done que no sea booleano', async () => {
    expect((await req('patch', '/11').send({ text: '  ' })).status).toBe(400)
    expect((await req('patch', '/11').send({ done: 'si' })).status).toBe(400)
    expect(prisma.taskChecklistItem.update).not.toHaveBeenCalled()
  })

  // El itemId tiene que pertenecer a ESA tarea: sin el filtro por taskId se podría
  // tildar el ítem de cualquier otra tarea pasando su id.
  it('un ítem de otra tarea devuelve 404', async () => {
    prisma.taskChecklistItem.findFirst.mockResolvedValue(null)

    const res = await req('patch', '/999').send({ done: true })

    expect(res.status).toBe(404)
    expect(prisma.taskChecklistItem.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /tasks/:id/checklist/:itemId', () => {
  it('borra el ítem de esa tarea y devuelve la lista', async () => {
    const res = await req('delete', '/11')

    expect(res.status).toBe(200)
    expect(prisma.taskChecklistItem.deleteMany).toHaveBeenCalledWith({ where: { id: 11, taskId: 1 } })
  })

  it('404 si no borró nada', async () => {
    prisma.taskChecklistItem.deleteMany.mockResolvedValue({ count: 0 })
    expect((await req('delete', '/999')).status).toBe(404)
  })
})

describe('POST /tasks/:id/checklist/:itemId/to-task — convertir en tarea', () => {
  beforeEach(() => {
    prisma.workDay.findUnique.mockResolvedValue({ id: 77, userId: 1, workspaceId: WORKSPACE_ID, date: TODAY })
    prisma.$transaction.mockImplementation(fn => fn(prisma))
    prisma.task.create.mockImplementation(({ data }) => Promise.resolve({ id: 2, ...data }))
  })

  it('crea la tarea en el mismo proyecto y para el mismo responsable, y saca el ítem', async () => {
    prisma.taskChecklistItem.findFirst.mockResolvedValue({ id: 11, text: 'dos', taskId: 1 })

    const res = await req('post', '/11/to-task')

    expect(res.status).toBe(201)
    expect(prisma.task.create.mock.calls[0][0].data).toMatchObject({
      description: 'dos', projectId: 1, userId: 1, workDayId: 77, isBacklog: false,
    })
    // El ítem se borra: dejarlo tildado diría que algo se hizo cuando recién empieza.
    expect(prisma.taskChecklistItem.delete).toHaveBeenCalledWith({ where: { id: 11 } })
    expect(res.body).toHaveProperty('task')
    expect(res.body).toHaveProperty('checklist')
  })

  it('una subtarea de una tarea de Backlog nace en el Backlog', async () => {
    prisma.task.findFirst.mockResolvedValue({ ...TASK, isBacklog: true })
    prisma.taskChecklistItem.findFirst.mockResolvedValue({ id: 11, text: 'dos', taskId: 1 })

    await req('post', '/11/to-task')

    expect(prisma.task.create.mock.calls[0][0].data).toMatchObject({ isBacklog: true })
  })
})
