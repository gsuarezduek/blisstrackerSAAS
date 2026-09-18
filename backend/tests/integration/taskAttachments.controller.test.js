jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  task:            { findFirst: jest.fn() },
  projectFile:     { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  taskFile:        { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), delete: jest.fn() },
  $transaction:    jest.fn(ops => Promise.all(ops)),
}))

jest.mock('../../src/services/objectStorage.service', () => ({
  isConfigured:  jest.fn(),
  buildKey:      jest.fn(),
  presignPut:    jest.fn(),
  headObject:    jest.fn(),
  getObjectHead: jest.fn(),
  deleteObject:  jest.fn(),
  publicUrl:     jest.fn(key => `https://cdn.example.com/${key}`),
}))

jest.mock('../../src/lib/platformSettings', () => ({ getSetting: jest.fn() }))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const objectStorage = require('../../src/services/objectStorage.service')
const { getSetting } = require('../../src/lib/platformSettings')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const TASK_ID        = 42
const PROJECT_ID     = 7
const BASE           = `/api/tasks/${TASK_ID}/attachments`

function authHeader(userId = 1, role = 'member') {
  const token = jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Ana', email: 'a@t.com' },
    SECRET,
  )
  return `Bearer ${token}`
}

function req(method, url) {
  return request(app)[method](url).set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
}

function mockBase() {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]',
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true }],
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true })
}

const dbTask = (over = {}) => ({
  id: TASK_ID, description: 'Escribir el copy del posteo', projectId: PROJECT_ID,
  project: { id: PROJECT_ID, name: 'Proyecto Demo', timezone: 'America/Argentina/Buenos_Aires', filesEnabled: true },
  ...over,
})

const dbFile = (over = {}) => ({
  id: 55, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, parentId: 3,
  type: 'file', name: 'brief.pdf', status: 'pending', mimeType: 'application/pdf',
  objectKey: 'files/1/xyz.pdf', posterKey: null, sizeBytes: 1000,
  width: null, height: null, uploadedById: 1, uploadedBy: { id: 1, name: 'Ana' },
  createdAt: new Date(), confirmedAt: null,
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockBase()
  getSetting.mockResolvedValue(0) // sin límite de cuota
  objectStorage.isConfigured.mockReturnValue(true)
  objectStorage.buildKey.mockReturnValue('files/1/new-uuid.pdf')
  objectStorage.presignPut.mockResolvedValue('https://r2.example.com/presigned-put-url')
})

describe('GET /api/tasks/:id/attachments', () => {
  it('403 si la tarea no es del workspace', async () => {
    prisma.task.findFirst.mockResolvedValue(null)
    const res = await req('get', BASE)
    expect(res.status).toBe(403)
  })

  it('200 lista los archivos linkeados, shapeados', async () => {
    prisma.task.findFirst.mockResolvedValue(dbTask())
    prisma.taskFile.findMany.mockResolvedValue([
      { id: 9, file: dbFile({ status: 'ready' }) },
    ])
    const res = await req('get', BASE)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ id: 55, name: 'brief.pdf', taskFileId: 9, projectId: PROJECT_ID })
  })
})

