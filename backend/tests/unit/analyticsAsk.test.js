/**
 * "Preguntale a tus datos" — el loop entre la IA y GA4.
 *
 * Lo que se afirma acá es la garantía de la feature: el modelo ELIGE una
 * consulta, no la ejecuta. Si propone algo que no está en la lista blanca, el
 * error vuelve a él y a Google no sale nada; el `property` lo pone siempre el
 * backend; y la respuesta viaja con las filas que la respaldan.
 */
jest.mock('../../src/utils/dates', () => ({ todayString: () => '2026-11-13' }))
jest.mock('../../src/lib/claude', () => ({ createMessage: jest.fn() }))
jest.mock('../../src/services/googleAnalytics.service', () => ({ runCustomReport: jest.fn() }))

const { createMessage }   = require('../../src/lib/claude')
const { runCustomReport } = require('../../src/services/googleAnalytics.service')
const { askAnalytics, MAX_STEPS } = require('../../src/services/analyticsAsk.service')

const INTEGRATION = { id: 7, propertyId: '1234', accessToken: 'enc', refreshToken: 'enc' }
const PROJECT     = { name: 'Acme', websiteUrl: 'acme.com' }

const toolUse = (input, id = 'tu_1') => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name: 'consultar_ga4', input }],
  usage: { input_tokens: 10, output_tokens: 5 },
})
const answer = text => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text }],
  usage: { input_tokens: 10, output_tokens: 5 },
})

const REPORT = {
  headers: { dimensions: ['country'], metrics: ['sessions'] },
  rows:    [{ dimensions: ['Chile'], metrics: [1234] }],
  totals:  [1234],
  rowCount: 1,
}

const ask = (question = '¿Cuántas visitas tuve desde Chile en el último año?') =>
  askAnalytics({ integration: INTEGRATION, project: PROJECT, question, workspaceId: 2, userId: 5, timezone: 'America/Argentina/Buenos_Aires' })

const VALID = { metrics: ['sessions'], dimensions: ['country'], startDate: '365daysAgo', endDate: 'today', filters: [{ dimension: 'country', operator: 'exact', values: ['Chile'] }] }

beforeEach(() => {
  runCustomReport.mockResolvedValue(REPORT)
})

describe('camino normal', () => {
  test('consulta, lee las filas y responde con las filas adjuntas', async () => {
    createMessage
      .mockResolvedValueOnce(toolUse(VALID))
      .mockResolvedValueOnce(answer('Tuviste 1.234 visitas desde Chile en los últimos 365 días.'))

    const res = await ask()
    expect(res.answer).toMatch(/1\.234 visitas desde Chile/)
    expect(res.truncated).toBe(false)
    expect(res.steps).toHaveLength(1)
    expect(res.steps[0].query.filters[0].values).toEqual(['Chile'])
    expect(res.steps[0].rows).toEqual(REPORT.rows)
  })

  test('la consulta se corre contra la integración del proyecto, nunca contra lo que diga el modelo', async () => {
    createMessage
      .mockResolvedValueOnce(toolUse({ ...VALID, property: 'properties/999', propertyId: '999' }))
      .mockResolvedValueOnce(answer('listo'))

    await ask()
    expect(runCustomReport).toHaveBeenCalledTimes(1)
    const [integrationArg, queryArg] = runCustomReport.mock.calls[0]
    expect(integrationArg).toBe(INTEGRATION)
    expect(queryArg).not.toHaveProperty('property')
    expect(queryArg).not.toHaveProperty('propertyId')
  })

  test('las filas vuelven al modelo con el nombre de cada columna', async () => {
    createMessage
      .mockResolvedValueOnce(toolUse(VALID))
      .mockResolvedValueOnce(answer('listo'))

    await ask()
    const secondCall = createMessage.mock.calls[1][0]
    const toolResult = secondCall.messages.at(-1).content[0]
    expect(toolResult.type).toBe('tool_result')
    expect(JSON.parse(toolResult.content).filas).toEqual([{ country: 'Chile', sessions: 1234 }])
    expect(JSON.parse(toolResult.content).total).toEqual({ sessions: 1234 })
  })

  test('dos consultas encadenadas (una comparación) se devuelven las dos', async () => {
    createMessage
      .mockResolvedValueOnce(toolUse(VALID, 'a'))
      .mockResolvedValueOnce(toolUse({ ...VALID, startDate: '2025-01-01', endDate: '2025-12-31' }, 'b'))
      .mockResolvedValueOnce(answer('creció un 20%'))

    const res = await ask()
    expect(res.steps).toHaveLength(2)
    expect(res.truncated).toBe(false)
  })

  test('presupuesto y logging de tokens: cada llamada pasa por createMessage con el workspace', async () => {
    createMessage.mockResolvedValueOnce(toolUse(VALID)).mockResolvedValueOnce(answer('ok'))
    await ask()
    for (const call of createMessage.mock.calls) {
      expect(call[1]).toMatchObject({ workspaceId: 2, source: 'analyticsAsk', userId: 5 })
    }
  })
})

