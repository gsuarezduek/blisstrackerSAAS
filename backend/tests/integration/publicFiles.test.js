// Links públicos de Archivos (sin auth): foco en los dos guards que importan
// — que el token nunca alcance para un archivo de otra parte del proyecto, y
// que `?inline=1` no sirva inline un tipo que el navegador pueda ejecutar.
jest.mock('../../src/lib/prisma', () => ({
  projectFile: { findFirst: jest.fn(), findMany: jest.fn() },
  project:     { findUnique: jest.fn() },
}))

jest.mock('../../src/services/objectStorage.service', () => ({
  isConfigured:    jest.fn(() => true),
  presignGet:      jest.fn(),
  getObjectStream: jest.fn(),
  publicUrl:       jest.fn(key => `https://cdn.example.com/${key}`),
}))

const request = require('supertest')
const prisma  = require('../../src/lib/prisma')
const objectStorage = require('../../src/services/objectStorage.service')
const app     = require('../../src/app')

const TOKEN      = 'tok-publico-no-adivinable'
const PROJECT_ID = 7
const ROOT_ID    = 100
const SIGNED     = 'https://r2.example.com/signed-get-url'

const folderRoot = { id: ROOT_ID, name: 'Compartida', projectId: PROJECT_ID }

function file(over = {}) {
  return {
    id: 1, projectId: PROJECT_ID, parentId: ROOT_ID, type: 'file', status: 'ready',
    name: 'clip.mp4', mimeType: 'video/mp4', objectKey: 'files/1/clip.mp4',
    posterKey: null, sizeBytes: 1000, width: null, height: null,
    uploadedBy: null, createdAt: new Date(), publicToken: null,
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  objectStorage.isConfigured.mockReturnValue(true)
  objectStorage.presignGet.mockResolvedValue(SIGNED)
  prisma.project.findUnique.mockResolvedValue({
    name: 'Proyecto', filesEnabled: true, workspace: { name: 'Bliss', slug: 'bliss' },
  })
})

describe('GET /api/public/shared-folder/:token/signed-url/:fileId', () => {
  const url = (fileId = 1, qs = '') => `/api/public/shared-folder/${TOKEN}/signed-url/${fileId}${qs}`

  // El controller resuelve primero la carpeta raíz del token y después el
  // archivo; isWithinSharedTree sube por parentId hasta dar con la raíz.
  function mockTree({ fileOver = {}, parentChain = [] } = {}) {
    const calls = [folderRoot, file(fileOver), ...parentChain]
    prisma.projectFile.findFirst.mockImplementation(() =>
      Promise.resolve(calls.length ? calls.shift() : null))
  }

  it('firma la URL de un archivo que cuelga de la carpeta compartida', async () => {
    mockTree()

    const res = await request(app).get(url())

    expect(res.status).toBe(200)
    expect(res.body.url).toBe(SIGNED)
    expect(objectStorage.presignGet).toHaveBeenCalledWith('files/1/clip.mp4', expect.objectContaining({
      disposition: 'attachment', filename: 'clip.mp4', contentType: 'video/mp4',
    }))
  })

  it('?inline=1 firma inline para un video (streaming con Range)', async () => {
    mockTree()

    const res = await request(app).get(url(1, '?inline=1'))

    expect(res.status).toBe(200)
    expect(objectStorage.presignGet.mock.calls[0][1].disposition).toBe('inline')
  })

  it('IGNORA ?inline=1 para un tipo que el navegador podría ejecutar', async () => {
    mockTree({ fileOver: { mimeType: 'text/html', name: 'phishing.html' } })

    const res = await request(app).get(url(1, '?inline=1'))

    expect(res.status).toBe(200)
    // Firmado como descarga: un link público sin auth nunca debe poder servir
    // HTML ejecutable, ni siquiera desde el dominio de R2.
    expect(objectStorage.presignGet.mock.calls[0][1].disposition).toBe('attachment')
  })

  it('404 si el archivo está fuera del subárbol compartido', async () => {
    // El archivo existe en el proyecto pero su cadena de padres no llega a la
    // raíz compartida: adivinar un fileId de otra carpeta no debe servir.
    mockTree({ fileOver: { parentId: 999 }, parentChain: [{ parentId: null }] })

    const res = await request(app).get(url(999))

    expect(res.status).toBe(404)
    expect(objectStorage.presignGet).not.toHaveBeenCalled()
  })

  it('404 con un token que no existe', async () => {
    prisma.projectFile.findFirst.mockResolvedValue(null)

    const res = await request(app).get(url())

    expect(res.status).toBe(404)
    expect(objectStorage.presignGet).not.toHaveBeenCalled()
  })

  it('404 si la Nube está deshabilitada en el proyecto', async () => {
    mockTree()
    prisma.project.findUnique.mockResolvedValue({
      name: 'Proyecto', filesEnabled: false, workspace: { name: 'Bliss', slug: 'bliss' },
    })

    const res = await request(app).get(url())

    expect(res.status).toBe(404)
    expect(objectStorage.presignGet).not.toHaveBeenCalled()
  })
})

describe('GET /api/public/shared-file/:token/signed-url', () => {
  const url = (qs = '') => `/api/public/shared-file/${TOKEN}/signed-url${qs}`

  it('firma la URL del archivo que identifica el token', async () => {
    prisma.projectFile.findFirst.mockResolvedValue(file({ publicToken: TOKEN }))

    const res = await request(app).get(url())

    expect(res.status).toBe(200)
    expect(res.body.url).toBe(SIGNED)
    expect(objectStorage.presignGet.mock.calls[0][1].disposition).toBe('attachment')
  })

  it('aplica el mismo refuerzo de inline que la carpeta compartida', async () => {
    prisma.projectFile.findFirst.mockResolvedValue(
      file({ publicToken: TOKEN, mimeType: 'image/svg+xml', name: 'x.svg' }))

    const res = await request(app).get(url('?inline=1'))

    expect(res.status).toBe(200)
    expect(objectStorage.presignGet.mock.calls[0][1].disposition).toBe('attachment')
  })

  it('la de preview vive más que la de descarga (el <video> revalida cada Range)', async () => {
    prisma.projectFile.findFirst.mockResolvedValue(file({ publicToken: TOKEN }))

    const inline = await request(app).get(url('?inline=1'))
    const attach = await request(app).get(url())

    expect(inline.body.expiresIn).toBe(3600)
    expect(attach.body.expiresIn).toBe(900)
  })

  it('404 con un token que no existe', async () => {
    prisma.projectFile.findFirst.mockResolvedValue(null)

    const res = await request(app).get(url())

    expect(res.status).toBe(404)
  })
})
