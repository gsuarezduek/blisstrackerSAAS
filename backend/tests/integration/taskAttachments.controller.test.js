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
  putObject:     jest.fn(),
  publicUrl:     jest.fn(key => `https://cdn.example.com/${key}`),
}))

jest.mock('../../src/lib/platformSettings', () => ({ getSettings: jest.fn() }))
jest.mock('../../src/lib/safeUrl', () => ({ assertPublicUrl: jest.fn() }))
jest.mock('axios', () => ({ get: jest.fn() }))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const objectStorage = require('../../src/services/objectStorage.service')
const { getSettings } = require('../../src/lib/platformSettings')
const { assertPublicUrl } = require('../../src/lib/safeUrl')
const axios = require('axios')
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
  getSettings.mockResolvedValue({ projectFilesMaxMbPerWorkspace: 0 }) // sin límite de cuota
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

  it('guarda width/height del original (los manda el browser con la miniatura)', async () => {
    prisma.task.findFirst.mockResolvedValue(dbTask())
    prisma.projectFile.findFirst.mockResolvedValue(dbFile({ status: 'pending' }))
    objectStorage.headObject.mockResolvedValue({ size: 1000 })
    objectStorage.getObjectHead.mockResolvedValue(Buffer.from('%PDF-1.4'))
    prisma.$transaction.mockImplementation(ops => Promise.all(ops))
    prisma.projectFile.update.mockResolvedValue(dbFile({ status: 'ready' }))
    prisma.taskFile.create.mockResolvedValue({ id: 9 })

    // Un adjunto ES un ProjectFile de la Nube: no debe quedarle sin dimensiones
    // sólo por haber entrado desde una tarea.
    await req('post', `${BASE}/55/confirm`).send({ width: 1920, height: 1080 })

    expect(prisma.projectFile.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ width: 1920, height: 1080 }),
    }))
  })

  it('descarta dimensiones absurdas en vez de persistirlas (clampDim)', async () => {
    prisma.task.findFirst.mockResolvedValue(dbTask())
    prisma.projectFile.findFirst.mockResolvedValue(dbFile({ status: 'pending' }))
    objectStorage.headObject.mockResolvedValue({ size: 1000 })
    objectStorage.getObjectHead.mockResolvedValue(Buffer.from('%PDF-1.4'))
    prisma.$transaction.mockImplementation(ops => Promise.all(ops))
    prisma.projectFile.update.mockResolvedValue(dbFile({ status: 'ready' }))
    prisma.taskFile.create.mockResolvedValue({ id: 9 })

    await req('post', `${BASE}/55/confirm`).send({ width: 999999, height: 'nope' })

    expect(prisma.projectFile.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ width: null, height: null }),
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

describe('POST /api/tasks/:id/attachments/direct (agentes vía MCP)', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52])

  beforeEach(() => {
    prisma.task.findFirst.mockResolvedValue(dbTask())
    prisma.taskFile.count.mockResolvedValue(0)
    prisma.projectFile.findFirst.mockResolvedValue({ id: 3 }) // carpetas ya existen
    prisma.projectFile.create.mockImplementation(({ data }) => Promise.resolve(dbFile({ ...data, id: 77 })))
    prisma.$transaction.mockImplementation(fn => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn)))
    objectStorage.putObject.mockResolvedValue({ key: 'files/1/abc.md', url: 'x', size: 10 })
    assertPublicUrl.mockResolvedValue()
  })

  it('sube texto como archivo, con el tipo de la extensión, y lo vincula a la tarea', async () => {
    const res = await req('post', `${BASE}/direct`).send({ name: 'informe.md', content: '# Informe' })
    expect(res.status).toBe(201)
    expect(objectStorage.putObject).toHaveBeenCalledWith(expect.any(Buffer), 'text/markdown', { prefix: 'files/1' })
    expect(prisma.projectFile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ready', name: 'informe.md', mimeType: 'text/markdown', sizeBytes: 9, parentId: 3 }),
    }))
    expect(prisma.taskFile.create).toHaveBeenCalledWith({ data: { workspaceId: 1, taskId: TASK_ID, fileId: 77, linkedById: 1 } })
  })

  it('en base64 el tipo sale de los magic bytes, no del nombre', async () => {
    const res = await req('post', `${BASE}/direct`).send({ name: 'pieza.bin', contentBase64: PNG.toString('base64') })
    expect(res.status).toBe(201)
    expect(objectStorage.putObject).toHaveBeenCalledWith(expect.any(Buffer), 'image/png', expect.anything())
  })

  it('400 si no hay fuente o hay más de una', async () => {
    expect((await req('post', `${BASE}/direct`).send({ name: 'a.txt' })).status).toBe(400)
    expect((await req('post', `${BASE}/direct`).send({ name: 'a.txt', content: 'x', url: 'https://a.com/x' })).status).toBe(400)
    expect(objectStorage.putObject).not.toHaveBeenCalled()
  })

  it('rechaza HTML', async () => {
    const res = await req('post', `${BASE}/direct`).send({ name: 'pagina.html', content: '<p>hola</p>', mimeType: 'text/html' })
    expect(res.status).toBe(400)
    expect(objectStorage.putObject).not.toHaveBeenCalled()
  })

  it('baja una URL pública', async () => {
    axios.get.mockResolvedValue({ status: 200, headers: { 'content-type': 'image/png' }, data: PNG })
    const res = await req('post', `${BASE}/direct`).send({ name: 'pieza.png', url: 'https://cdn.example.com/pieza.png' })
    expect(res.status).toBe(201)
    expect(axios.get).toHaveBeenCalledWith('https://cdn.example.com/pieza.png', expect.objectContaining({ maxRedirects: 0 }))
  })

  it('valida cada redirect contra la red interna', async () => {
    axios.get.mockResolvedValueOnce({ status: 302, headers: { location: 'http://169.254.169.254/latest' }, data: Buffer.alloc(0) })
    assertPublicUrl.mockResolvedValueOnce().mockRejectedValueOnce(new Error('No se permite acceder a direcciones IP privadas'))
    const res = await req('post', `${BASE}/direct`).send({ name: 'x.png', url: 'https://evil.example.com/x' })
    expect(res.status).toBe(400)
    expect(assertPublicUrl).toHaveBeenLastCalledWith('http://169.254.169.254/latest')
    expect(objectStorage.putObject).not.toHaveBeenCalled()
  })

  it('si falla la base, borra el objeto subido', async () => {
    prisma.taskFile.create.mockRejectedValueOnce(new Error('db down'))
    const res = await req('post', `${BASE}/direct`).send({ name: 'notas.txt', content: 'hola' })
    expect(res.status).toBe(500)
    expect(objectStorage.deleteObject).toHaveBeenCalledWith('files/1/abc.md')
  })
})
