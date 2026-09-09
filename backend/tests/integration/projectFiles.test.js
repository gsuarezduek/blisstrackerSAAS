jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  project:         { findFirst: jest.fn(), findUnique: jest.fn() },
  projectFile:      {
    findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(),
    aggregate: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(),
  },
}))

jest.mock('../../src/services/objectStorage.service', () => ({
  isConfigured:  jest.fn(),
  buildKey:      jest.fn(),
  presignPut:    jest.fn(),
  presignGet:    jest.fn(),
  headObject:    jest.fn(),
  getObjectHead: jest.fn(),
  deleteObject:  jest.fn(),
  deleteObjects: jest.fn(),
  publicUrl:     jest.fn(key => `https://cdn.example.com/${key}`),
}))

jest.mock('../../src/lib/platformSettings', () => ({
  getSetting: jest.fn(),
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const objectStorage = require('../../src/services/objectStorage.service')
const { getSetting } = require('../../src/lib/platformSettings')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1
const PROJECT_ID     = 7
const BASE           = `/api/projects/${PROJECT_ID}/files`

function authHeader(userId = 1, role = 'admin') {
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

function mockBase({ workspaceRole = 'admin', filesEnabled } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]',
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role: workspaceRole, active: true }],
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: workspaceRole, active: true })
  prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID })
  prisma.project.findUnique.mockResolvedValue({ filesEnabled: filesEnabled === undefined ? true : filesEnabled })
}

function mockNoQuotaLimit() {
  getSetting.mockResolvedValue(0)
}

const dbItem = (over = {}) => ({
  id: 1, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, parentId: null,
  type: 'file', name: 'archivo.pdf', status: 'ready', mimeType: 'application/pdf',
  objectKey: 'files/1/xyz.pdf', posterKey: null, sizeBytes: 1000,
  width: null, height: null, uploadedById: 1, uploadedBy: { id: 1, name: 'Ana' },
  createdAt: new Date(), confirmedAt: new Date(),
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockNoQuotaLimit()
  objectStorage.isConfigured.mockReturnValue(true)
  objectStorage.buildKey.mockReturnValue('files/1/new-uuid.pdf')
  objectStorage.presignPut.mockResolvedValue('https://r2.example.com/presigned-put-url')
})

describe('GET /files', () => {
  it('lista carpetas y archivos, carpetas primero', async () => {
    mockBase()
    prisma.projectFile.findMany.mockResolvedValue([
      dbItem({ id: 2, type: 'folder', name: 'Zeta', mimeType: null, objectKey: null }),
      dbItem({ id: 1, type: 'file', name: 'archivo.pdf' }),
    ])

    const res = await req('get', BASE)

    expect(res.status).toBe(200)
    expect(res.body.folders).toHaveLength(1)
    expect(res.body.files).toHaveLength(1)
    expect(res.body.path).toEqual([])
  })

  it('403 si filesEnabled está apagado', async () => {
    mockBase({ filesEnabled: false })
    const res = await req('get', BASE)
    expect(res.status).toBe(403)
  })
})

describe('POST /files/folders', () => {
  it('crea una carpeta en la raíz', async () => {
    mockBase()
    prisma.projectFile.create.mockResolvedValue(dbItem({ id: 5, type: 'folder', name: 'Briefs', mimeType: null }))

    const res = await req('post', `${BASE}/folders`).send({ name: 'Briefs' })

    expect(res.status).toBe(201)
    expect(res.body.type).toBe('folder')
    expect(prisma.projectFile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, type: 'folder', name: 'Briefs', parentId: null }),
    }))
  })

  it('400 sin nombre', async () => {
    mockBase()
    const res = await req('post', `${BASE}/folders`).send({})
    expect(res.status).toBe(400)
    expect(prisma.projectFile.create).not.toHaveBeenCalled()
  })

  it('404 si la carpeta padre no existe', async () => {
    mockBase()
    prisma.projectFile.findFirst.mockResolvedValue(null)
    const res = await req('post', `${BASE}/folders`).send({ name: 'Sub', parentId: 999 })
    expect(res.status).toBe(404)
  })
})

