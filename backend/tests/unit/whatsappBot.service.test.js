const { findMatch, buildTranscript, buildExamplesBlock } = require('../../src/services/whatsappBot.service')
const { truncate, buildTextResult, MAX_CHARS_PER_DOC } = require('../../src/services/whatsappBotDocument.service')

describe('whatsappBot.findMatch (blockedWords/escalationWords)', () => {
  test('matchea case-insensitive', () => {
    expect(findMatch('Quiero CANCELAR mi plan', ['cancelar'])).toBe('cancelar')
  })

  test('matchea por substring (sin límites de palabra)', () => {
    expect(findMatch('me gustaría cancelarlo ya', ['cancelar'])).toBe('cancelar')
  })

  test('devuelve null si no matchea ninguna palabra', () => {
    expect(findMatch('todo bien, gracias', ['cancelar', 'reembolso'])).toBeNull()
  })

  test('devuelve null con texto vacío o lista vacía/ausente', () => {
    expect(findMatch('', ['cancelar'])).toBeNull()
    expect(findMatch('cancelar', [])).toBeNull()
    expect(findMatch('cancelar', null)).toBeNull()
    expect(findMatch('cancelar', undefined)).toBeNull()
  })

  test('ignora entradas vacías/no-string dentro del array', () => {
    expect(findMatch('hola', ['', null, undefined, 'hola'])).toBe('hola')
  })

  test('devuelve la primera palabra que matchea, tal cual la cargó el admin', () => {
    expect(findMatch('necesito un reembolso urgente', ['Cancelar', 'Reembolso'])).toBe('Reembolso')
  })
})

describe('whatsappBot.buildTranscript', () => {
  test('etiqueta entrantes como Cliente y salientes como Asistente/Equipo según senderType', () => {
    const history = [
      { direction: 'in', content: 'Hola', senderType: 'contact' },
      { direction: 'out', content: 'Hola, en qué te ayudo?', senderType: 'bot' },
      { direction: 'out', content: 'Te escribo yo directamente', senderType: 'user' },
    ]
    expect(buildTranscript(history)).toBe(
      'Cliente: Hola\nAsistente: Hola, en qué te ayudo?\nEquipo: Te escribo yo directamente'
    )
  })

  test('usa [adjunto] cuando content es null', () => {
    const history = [{ direction: 'in', content: null, senderType: 'contact' }]
    expect(buildTranscript(history)).toBe('Cliente: [adjunto]')
  })
})

describe('whatsappBotDocument.truncate', () => {
  test('no trunca si el texto entra dentro del tope', () => {
    expect(truncate('hola mundo', 100)).toEqual({ text: 'hola mundo', truncated: false })
  })

  test('trunca y marca truncated:true si supera el tope', () => {
    const result = truncate('a'.repeat(150), 100)
    expect(result.truncated).toBe(true)
    expect(result.text.length).toBe(100)
  })

  test('recorta espacios en blanco antes de medir', () => {
    expect(truncate('   hola   ', 100)).toEqual({ text: 'hola', truncated: false })
  })
})

describe('whatsappBot.buildExamplesBlock (ejemplos few-shot)', () => {
  test('vacío sin ejemplos válidos', () => {
    expect(buildExamplesBlock([])).toBe('')
    expect(buildExamplesBlock(null)).toBe('')
    expect(buildExamplesBlock([{ question: 'sin respuesta' }])).toBe('')
  })

  test('arma el bloque con los pares pregunta/respuesta', () => {
    const block = buildExamplesBlock([{ question: '¿Hacen envíos?', answer: 'Sí, a todo el país.' }])
    expect(block).toContain('Cliente: ¿Hacen envíos?')
    expect(block).toContain('Vos responderías: Sí, a todo el país.')
  })

  test('descarta pares incompletos y conserva los válidos', () => {
    const block = buildExamplesBlock([
      { question: '', answer: 'no cuenta' },
      { question: '¿Precio?', answer: 'Depende del plan.' },
    ])
    expect(block).not.toContain('no cuenta')
    expect(block).toContain('¿Precio?')
  })
})

describe('whatsappBotDocument.buildTextResult (truncado vs resumen)', () => {
  test('sin summary: trunca el texto crudo y summarized queda false', () => {
    const result = buildTextResult('a'.repeat(MAX_CHARS_PER_DOC + 500), null)
    expect(result.truncated).toBe(true)
    expect(result.summarized).toBe(false)
    expect(result.charCount).toBe(MAX_CHARS_PER_DOC)
  })

  test('con summary que entra en el tope: summarized true, truncated false', () => {
    const result = buildTextResult('el documento original larguísimo…', 'resumen corto')
    expect(result).toEqual({ text: 'resumen corto', charCount: 13, truncated: false, summarized: true })
  })

  test('con summary que igual se pasa del tope: summarized true Y truncated true', () => {
    const result = buildTextResult('raw', 'b'.repeat(MAX_CHARS_PER_DOC + 100))
    expect(result.summarized).toBe(true)
    expect(result.truncated).toBe(true)
    expect(result.charCount).toBe(MAX_CHARS_PER_DOC)
  })

  test('texto corto sin necesidad de resumen: ni truncated ni summarized', () => {
    expect(buildTextResult('texto corto', null)).toEqual({ text: 'texto corto', charCount: 11, truncated: false, summarized: false })
  })
})