describe('consulta inválida propuesta por el modelo', () => {
  test('no sale a Google y el error vuelve al modelo para que corrija', async () => {
    createMessage
      .mockResolvedValueOnce(toolUse({ metrics: ['sessions'], dimensions: ['userEmail'], startDate: 'today', endDate: 'today' }))
      .mockResolvedValueOnce(toolUse(VALID))
      .mockResolvedValueOnce(answer('1.234 visitas'))

    const res = await ask()
    expect(runCustomReport).toHaveBeenCalledTimes(1)          // sólo la segunda, la válida
    // `messages` es el MISMO array en todas las llamadas (el loop le hace push), así que
    // se busca el tool_result de error en la conversación entera, no en una llamada puntual.
    const errorResults = createMessage.mock.calls.at(-1)[0].messages
      .flatMap(m => (Array.isArray(m.content) ? m.content : []))
      .filter(c => c.type === 'tool_result' && c.is_error)
    expect(errorResults).toHaveLength(1)
    expect(errorResults[0].content).toMatch(/userEmail/)
    expect(res.steps).toHaveLength(1)                          // el intento inválido no es un paso
  })

  test('una fecha con cualquier otra forma tampoco llega a Google', async () => {
    createMessage
      .mockResolvedValueOnce(toolUse({ metrics: ['sessions'], startDate: '2026-01-01; DROP TABLE', endDate: 'today' }))
      .mockResolvedValueOnce(answer('no pude'))

    await ask()
    expect(runCustomReport).not.toHaveBeenCalled()
  })
})

describe('errores', () => {
  test('un token vencido corta el loop (no es algo que el modelo pueda reintentar)', async () => {
    createMessage.mockResolvedValueOnce(toolUse(VALID))
    const err = new Error('invalid_grant'); err.code = 'TOKEN_EXPIRED'
    runCustomReport.mockRejectedValueOnce(err)

    await expect(ask()).rejects.toThrow(/invalid_grant/)
  })

  test('un rechazo puntual de GA4 vuelve al modelo como error, sin tirar la pregunta', async () => {
    createMessage
      .mockResolvedValueOnce(toolUse(VALID))
      .mockResolvedValueOnce(answer('GA4 no aceptó esa combinación'))
    runCustomReport.mockRejectedValueOnce(new Error('metric not compatible'))

    const res = await ask()
    expect(res.answer).toMatch(/no aceptó/)
    expect(res.steps).toHaveLength(0)
  })
})

describe('tope de pasos', () => {
  test(`después de ${MAX_STEPS} consultas se pide el cierre sin herramientas y se avisa`, async () => {
    for (let i = 0; i < MAX_STEPS; i++) createMessage.mockResolvedValueOnce(toolUse(VALID, `t${i}`))
    createMessage.mockResolvedValueOnce(answer('con lo que tengo: 1.234'))

    const res = await ask()
    expect(res.truncated).toBe(true)
    expect(res.steps).toHaveLength(MAX_STEPS)
    const finalCall = createMessage.mock.calls.at(-1)[0]
    expect(finalCall).not.toHaveProperty('tools')
    expect(finalCall.messages.at(-1).content).toMatch(/sin pedir más datos/)
  })
})

describe('prompt del sistema', () => {
  test('lleva la fecha de hoy y la regla del mes en curso (el mismo criterio que el análisis mensual)', async () => {
    createMessage.mockResolvedValueOnce(answer('no hace falta consultar'))
    await ask()
    const { system, tools } = createMessage.mock.calls[0][0]
    expect(system).toContain('HOY es 2026-11-13')
    expect(system).toContain('13 de 30 días')
    expect(system).toMatch(/Nunca presentes un mes en curso como si hubiera terminado/)
    expect(system).toContain('sessions')      // el catálogo se inyecta armado del mapa
    expect(tools[0].name).toBe('consultar_ga4')
  })

  test('el sitio del proyecto va en el prompt (es sobre qué se está preguntando)', async () => {
    createMessage.mockResolvedValueOnce(answer('ok'))
    await ask()
    expect(createMessage.mock.calls[0][0].system).toContain('acme.com')
  })
})
