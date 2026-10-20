jest.mock('axios', () => jest.fn())

const axios = require('axios')
const jwt   = require('jsonwebtoken')
const { callApi } = require('../../src/mcp/apiBridge')

// El JWT interno que firma apiBridge lleva el id del agente (McpToken) — la API lo
// lee como req.user.mcpTokenId para atribuir/filtrar tareas de agente.
describe('mcp/apiBridge callApi', () => {
  beforeEach(() => axios.mockResolvedValue({ status: 200, data: {} }))

  it('firma el JWT interno con userId + mcpTokenId, sin superadmin', async () => {
    await callApi({ userId: 5, workspaceSlug: 'bliss', tokenId: 7 }, 'GET', '/tasks/agent-queue')

    const { headers } = axios.mock.calls[0][0]
    expect(headers['X-Workspace']).toBe('bliss')
    const decoded = jwt.verify(headers.Authorization.slice(7), process.env.JWT_SECRET)
    expect(decoded).toEqual(expect.objectContaining({ userId: 5, mcpTokenId: 7, isSuperAdmin: false }))
  })
})
