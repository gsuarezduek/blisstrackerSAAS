// Audiencia de una campaña: suscriptos en ALGUNA base incluida y en NINGUNA
// excluida. La consulta es sobre MailingContact (único por proyecto+email), así
// que el dedup entre bases lo da el modelo.
const { audienceWhere, toIdList } = require('../../src/services/mailing/audience')

describe('audienceWhere', () => {
  it('solo suscriptos, del proyecto, en alguna base incluida', () => {
    expect(audienceWhere(7, [1, 2], [])).toEqual({
      projectId: 7,
      status: 'subscribed',
      memberships: { some: { listId: { in: [1, 2] } } },
    })
  })

  it('las excluidas restan aunque el contacto también esté en una incluida', () => {
    const w = audienceWhere(7, [1], [3])
    expect(w.NOT).toEqual({ memberships: { some: { listId: { in: [3] } } } })
  })

  it('sin bases incluidas la audiencia es vacía, nunca "todos"', () => {
    expect(audienceWhere(7, [], [3]).memberships).toEqual({ some: { listId: { in: [] } } })
  })
})

describe('toIdList', () => {
  it('limpia, deduplica y descarta basura', () => {
    expect(toIdList([1, '2', 2, -1, 'x', 0, 3.5])).toEqual([1, 2])
    expect(toIdList('1,2')).toEqual([])
  })
})
