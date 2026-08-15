jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn(), findMany: jest.fn() },
  projectMember:   { findUnique: jest.fn(), findMany: jest.fn() },
  project:         { findFirst: jest.fn() },
  featureFlag:     { findUnique: jest.fn() },
  contentPiece:    { findFirst: jest.fn() },
  contentAsset:    {
    findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(),
    aggregate: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
  },
  $transaction: jest.fn(),
}))

jest.mock('../../src/services/objectStorage.service', () => ({
  isConfigured:  jest.fn(),
  buildKey:      jest.fn(),
  presignPut:    jest.fn(),
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
const PIECE_ID       = 10
const BASE           = `/api/contenido/projects/${PROJECT_ID}/pieces/${PIECE_ID}/assets`

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

function mockBase({ workspaceRole = 'admin', flagOn = true } = {}) {
  prisma.workspace.findUnique.mockResolvedValue({
    id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss',
    disabledFeatureKeys: '[]',
    members: [{ workspaceId: WORKSPACE_ID, userId: 1, role: workspaceRole, active: true }],
  })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: workspaceRole, active: true })
  prisma.featureFlag.findUnique.mockResolvedValue({ key: 'contenido', enabledGlobally: flagOn, enabledWorkspaceIds: '[]' })
  prisma.project.findFirst.mockResolvedValue({ id: PROJECT_ID, timezone: 'America/Argentina/Buenos_Aires' })
  prisma.contentPiece.findFirst.mockResolvedValue({ id: PIECE_ID, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, assets: [] })
}

// Sin cuota (0 = ilimitado) y sin límites de slot por default; cada test ajusta lo que necesita.
function mockNoQuotaLimit() {
  getSetting.mockResolvedValue(0)
}

const dbAsset = (over = {}) => ({
  id: 1, publicId: 'abc-123', workspaceId: WORKSPACE_ID, pieceId: PIECE_ID,
  kind: 'image', status: 'pending', mimeType: 'image/png',
  objectKey: 'content/1/xyz.png', imageData: null, posterKey: null,
  sizeBytes: 1000, width: null, height: null, durationSec: null,
  fileName: 'foto.png', order: 0, uploadedById: 1,
  createdAt: new Date(), confirmedAt: null,
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  prisma.$transaction.mockResolvedValue([])
  mockNoQuotaLimit()
  objectStorage.isConfigured.mockReturnValue(true)
  objectStorage.buildKey.mockReturnValue('content/1/new-uuid.png')
  objectStorage.presignPut.mockResolvedValue('https://r2.example.com/presigned-put-url')
})

describe('POST /assets/presign', () => {
  it('crea un asset pending y devuelve la URL firmada', async () => {
    mockBase()
    prisma.contentAsset.count.mockResolvedValue(0) // ready=0, pending=0, order=0
    prisma.contentAsset.create.mockResolvedValue(dbAsset())

    const res = await req('post', `${BASE}/presign`).send({ kind: 'image', mimeType: 'image/png', sizeBytes: 1000, fileName: 'foto.png' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ assetId: 1, uploadUrl: 'https://r2.example.com/presigned-put-url', expiresIn: 600 })
    expect(prisma.contentAsset.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pieceId: PIECE_ID, workspaceId: WORKSPACE_ID, status: 'pending', objectKey: 'content/1/new-uuid.png' }),
    }))
    expect(objectStorage.presignPut).toHaveBeenCalledWith('content/1/new-uuid.png', 'image/png', { expiresIn: 600 })
  })

  it('acepta video dentro del límite', async () => {
    mockBase()
    prisma.contentAsset.count.mockResolvedValue(0)
    prisma.contentAsset.create.mockResolvedValue(dbAsset({ kind: 'video', mimeType: 'video/mp4' }))

    const res = await req('post', `${BASE}/presign`).send({ kind: 'video', mimeType: 'video/mp4', sizeBytes: 100 * 1024 * 1024 })
    expect(res.status).toBe(201)
  })

  it('503 STORAGE_NOT_CONFIGURED sin R2', async () => {
    mockBase()
    objectStorage.isConfigured.mockReturnValue(false)

    const res = await req('post', `${BASE}/presign`).send({ kind: 'image', mimeType: 'image/png', sizeBytes: 1000 })

    expect(res.status).toBe(503)
    expect(res.body.code).toBe('STORAGE_NOT_CONFIGURED')
    expect(prisma.contentAsset.create).not.toHaveBeenCalled()
  })

  it('400 con kind inválido', async () => {
    mockBase()
    const res = await req('post', `${BASE}/presign`).send({ kind: 'audio', mimeType: 'audio/mp3', sizeBytes: 1000 })
    expect(res.status).toBe(400)
  })

  it('400 con mimeType fuera de la whitelist del kind', async () => {
    mockBase()
    const res = await req('post', `${BASE}/presign`).send({ kind: 'image', mimeType: 'video/mp4', sizeBytes: 1000 })
    expect(res.status).toBe(400)
  })

  it('413 si sizeBytes supera el máximo del kind', async () => {
    mockBase()
    const res = await req('post', `${BASE}/presign`).send({ kind: 'image', mimeType: 'image/png', sizeBytes: 16 * 1024 * 1024 })
    expect(res.status).toBe(413)
  })

  it('400 sizeBytes no numérico o negativo', async () => {
    mockBase()
    const res = await req('post', `${BASE}/presign`).send({ kind: 'image', mimeType: 'image/png', sizeBytes: -5 })
    expect(res.status).toBe(400)
    expect(prisma.contentAsset.create).not.toHaveBeenCalled()
  })

  it('400 si la pieza ya tiene 8 assets ready', async () => {
    mockBase()
    prisma.contentAsset.count.mockResolvedValueOnce(8) // ready
    const res = await req('post', `${BASE}/presign`).send({ kind: 'image', mimeType: 'image/png', sizeBytes: 1000 })
    expect(res.status).toBe(400)
    expect(prisma.contentAsset.create).not.toHaveBeenCalled()
  })

  it('400 si hay 3 pendings recientes', async () => {
    mockBase()
    prisma.contentAsset.count
      .mockResolvedValueOnce(0) // ready
      .mockResolvedValueOnce(3) // pending
    const res = await req('post', `${BASE}/presign`).send({ kind: 'image', mimeType: 'image/png', sizeBytes: 1000 })
    expect(res.status).toBe(400)
  })

  it('413 STORAGE_QUOTA_EXCEEDED con la cuota del workspace llena', async () => {
    mockBase()
    prisma.contentAsset.count.mockResolvedValue(0)
    getSetting.mockResolvedValue(1) // 1 MB de cuota
    prisma.contentAsset.aggregate.mockResolvedValue({ _sum: { sizeBytes: 1024 * 1024 - 100 } }) // casi al límite

    const res = await req('post', `${BASE}/presign`).send({ kind: 'image', mimeType: 'image/png', sizeBytes: 1000 })

    expect(res.status).toBe(413)
    expect(res.body.code).toBe('STORAGE_QUOTA_EXCEEDED')
    expect(prisma.contentAsset.create).not.toHaveBeenCalled()
  })

  it('cuota 0 = ilimitada, no consulta el agregado', async () => {
    mockBase()
    prisma.contentAsset.count.mockResolvedValue(0)
    prisma.contentAsset.create.mockResolvedValue(dbAsset())
    getSetting.mockResolvedValue(0)

    const res = await req('post', `${BASE}/presign`).send({ kind: 'image', mimeType: 'image/png', sizeBytes: 1000 })

    expect(res.status).toBe(201)
    expect(prisma.contentAsset.aggregate).not.toHaveBeenCalled()
  })

  it('403 si no puede escribir', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null)
    const res = await req('post', `${BASE}/presign`).send({ kind: 'image', mimeType: 'image/png', sizeBytes: 1000 })
    expect(res.status).toBe(403)
  })

  it('404 si la pieza no existe en el proyecto', async () => {
    mockBase()
    prisma.contentPiece.findFirst.mockResolvedValue(null)
    const res = await req('post', `${BASE}/presign`).send({ kind: 'image', mimeType: 'image/png', sizeBytes: 1000 })
    expect(res.status).toBe(404)
  })
})