describe('POST /api/tasks/:id/attachments/presign', () => {
  it('resuelve la carpeta "Tareas / <mes> / <tarea>" (creándola) y devuelve la URL firmada', async () => {
    prisma.task.findFirst.mockResolvedValue(dbTask())
    prisma.taskFile.count.mockResolvedValue(0)
    // findOrCreateFolder: nunca hay carpeta existente → siempre crea.
    prisma.projectFile.findFirst.mockImplementation(({ where }) => {
      if (where.type === 'folder') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    let nextFolderId = 100
    prisma.projectFile.create.mockImplementation(({ data }) => {
      if (data.type === 'folder') return Promise.resolve({ id: nextFolderId++ })
      return Promise.resolve(dbFile({ id: 55, parentId: data.parentId, name: data.name, status: 'pending' }))
    })

    const res = await req('post', `${BASE}/presign`).send({ name: 'brief.pdf', mimeType: 'application/pdf', sizeBytes: 1000 })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ fileId: 55, uploadUrl: 'https://r2.example.com/presigned-put-url', expiresIn: 900 })
    // 3 carpetas resueltas en cadena: "Tareas" → mes → título de la tarea.
    const folderCreates = prisma.projectFile.create.mock.calls.filter(([a]) => a.data.type === 'folder')
    expect(folderCreates).toHaveLength(3)
    expect(folderCreates[0][0].data).toMatchObject({ name: 'Tareas', parentId: null })
    expect(folderCreates[2][0].data.name).toContain('Escribir el copy')
    // El archivo queda dentro de la carpeta de la tarea (la 3ra creada: id 102 = 100+2), no en la raíz.
    const fileCreate = prisma.projectFile.create.mock.calls.find(([a]) => a.data.type === 'file')
    expect(fileCreate[0].data.parentId).toBe(102)
  })

  it('403 si Nube está deshabilitada para el workspace', async () => {
    prisma.task.findFirst.mockResolvedValue(dbTask({ project: { ...dbTask().project, filesEnabled: false } }))
    const res = await req('post', `${BASE}/presign`).send({ name: 'brief.pdf', mimeType: 'application/pdf', sizeBytes: 1000 })
    expect(res.status).toBe(403)
  })

  it('400 con un tipo denylisteado', async () => {
    prisma.task.findFirst.mockResolvedValue(dbTask())
    const res = await req('post', `${BASE}/presign`).send({ name: 'x.html', mimeType: 'text/html', sizeBytes: 1000 })
    expect(res.status).toBe(400)
    expect(prisma.projectFile.create).not.toHaveBeenCalled()
  })

  it('400 si ya hay demasiadas subidas pendientes en la tarea', async () => {
    prisma.task.findFirst.mockResolvedValue(dbTask())
    prisma.taskFile.count.mockResolvedValue(5)
    const res = await req('post', `${BASE}/presign`).send({ name: 'brief.pdf', mimeType: 'application/pdf', sizeBytes: 1000 })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/tasks/:id/attachments/:fileId/confirm', () => {
  it('marca ready, crea el vínculo TaskFile y devuelve el ítem shapeado', async () => {
    prisma.task.findFirst.mockResolvedValue(dbTask())
    prisma.projectFile.findFirst.mockResolvedValue(dbFile({ status: 'pending' }))
    objectStorage.headObject.mockResolvedValue({ size: 1000 })
    objectStorage.getObjectHead.mockResolvedValue(Buffer.from('%PDF-1.4'))
    prisma.$transaction.mockImplementation(ops => Promise.all(ops))
    prisma.projectFile.update.mockResolvedValue(dbFile({ status: 'ready', mimeType: 'application/pdf' }))
    prisma.taskFile.create.mockResolvedValue({ id: 9 })

    const res = await req('post', `${BASE}/55/confirm`).send({})

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: 55, status: 'ready', projectId: PROJECT_ID })
    expect(prisma.taskFile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workspaceId: WORKSPACE_ID, taskId: TASK_ID, fileId: 55, linkedById: 1 }),
    }))
  })

  it('404 si el archivo pending no existe', async () => {
    prisma.task.findFirst.mockResolvedValue(dbTask())
    prisma.projectFile.findFirst.mockResolvedValue(null)
    const res = await req('post', `${BASE}/999/confirm`).send({})
    expect(res.status).toBe(404)
  })

  it('rechaza y borra el objeto si no se encuentra en R2', async () => {
    prisma.task.findFirst.mockResolvedValue(dbTask())
    prisma.projectFile.findFirst.mockResolvedValue(dbFile({ status: 'pending' }))
    objectStorage.headObject.mockResolvedValue(null)

    const res = await req('post', `${BASE}/55/confirm`).send({})

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('UPLOAD_NOT_FOUND')
    expect(objectStorage.deleteObject).toHaveBeenCalledWith('files/1/xyz.pdf')
    expect(prisma.projectFile.delete).toHaveBeenCalledWith({ where: { id: 55 } })
    expect(prisma.taskFile.create).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/tasks/:id/attachments/:fileId', () => {
  it('saca el vínculo pero no borra el ProjectFile', async () => {
    prisma.task.findFirst.mockResolvedValue(dbTask())
    prisma.taskFile.findFirst.mockResolvedValue({ id: 9, taskId: TASK_ID, fileId: 55 })

    const res = await req('delete', `${BASE}/55`)

    expect(res.status).toBe(200)
    expect(prisma.taskFile.delete).toHaveBeenCalledWith({ where: { id: 9 } })
    expect(prisma.projectFile.delete).not.toHaveBeenCalled()
  })

  it('404 si no está adjunto a esta tarea', async () => {
    prisma.task.findFirst.mockResolvedValue(dbTask())
    prisma.taskFile.findFirst.mockResolvedValue(null)
    const res = await req('delete', `${BASE}/55`)
    expect(res.status).toBe(404)
  })
})
