const express = require('express')
const request = require('supertest')
const { handleMcpRequest, _sessions } = require('../../src/mcp/server')

// Sesiones del servidor MCP: un id desconocido (lo que ve un cliente después de
// un deploy) da 404 para que el cliente reinicialice y vuelva a pedir tools/list.
// mcpAuth se reemplaza por una identidad fija según el header x-test-token.
const app = express()
app.use(express.json())
app.all('/mcp', (req, _res, next) => {
  const tokenId = Number(req.headers['x-test-token'] || 1)
  req.mcpIdentity = { userId: 10 + tokenId, workspaceId: 1, workspaceSlug: 'bliss', tokenId }
  next()
}, handleMcpRequest)

const ACCEPT = 'application/json, text/event-stream'

function rpc(method, params = {}, id = 1) {
  return { jsonrpc: '2.0', id, method, params }
}

const INIT = rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'test', version: '1.0.0' },
})

// El transport responde por SSE: "event: message\ndata: {...}".
function parse(res) {
  const line = res.text.split('\n').find(l => l.startsWith('data: '))
  return line ? JSON.parse(line.slice(6)) : res.body
}

function post(body, { session, token } = {}) {
  const r = request(app).post('/mcp').set('Accept', ACCEPT).send(body)
  if (session) r.set('Mcp-Session-Id', session)
  if (token) r.set('x-test-token', String(token))
  return r
}

async function openSession(token = 1) {
  const res = await post(INIT, { token })
  const session = res.headers['mcp-session-id']
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, { session, token })
  return session
}

afterEach(() => {
  for (const { transport } of _sessions.values()) transport.close()
  _sessions.clear()
})

describe('MCP — sesiones', () => {
  it('initialize abre una sesión y devuelve su id', async () => {
    const res = await post(INIT)
    expect(res.status).toBe(200)
    expect(res.headers['mcp-session-id']).toBeTruthy()
    expect(parse(res).result.capabilities.tools.listChanged).toBe(true)
    expect(_sessions.has(res.headers['mcp-session-id'])).toBe(true)
  })

  it('con la sesión, tools/list devuelve el catálogo', async () => {
    const session = await openSession()
    const res = await post(rpc('tools/list', {}, 2), { session })
    expect(res.status).toBe(200)
    expect(parse(res).result.tools.map(t => t.name)).toContain('bliss_guide')
  })

  it('un id de sesión desconocido (ej. después de un deploy) da 404', async () => {
    const res = await post(rpc('tools/list', {}, 2), { session: 'sesion-de-antes-del-deploy' })
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe(-32001)
  })

  it('la sesión de un token no se puede usar con otro token', async () => {
    const session = await openSession(1)
    const res = await post(rpc('tools/list', {}, 2), { session, token: 2 })
    expect(res.status).toBe(404)
  })

  it('sin sesión, un request que no es initialize se sigue atendiendo como antes', async () => {
    const res = await post(rpc('tools/list', {}, 2))
    expect(res.status).toBe(200)
    expect(parse(res).result.tools.map(t => t.name)).toContain('bliss_guide')
    expect(res.headers['mcp-session-id']).toBeUndefined()
    expect(_sessions.size).toBe(0)
  })

  it('DELETE cierra la sesión', async () => {
    const session = await openSession()
    const res = await request(app).delete('/mcp').set('Accept', ACCEPT).set('Mcp-Session-Id', session)
    expect(res.status).toBe(200)
    expect(_sessions.has(session)).toBe(false)
    expect((await post(rpc('tools/list', {}, 2), { session })).status).toBe(404)
  })
})