describe('POST /assets/:aid/confirm', () => {
  const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from('isom'), Buffer.alloc(4)])
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

  it('confirma un asset con tamaño y magic bytes válidos', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(dbAsset({ status: 'pending' }))
    objectStorage.headObject.mockResolvedValue({ size: 2048, contentType: 'image/png' })
    objectStorage.getObjectHead.mockResolvedValue(PNG)
    prisma.contentAsset.update.mockResolvedValue(dbAsset({ status: 'ready', sizeBytes: 2048 }))

    const res = await req('post', `${BASE}/1/confirm`).send({ width: 800, height: 600 })

    expect(res.status).toBe(200)
    expect(prisma.contentAsset.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data:  expect.objectContaining({ status: 'ready', sizeBytes: 2048, mimeType: 'image/png', width: 800, height: 600 }),
    })
    expect(objectStorage.deleteObject).not.toHaveBeenCalled()
  })

  it('confirma video y resuelve el poster si es una imagen ready de la misma pieza', async () => {
    mockBase()
    prisma.contentAsset.findFirst
      .mockResolvedValueOnce(dbAsset({ id: 2, kind: 'video', mimeType: 'video/mp4', status: 'pending' })) // el asset
      .mockResolvedValueOnce({ objectKey: 'content/1/poster.png' }) // el poster
    objectStorage.headObject.mockResolvedValue({ size: 5000, contentType: 'video/mp4' })
    objectStorage.getObjectHead.mockResolvedValue(MP4)
    prisma.contentAsset.update.mockResolvedValue(dbAsset({ id: 2, kind: 'video', status: 'ready' }))

    const res = await req('post', `${BASE}/2/confirm`).send({ posterAssetId: 3, durationSec: 12 })

    expect(res.status).toBe(200)
    expect(prisma.contentAsset.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ posterKey: 'content/1/poster.png', durationSec: 12 }),
    }))
  })

  it('409 si el asset ya estaba confirmado', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(dbAsset({ status: 'ready' }))
    const res = await req('post', `${BASE}/1/confirm`).send({})
    expect(res.status).toBe(409)
    expect(objectStorage.headObject).not.toHaveBeenCalled()
  })

  it('400 UPLOAD_NOT_FOUND y limpia la fila si el objeto nunca llegó a R2', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(dbAsset({ status: 'pending' }))
    objectStorage.headObject.mockResolvedValue(null)

    const res = await req('post', `${BASE}/1/confirm`).send({})

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('UPLOAD_NOT_FOUND')
    expect(objectStorage.deleteObject).toHaveBeenCalledWith('content/1/xyz.png')
    expect(prisma.contentAsset.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it('413 y limpia si el tamaño real supera el máximo', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(dbAsset({ status: 'pending' }))
    objectStorage.headObject.mockResolvedValue({ size: 16 * 1024 * 1024, contentType: 'image/png' })

    const res = await req('post', `${BASE}/1/confirm`).send({})

    expect(res.status).toBe(413)
    expect(objectStorage.deleteObject).toHaveBeenCalled()
    expect(prisma.contentAsset.delete).toHaveBeenCalled()
    expect(prisma.contentAsset.update).not.toHaveBeenCalled()
  })

  it('400 y limpia si los magic bytes no matchean (archivo renombrado)', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(dbAsset({ status: 'pending', kind: 'image' }))
    objectStorage.headObject.mockResolvedValue({ size: 100, contentType: 'image/png' })
    objectStorage.getObjectHead.mockResolvedValue(Buffer.from('esto no es una imagen real'))

    const res = await req('post', `${BASE}/1/confirm`).send({})

    expect(res.status).toBe(400)
    expect(objectStorage.deleteObject).toHaveBeenCalledWith('content/1/xyz.png')
    expect(prisma.contentAsset.delete).toHaveBeenCalled()
  })

  it('un .mp4 renombrado que no es video real se rechaza', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(dbAsset({ status: 'pending', kind: 'video', mimeType: 'video/mp4' }))
    objectStorage.headObject.mockResolvedValue({ size: 5000, contentType: 'video/mp4' })
    objectStorage.getObjectHead.mockResolvedValue(Buffer.from('no soy un mp4 de verdad, solo tengo esta extension'))

    const res = await req('post', `${BASE}/1/confirm`).send({})

    expect(res.status).toBe(400)
    expect(prisma.contentAsset.delete).toHaveBeenCalled()
  })

  it('404 si el asset no existe', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(null)
    const res = await req('post', `${BASE}/999/confirm`).send({})
    expect(res.status).toBe(404)
  })
})

