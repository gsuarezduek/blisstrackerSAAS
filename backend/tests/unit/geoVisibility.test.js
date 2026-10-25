const { extractFinalText, matchCompetitors, buildPrompt } = require('../../src/services/geoVisibility.service')

describe('extractFinalText', () => {
  it('devuelve el texto cuando hay un solo bloque de texto', () => {
    expect(extractFinalText([{ type: 'text', text: '{"a":1}' }])).toBe('{"a":1}')
  })

  it('devuelve el ÚLTIMO bloque de texto cuando hay varios (ej. razonamiento intermedio + búsquedas + respuesta final)', () => {
    const content = [
      { type: 'text', text: 'pensando...' },
      { type: 'server_tool_use', id: 'x', name: 'web_search', input: { query: 'algo' } },
      { type: 'web_search_tool_result', tool_use_id: 'x', content: [] },
      { type: 'text', text: '{"ownMentioned":true}' },
    ]
    expect(extractFinalText(content)).toBe('{"ownMentioned":true}')
  })

  it('devuelve string vacío si no hay ningún bloque de texto', () => {
    expect(extractFinalText([{ type: 'server_tool_use', id: 'x', name: 'web_search', input: {} }])).toBe('')
  })

  it('tolera content null/undefined', () => {
    expect(extractFinalText(null)).toBe('')
    expect(extractFinalText(undefined)).toBe('')
  })
})

describe('matchCompetitors', () => {
  const competitors = [
    { id: 1, name: 'Acme' },
    { id: 2, name: 'Globex' },
  ]

  it('cruza por nombre exacto y arma { id, name, mentioned, position }', () => {
    const parsed = [
      { name: 'Acme', mentioned: true, position: 2 },
      { name: 'Globex', mentioned: false, position: null },
    ]
    expect(matchCompetitors(parsed, competitors)).toEqual([
      { id: 1, name: 'Acme', mentioned: true, position: 2 },
      { id: 2, name: 'Globex', mentioned: false, position: null },
    ])
  })

  it('un competidor que la IA no devolvió en absoluto queda como no mencionado', () => {
    const parsed = [{ name: 'Acme', mentioned: true, position: 1 }]
    expect(matchCompetitors(parsed, competitors)).toEqual([
      { id: 1, name: 'Acme', mentioned: true, position: 1 },
      { id: 2, name: 'Globex', mentioned: false, position: null },
    ])
  })

  it('tolera que la IA no devuelva el campo "competitors" (undefined/null)', () => {
    expect(matchCompetitors(undefined, competitors)).toEqual([
      { id: 1, name: 'Acme', mentioned: false, position: null },
      { id: 2, name: 'Globex', mentioned: false, position: null },
    ])
  })

  it('sin competidores configurados devuelve array vacío', () => {
    expect(matchCompetitors([{ name: 'Acme', mentioned: true }], [])).toEqual([])
  })
})

describe('buildPrompt', () => {
  it('incluye la pregunta, la marca propia y lista los competidores configurados', () => {
    const prompt = buildPrompt('¿Cuál es la mejor agencia de marketing?', 'BlissTracker', [
      { name: 'Acme', domain: 'acme.com' },
      { name: 'Globex' },
    ])
    expect(prompt).toContain('¿Cuál es la mejor agencia de marketing?')
    expect(prompt).toContain('BlissTracker')
    expect(prompt).toContain('"Acme" (acme.com)')
    expect(prompt).toContain('"Globex"')
  })

  it('sin competidores configurados lo deja explícito en vez de una lista vacía', () => {
    const prompt = buildPrompt('¿Pregunta?', 'Marca', [])
    expect(prompt).toContain('no hay competidores configurados')
  })
})
