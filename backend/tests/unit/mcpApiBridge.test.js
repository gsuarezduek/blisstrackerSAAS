jest.mock('axios', () => jest.fn())

const axios = require('axios')
const jwt   = require('jsonwebtoken')
const { callApi, sanitizeAgentName } = require('../../src/mcp/apiBridge')
const { requestAgentName } = require('../../src/controllers/tasks/_shared')

// El JWT interno que firma apiBridge lleva el id del agente (McpToken) — la API lo
// lee como req.user.mcpTokenId para atribuir/filtrar tareas de agente.
describe('mcp/apiBridge callApi', () => {
  beforeEach(() => axios.mockResolvedValue({ status: 200, data: {} }))

  it('firma el JWT interno con userId + mcpTokenId, sin superadmin', async () => {
    await callApi({ userId: 5, workspaceSlug: 'bliss', tokenId: 7 }, 'GET', '/tasks/agent-queue')

    const { headers } = axios.mock.calls[0][0]
    expect(headers['X-Workspace']).toBe('bliss')
    const decoded = jwt.verify(headers.Authorization.slice(7), process.env.JWT_SECRET)
    expect(decoded).toEqual(expect.objectContaining({ userId: 5, mcpTokenId: 7, isSuperAdmin: false, mcpAgentName: null }))
  })

  it('firma el nombre que declaró el agente (normalizado) como mcpAgentName', async () => {
    await callApi({ userId: 5, workspaceSlug: 'bliss', tokenId: 7 }, 'GET', '/tasks/agent-queue', { agentName: '  Ventas\n  Norte ' })

    const decoded = jwt.verify(axios.mock.calls.at(-1)[0].headers.Authorization.slice(7), process.env.JWT_SECRET)
    expect(decoded.mcpAgentName).toBe('Ventas Norte')
  })
})

describe('sanitizeAgentName', () => {
  it('colapsa espacios, saca caracteres de control y corta a 60', () => {
    expect(sanitizeAgentName(' a\tb\u0000c ')).toBe('a b c')
    expect(sanitizeAgentName('x'.repeat(80))).toHaveLength(60)
  })
  it('vacío o no-string → null', () => {
    expect(sanitizeAgentName('   ')).toBeNull()
    expect(sanitizeAgentName(undefined)).toBeNull()
    expect(sanitizeAgentName(42)).toBeNull()
  })
})

describe('requestAgentName', () => {
  it('solo cuenta si la request viene de un agente', () => {
    expect(requestAgentName({ user: { mcpTokenId: 7, mcpAgentName: 'Ventas' } })).toBe('Ventas')
    expect(requestAgentName({ user: { mcpAgentName: 'Ventas' } })).toBeNull()
    expect(requestAgentName({ user: { mcpTokenId: 7, mcpAgentName: null } })).toBeNull()
  })
})