describe('POST /assets (fallback multipart, sin R2)', () => {
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

  it('sube una imagen válida directo a la DB (status ready)', async () => {
    mockBase()
    prisma.contentAsset.count.mockResolvedValue(0)
    prisma.contentAsset.create.mockResolvedValue(dbAsset({ status: 'ready', imageData: PNG }))

    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
      .attach('file', PNG, 'foto.png')

    expect(res.status).toBe(201)
    expect(prisma.contentAsset.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ kind: 'image', status: 'ready', mimeType: 'image/png' }),
    }))
  })

  it('rechaza un archivo que no es imagen real', async () => {
    mockBase()
    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
      .attach('file', Buffer.from('esto no es una imagen'), 'x.png')

    expect(res.status).toBe(400)
    expect(prisma.contentAsset.create).not.toHaveBeenCalled()
  })

  it('400 sin archivo adjunto', async () => {
    mockBase()
    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
    expect(res.status).toBe(400)
  })

  it('400 si ya hay 8 assets ready', async () => {
    mockBase()
    prisma.contentAsset.count.mockResolvedValue(8)
    const res = await request(app)
      .post(BASE)
      .set('Authorization', authHeader()).set('X-Workspace', WORKSPACE_SLUG)
      .attach('file', PNG, 'foto.png')
    expect(res.status).toBe(400)
    expect(prisma.contentAsset.create).not.toHaveBeenCalled()
  })
})

