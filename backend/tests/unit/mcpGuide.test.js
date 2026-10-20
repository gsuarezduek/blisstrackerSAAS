const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js')
const { buildServer } = require('../../src/mcp/server')
const { buildGuide, INSTRUCTIONS } = require('../../src/mcp/guide')
const { tools } = require('../../src/mcp/toolCatalog')

describe('MCP guide', () => {
  test('la guía completa menciona todas las tools del catálogo', () => {
    const guide = buildGuide(tools)
    const missing = tools.map(t => t.name).filter(n => !guide.includes(`\`${n}\``))
    expect(missing).toEqual([])
  })

  test('el server manda instructions en initialize y expone bliss_guide', async () => {
    const server = buildServer({ userId: 1, workspaceSlug: 'test' })
    const [clientT, serverT] = InMemoryTransport.createLinkedPair()
    await server.connect(serverT)
    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(clientT)

    expect(client.getInstructions()).toBe(INSTRUCTIONS)
    const { tools: listed } = await client.listTools()
    expect(listed.map(t => t.name)).toEqual(expect.arrayContaining(['bliss_guide', 'whoami']))

    const res = await client.callTool({ name: 'bliss_guide', arguments: { topic: 'ventas' } })
    expect(res.content[0].text).toContain('Ventas / CRM')
    expect(res.content[0].text).toContain('`ventas_lead_create`')
    await client.close()
  })
})
