/**
 * Alta de baja de un agente: revocar → borrar, y el proveedor del despertador.
 *
 * Lo que se protege:
 * 1. Que no se pueda borrar un agente ACTIVO. Son dos pasos a propósito: mientras no
 *    esté revocado su token sigue sirviendo para conectarse, y el borrado no se deshace.
 * 2. Que la lista informe cuánto historial quedaría sin nombre (`historyCount`). Las 17
 *    FKs a McpToken son SetNull: borrar no borra el trabajo, lo deja como "Agente
 *    eliminado" — y eso hay que poder avisarlo ANTES, no descubrirlo después.
 * 3. Que la URL del proveedor pase por assertPublicUrl. Es una request que sale del
 *    servidor y lleva la API key del workspace en el header: una URL interna sería SSRF
 *    con credencial.
 */
jest.mock('../../src/lib/prisma', () => ({
  mcpToken:  { findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  workspace: { findUnique: jest.fn(), update: jest.fn() },
}))
jest.mock('../../src/lib/safeUrl', () => ({ assertPublicUrl: jest.fn() }))
jest.mock('../../src/lib/encryption', () => ({ encrypt: v => `enc:${v}` }))

const prisma = require('../../src/lib/prisma')
const { assertPublicUrl } = require('../../src/lib/safeUrl')
const { listMine, destroyMine, saveWakeConfig, getWakeConfig } = require('../../src/controllers/mcpTokens.controller')
const { DEFAULT_API_URL, WAKE_PROVIDERS } = require('../../src/services/agentWake.service')

const USER = 7

function mkRes() {
  const res = { statusCode: 200, body: undefined }
  res.status = jest.fn(c => { res.statusCode = c; return res })
  res.json = jest.fn(b => { res.body = b; return res })
  return res
}
const mkReq = (over = {}) => ({
  params: { id: '5' }, body: {}, query: {},
  user: { userId: USER }, workspace: { id: 1 },
  workspaceMember: { role: 'owner' },
  ...over,
})
const next = jest.fn()

beforeEach(() => jest.clearAllMocks())

describe('historyCount en la lista', () => {
  it('suma tareas ejecutadas, tareas creadas y comentarios', async () => {
    prisma.mcpToken.findMany.mockResolvedValue([
      { id: 5, label: 'Grok', revokedAt: null, _count: { agentTasks: 3, createdTasks: 2, taskComments: 4 } },
    ])
    const res = mkRes()
    await listMine(mkReq(), res, next)
    expect(res.body[0].historyCount).toBe(9)
    // El `_count` crudo de Prisma no se filtra al cliente.
    expect(res.body[0]._count).toBeUndefined()
  })

  it('un agente sin historial informa 0, no undefined', async () => {
    prisma.mcpToken.findMany.mockResolvedValue([
      { id: 5, label: 'Grok', revokedAt: null, _count: { agentTasks: 0, createdTasks: 0, taskComments: 0 } },
    ])
    const res = mkRes()
    await listMine(mkReq(), res, next)
    expect(res.body[0].historyCount).toBe(0)
  })
})

describe('borrar un agente', () => {
  it('no se puede si está activo: primero se revoca', async () => {
    prisma.mcpToken.findUnique.mockResolvedValue({ id: 5, userId: USER, workspaceId: 1, revokedAt: null })
    const res = mkRes()
    await destroyMine(mkReq(), res, next)
    expect(res.statusCode).toBe(400)
    expect(prisma.mcpToken.delete).not.toHaveBeenCalled()
  })

  it('se puede si está revocado', async () => {
    prisma.mcpToken.findUnique.mockResolvedValue({ id: 5, userId: USER, workspaceId: 1, revokedAt: new Date() })
    const res = mkRes()
    await destroyMine(mkReq(), res, next)
    expect(res.statusCode).toBe(200)
    expect(prisma.mcpToken.delete).toHaveBeenCalledWith({ where: { id: 5 } })
  })

  it('un agente ajeno es 404 y no se borra', async () => {
    prisma.mcpToken.findUnique.mockResolvedValue({ id: 5, userId: 99, workspaceId: 1, revokedAt: new Date() })
    const res = mkRes()
    await destroyMine(mkReq(), res, next)
    expect(res.statusCode).toBe(404)
    expect(prisma.mcpToken.delete).not.toHaveBeenCalled()
  })

  it('un agente de otro workspace es 404 aunque sea del mismo usuario', async () => {
    prisma.mcpToken.findUnique.mockResolvedValue({ id: 5, userId: USER, workspaceId: 42, revokedAt: new Date() })
    const res = mkRes()
    await destroyMine(mkReq(), res, next)
    expect(res.statusCode).toBe(404)
  })
})

describe('proveedor del despertador', () => {
  it('rechaza una URL que no pasa assertPublicUrl (SSRF con la API key)', async () => {
    assertPublicUrl.mockRejectedValue(new Error('No se permite acceder a direcciones IP privadas'))
    const res = mkRes()
    await saveWakeConfig(mkReq({ body: { apiUrl: 'http://169.254.169.254/v1/chat/completions' } }), res, next)
    expect(res.statusCode).toBe(400)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('acepta una URL pública y la guarda', async () => {
    assertPublicUrl.mockResolvedValue()
    const res = mkRes()
    await saveWakeConfig(mkReq({ body: { apiUrl: 'https://api.openai.com/v1/chat/completions' } }), res, next)
    expect(res.statusCode).toBe(200)
    expect(prisma.workspace.update.mock.calls[0][0].data.agentWakeApiUrl).toBe('https://api.openai.com/v1/chat/completions')
  })

  it("'' vuelve al default en código, sin validar nada", async () => {
    const res = mkRes()
    await saveWakeConfig(mkReq({ body: { apiUrl: '' } }), res, next)
    expect(prisma.workspace.update.mock.calls[0][0].data.agentWakeApiUrl).toBeNull()
    expect(assertPublicUrl).not.toHaveBeenCalled()
  })

  it('getWakeConfig informa la URL efectiva y los presets', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ agentWakeApiKey: null, agentWakeModel: null, agentWakeApiUrl: null })
    const res = mkRes()
    await getWakeConfig(mkReq(), res, next)
    expect(res.body.apiUrl).toBe(DEFAULT_API_URL)      // null → default, no null al cliente
    expect(res.body.providers.map(p => p.key)).toEqual(WAKE_PROVIDERS.map(p => p.key))
  })

  it('el preset de xAI sigue siendo el default: cambiarlo movería a los que ya lo usan', () => {
    expect(WAKE_PROVIDERS.find(p => p.key === 'xai').apiUrl).toBe(DEFAULT_API_URL)
  })

  it('todos los presets apuntan a un chat/completions compatible con OpenAI', () => {
    // `custom` va vacío a propósito: lo completa el usuario.
    for (const p of WAKE_PROVIDERS.filter(p => p.key !== 'custom')) {
      expect(p.apiUrl).toMatch(/^https:\/\/.+\/chat\/completions$/)
    }
  })
})