describe('PATCH /assets/:aid (reorder)', () => {
  it('reindexa los assets ready de la pieza', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(dbAsset({ id: 1, status: 'ready' }))
    prisma.contentAsset.findMany.mockResolvedValue([{ id: 20 }, { id: 21 }])
    prisma.contentAsset.findUnique.mockResolvedValue(dbAsset({ id: 1, order: 1 }))

    const res = await req('patch', `${BASE}/1`).send({ order: 1 })

    expect(res.status).toBe(200)
    expect(prisma.contentAsset.update).toHaveBeenNthCalledWith(1, { where: { id: 20 }, data: { order: 0 } })
    expect(prisma.contentAsset.update).toHaveBeenNthCalledWith(2, { where: { id: 1 },  data: { order: 1 } })
    expect(prisma.contentAsset.update).toHaveBeenNthCalledWith(3, { where: { id: 21 }, data: { order: 2 } })
  })

  it('400 con order inválido', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(dbAsset())
    const res = await req('patch', `${BASE}/1`).send({ order: -1 })
    expect(res.status).toBe(400)
  })

  it('404 si el asset no existe', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(null)
    const res = await req('patch', `${BASE}/999`).send({ order: 0 })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /assets/:aid', () => {
  it('borra del bucket (objectKey + posterKey) antes que la fila', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(dbAsset({ objectKey: 'content/1/a.png', posterKey: 'content/1/poster.jpg' }))

    const res = await req('delete', `${BASE}/1`)

    expect(res.status).toBe(200)
    expect(objectStorage.deleteObjects).toHaveBeenCalledWith(['content/1/a.png', 'content/1/poster.jpg'])
    expect(prisma.contentAsset.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })

  it('no incluye posterKey null en el borrado', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(dbAsset({ objectKey: 'content/1/a.png', posterKey: null }))
    await req('delete', `${BASE}/1`)
    expect(objectStorage.deleteObjects).toHaveBeenCalledWith(['content/1/a.png'])
  })

  it('404 si el asset no existe', async () => {
    mockBase()
    prisma.contentAsset.findFirst.mockResolvedValue(null)
    const res = await req('delete', `${BASE}/999`)
    expect(res.status).toBe(404)
    expect(objectStorage.deleteObjects).not.toHaveBeenCalled()
  })

  it('403 si no puede escribir', async () => {
    mockBase({ workspaceRole: 'member' })
    prisma.projectMember.findUnique.mockResolvedValue(null)
    const res = await req('delete', `${BASE}/1`)
    expect(res.status).toBe(403)
    expect(prisma.contentAsset.delete).not.toHaveBeenCalled()
  })
})

describe('GET /api/public/content-asset/:publicId (sin auth)', () => {
  it('302 al CDN si el asset tiene objectKey', async () => {
    prisma.contentAsset.findUnique.mockResolvedValue({ imageData: null, mimeType: 'image/png', objectKey: 'content/1/a.png', posterKey: null, status: 'ready' })
    const res = await request(app).get('/api/public/content-asset/abc-123')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('https://cdn.example.com/content/1/a.png')
  })

  it('?poster=1 redirige al posterKey', async () => {
    prisma.contentAsset.findUnique.mockResolvedValue({ imageData: null, mimeType: 'video/mp4', objectKey: 'content/1/v.mp4', posterKey: 'content/1/poster.jpg', status: 'ready' })
    const res = await request(app).get('/api/public/content-asset/abc-123?poster=1')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('https://cdn.example.com/content/1/poster.jpg')
  })

  it('?poster=1 sin posterKey → 404', async () => {
    prisma.contentAsset.findUnique.mockResolvedValue({ imageData: null, mimeType: 'video/mp4', objectKey: 'content/1/v.mp4', posterKey: null, status: 'ready' })
    const res = await request(app).get('/api/public/content-asset/abc-123?poster=1')
    expect(res.status).toBe(404)
  })

  it('sirve bytes legacy cuando no hay objectKey', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    prisma.contentAsset.findUnique.mockResolvedValue({ imageData: bytes, mimeType: 'image/png', objectKey: null, posterKey: null, status: 'ready' })
    const res = await request(app).get('/api/public/content-asset/abc-123')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/image\/png/)
  })

  it('404 si no existe o no está ready', async () => {
    prisma.contentAsset.findUnique.mockResolvedValue(null)
    let res = await request(app).get('/api/public/content-asset/nope')
    expect(res.status).toBe(404)

    prisma.contentAsset.findUnique.mockResolvedValue({ imageData: null, mimeType: 'image/png', objectKey: 'k', posterKey: null, status: 'pending' })
    res = await request(app).get('/api/public/content-asset/abc-123')
    expect(res.status).toBe(404)
  })
})
