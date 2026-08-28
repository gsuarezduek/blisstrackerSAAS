const { findMatch, buildTranscript } = require('../../src/services/whatsappBot.service')
const { truncate } = require('../../src/services/whatsappBotDocument.service')

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