describe('POST /files/presign', () => {
  it('crea un archivo pending y devuelve la URL firmada', async () => {
    mockBase()
    prisma.projectFile.count.mockResolvedValue(0)
    prisma.projectFile.create.mockResolvedValue(dbItem({ status: 'pending' }))

    const res = await req('post', `${BASE}/presign`).send({ name: 'archivo.pdf', mimeType: 'application/pdf', sizeBytes: 1000 })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ fileId: 1, uploadUrl: 'https://r2.example.com/presigned-put-url', expiresIn: 900 })
    expect(prisma.projectFile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'file', status: 'pending', objectKey: 'files/1/new-uuid.pdf' }),
    }))
  })

  it('acepta application/octet-stream (típico de .psd/.ai)', async () => {
    mockBase()
    prisma.projectFile.count.mockResolvedValue(0)
    prisma.projectFile.create.mockResolvedValue(dbItem({ mimeType: 'application/octet-stream' }))

    const res = await req('post', `${BASE}/presign`).send({ name: 'diseño.psd', mimeType: 'application/octet-stream', sizeBytes: 1000 })
    expect(res.status).toBe(201)
  })

  it('400 con un tipo denylisteado (text/html)', async () => {
    mockBase()
    const res = await req('post', `${BASE}/presign`).send({ name: 'x.html', mimeType: 'text/html', sizeBytes: 1000 })
    expect(res.status).toBe(400)
    expect(prisma.projectFile.create).not.toHaveBeenCalled()
  })

  it('400 con un SVG (riesgo XSS)', async () => {
    mockBase()
    const res = await req('post', `${BASE}/presign`).send({ name: 'x.svg', mimeType: 'image/svg+xml', sizeBytes: 1000 })
    expect(res.status).toBe(400)
  })

  it('413 si sizeBytes supera el máximo', async () => {
    mockBase()
    const res = await req('post', `${BASE}/presign`).send({ name: 'grande.mp4', mimeType: 'video/mp4', sizeBytes: 600 * 1024 * 1024 })
    expect(res.status).toBe(413)
  })

  it('503 STORAGE_NOT_CONFIGURED sin R2', async () => {
    mockBase()
    objectStorage.isConfigured.mockReturnValue(false)
    const res = await req('post', `${BASE}/presign`).send({ name: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 1000 })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('STORAGE_NOT_CONFIGURED')
  })

  it('413 STORAGE_QUOTA_EXCEEDED con la cuota del workspace llena', async () => {
    mockBase()
    getSetting.mockResolvedValue(1) // 1 MB
    prisma.projectFile.count.mockResolvedValue(0)
    prisma.projectFile.aggregate.mockResolvedValue({ _sum: { sizeBytes: 1024 * 1024 - 100 } })

    const res = await req('post', `${BASE}/presign`).send({ name: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 1000 })

    expect(res.status).toBe(413)
    expect(res.body.code).toBe('STORAGE_QUOTA_EXCEEDED')
  })
})

describe('POST /files/:fileId/confirm', () => {
  it('confirma un archivo con el tamaño real del HeadObject', async () => {
    mockBase()
    prisma.projectFile.findFirst.mockResolvedValue(dbItem({ status: 'pending' }))
    objectStorage.headObject.mockResolvedValue({ size: 2048 })
    objectStorage.getObjectHead.mockResolvedValue(Buffer.from('%PDF-1.4 no es realmente un pdf válido pero no es imagen/video'))
    prisma.projectFile.update.mockResolvedValue(dbItem({ status: 'ready', sizeBytes: 2048 }))

    const res = await req('post', `${BASE}/1/confirm`).send({})

    expect(res.status).toBe(200)
    expect(prisma.projectFile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({ status: 'ready', sizeBytes: 2048, confirmedAt: expect.any(Date) }),
    }))
  })

  it('409 si ya estaba confirmado', async () => {
    mockBase()
    prisma.projectFile.findFirst.mockResolvedValue(dbItem({ status: 'ready' }))
    const res = await req('post', `${BASE}/1/confirm`).send({})
    expect(res.status).toBe(409)
  })

  it('400 UPLOAD_NOT_FOUND y limpia la fila si el objeto nunca llegó a R2', async () => {
    mockBase()
    prisma.projectFile.findFirst.mockResolvedValue(dbItem({ status: 'pending' }))
    objectStorage.headObject.mockResolvedValue(null)

    const res = await req('post', `${BASE}/1/confirm`).send({})

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('UPLOAD_NOT_FOUND')
    expect(objectStorage.deleteObject).toHaveBeenCalledWith('files/1/xyz.pdf')
    expect(prisma.projectFile.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it('corrige el mimeType real si el archivo es en verdad una imagen (magic bytes)', async () => {
    mockBase()
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    prisma.projectFile.findFirst.mockResolvedValue(dbItem({ status: 'pending', mimeType: 'application/octet-stream' }))
    objectStorage.headObject.mockResolvedValue({ size: 100 })
    objectStorage.getObjectHead.mockResolvedValue(PNG)
    prisma.projectFile.update.mockResolvedValue(dbItem({ status: 'ready', mimeType: 'image/png' }))

    const res = await req('post', `${BASE}/1/confirm`).send({})

    expect(res.status).toBe(200)
    expect(prisma.projectFile.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mimeType: 'image/png' }),
    }))
  })
})

