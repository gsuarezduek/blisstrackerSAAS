const { aggregateMessages } = require('../../src/services/whatsappUsage.service')

function msg(direction, createdAt, extra = {}) {
  return { conversationId: 1, direction, viaTemplate: false, createdAt: new Date(createdAt), ...extra }
}

describe('aggregateMessages', () => {
  it('cuenta entrantes/salientes y plantillas por separado', () => {
    const out = aggregateMessages([
      msg('in', '2026-08-01T10:00:00Z'),
      msg('out', '2026-08-01T10:05:00Z'),
      msg('out', '2026-08-02T09:00:00Z', { viaTemplate: true }),
    ])
    expect(out.messagesIn).toBe(1)
    expect(out.messagesOut).toBe(2)
    expect(out.templatesSent).toBe(1)
  })

  it('cuenta conversaciones activas distintas', () => {
    const out = aggregateMessages([
      { ...msg('in', '2026-08-01T10:00:00Z'), conversationId: 1 },
      { ...msg('in', '2026-08-01T10:00:00Z'), conversationId: 2 },
      { ...msg('out', '2026-08-01T10:05:00Z'), conversationId: 1 },
    ])
    expect(out.conversationsActive).toBe(2)
  })

  it('calcula el promedio de primera respuesta en minutos', () => {
    const out = aggregateMessages([
      { ...msg('in', '2026-08-01T10:00:00Z'), conversationId: 1 },
      { ...msg('out', '2026-08-01T10:10:00Z'), conversationId: 1 }, // 10 min
      { ...msg('in', '2026-08-01T12:00:00Z'), conversationId: 2 },
      { ...msg('out', '2026-08-01T12:30:00Z'), conversationId: 2 }, // 30 min
    ])
    expect(out.avgFirstResponseMins).toBe(20)
  })

  it('devuelve null de primera respuesta si ninguna conversación tuvo ambos lados', () => {
    const out = aggregateMessages([msg('in', '2026-08-01T10:00:00Z')])
    expect(out.avgFirstResponseMins).toBeNull()
  })

  it('ignora una respuesta que llegó antes del primer entrante (no es "primera respuesta")', () => {
    const out = aggregateMessages([
      { ...msg('out', '2026-08-01T09:00:00Z'), conversationId: 1 },
      { ...msg('in', '2026-08-01T10:00:00Z'), conversationId: 1 },
    ])
    expect(out.avgFirstResponseMins).toBeNull()
  })
})