describe('PATCH /files/:itemId (mover/renombrar)', () => {
  it('renombra un archivo', async () => {
    mockBase()
    prisma.projectFile.findFirst.mockResolvedValueOnce(dbItem({ id: 1, type: 'file' }))
    prisma.projectFile.update.mockResolvedValue(dbItem({ id: 1, name: 'nuevo.pdf' }))

    const res = await req('patch', `${BASE}/1`).send({ name: 'nuevo.pdf' })

    expect(res.status).toBe(200)
    expect(prisma.projectFile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 }, data: { name: 'nuevo.pdf' },
    }))
  })

  it('mueve un archivo a otra carpeta existente', async () => {
    mockBase()
    prisma.projectFile.findFirst
      .mockResolvedValueOnce(dbItem({ id: 1, type: 'file' })) // el item
      .mockResolvedValueOnce(dbItem({ id: 9, type: 'folder' })) // la carpeta destino
    prisma.projectFile.update.mockResolvedValue(dbItem({ id: 1, parentId: 9 }))

    const res = await req('patch', `${BASE}/1`).send({ parentId: 9 })

    expect(res.status).toBe(200)
    expect(prisma.projectFile.update).toHaveBeenCalledWith(expect.objectContaining({ data: { parentId: 9 } }))
  })

  it('400 al intentar mover una carpeta dentro de sí misma', async () => {
    mockBase()
    prisma.projectFile.findFirst
      .mockResolvedValueOnce(dbItem({ id: 5, type: 'folder' })) // el item
      .mockResolvedValueOnce(dbItem({ id: 5, type: 'folder' })) // "destino" = sí misma

    const res = await req('patch', `${BASE}/5`).send({ parentId: 5 })

    expect(res.status).toBe(400)
    expect(prisma.projectFile.update).not.toHaveBeenCalled()
  })

  it('400 al intentar mover una carpeta dentro de una de sus subcarpetas', async () => {
    mockBase()
    // item=1 (carpeta raíz), destino=2 (subcarpeta de 1: 2.parentId=1)
    prisma.projectFile.findFirst
      .mockResolvedValueOnce(dbItem({ id: 1, type: 'folder' })) // el item a mover
      .mockResolvedValueOnce(dbItem({ id: 2, type: 'folder' })) // la carpeta destino
      .mockResolvedValueOnce({ parentId: 1 }) // nodo intermedio: destino.parentId === item.id

    const res = await req('patch', `${BASE}/1`).send({ parentId: 2 })

    expect(res.status).toBe(400)
    expect(prisma.projectFile.update).not.toHaveBeenCalled()
  })

  it('404 si el ítem no existe', async () => {
    mockBase()
    prisma.projectFile.findFirst.mockResolvedValue(null)
    const res = await req('patch', `${BASE}/999`).send({ name: 'x' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /files/:itemId', () => {
  it('borra un archivo: R2 antes que la fila', async () => {
    mockBase()
    prisma.projectFile.findFirst.mockResolvedValue(dbItem({ id: 1, type: 'file', objectKey: 'files/1/a.pdf', posterKey: null }))

    const res = await req('delete', `${BASE}/1`)

    expect(res.status).toBe(200)
    expect(objectStorage.deleteObjects).toHaveBeenCalledWith(['files/1/a.pdf'])
    expect(prisma.projectFile.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it('borra una carpeta con contenido: recolecta las keys de todo el subárbol', async () => {
    mockBase()
    prisma.projectFile.findFirst.mockResolvedValue(dbItem({ id: 1, type: 'folder' }))
    // 1er nivel bajo la carpeta 1: una subcarpeta (10) y un archivo (11)
    prisma.projectFile.findMany
      .mockResolvedValueOnce([
        { id: 10, type: 'folder', objectKey: null, posterKey: null },
        { id: 11, type: 'file', objectKey: 'files/1/b.pdf', posterKey: 'files/1/b-poster.jpg' },
      ])
      // 2do nivel bajo la subcarpeta 10: un archivo más
      .mockResolvedValueOnce([
        { id: 12, type: 'file', objectKey: 'files/1/c.pdf', posterKey: null },
      ])
      // 3er nivel: vacío, corta el BFS
      .mockResolvedValueOnce([])

    const res = await req('delete', `${BASE}/1`)

    expect(res.status).toBe(200)
    expect(objectStorage.deleteObjects).toHaveBeenCalledWith([
      'files/1/b.pdf', 'files/1/b-poster.jpg', 'files/1/c.pdf',
    ])
    expect(prisma.projectFile.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it('404 si el ítem no existe', async () => {
    mockBase()
    prisma.projectFile.findFirst.mockResolvedValue(null)
    const res = await req('delete', `${BASE}/999`)
    expect(res.status).toBe(404)
    expect(objectStorage.deleteObjects).not.toHaveBeenCalled()
  })
})

describe('GET /files/:fileId/download', () => {
  it('302 a una URL firmada que fuerza descarga', async () => {
    mockBase()
    prisma.projectFile.findFirst.mockResolvedValue(dbItem({ objectKey: 'files/1/a.pdf', name: 'informe final.pdf' }))
    objectStorage.presignGet.mockResolvedValue('https://r2.example.com/signed-download')

    const res = await req('get', `${BASE}/1/download`)

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('https://r2.example.com/signed-download')
    expect(objectStorage.presignGet).toHaveBeenCalledWith('files/1/a.pdf', expect.objectContaining({ filename: 'informe final.pdf' }))
  })

  it('404 si el archivo no existe o no está ready', async () => {
    mockBase()
    prisma.projectFile.findFirst.mockResolvedValue(null)
    const res = await req('get', `${BASE}/999/download`)
    expect(res.status).toBe(404)
  })
})
