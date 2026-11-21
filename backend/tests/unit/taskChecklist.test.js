// Criterio único de las subtareas (checklist) de una tarea — lib/taskChecklist.js.
// Lógica pura: la comparten el controller, la creación de tareas y la materialización
// de recurrencias.

const {
  MAX_ITEMS_PER_TASK, MAX_TEXT_LEN,
  cleanText, parseChecklistInput, parseChecklistTemplate, checklistCreateData,
} = require('../../src/lib/taskChecklist')

describe('cleanText', () => {
  it('recorta y descarta lo vacío', () => {
    expect(cleanText('  hola  ')).toBe('hola')
    expect(cleanText('   ')).toBeNull()
    expect(cleanText('')).toBeNull()
    expect(cleanText(null)).toBeNull()
    expect(cleanText(42)).toBeNull()
  })

  it('trunca al largo máximo', () => {
    expect(cleanText('x'.repeat(MAX_TEXT_LEN + 50))).toHaveLength(MAX_TEXT_LEN)
  })
})

describe('parseChecklistInput', () => {
  it('parte el texto por líneas y descarta las vacías', () => {
    expect(parseChecklistInput('uno\n\n  dos  \n')).toEqual(['uno', 'dos'])
  })

  it('limpia las viñetas y los tildes de una lista pegada de otro lado', () => {
    const pegado = '- Escribir el borrador\n* Revisar\n• Publicar\n[ ] Medir\n[x] Avisar'
    expect(parseChecklistInput(pegado)).toEqual([
      'Escribir el borrador', 'Revisar', 'Publicar', 'Medir', 'Avisar',
    ])
  })

  it('acepta un array ya armado', () => {
    expect(parseChecklistInput(['a', '', 'b'])).toEqual(['a', 'b'])
  })

  it('devuelve [] para entradas que no son texto ni array', () => {
    expect(parseChecklistInput(null)).toEqual([])
    expect(parseChecklistInput(undefined)).toEqual([])
    expect(parseChecklistInput({ a: 1 })).toEqual([])
  })

  it('corta en el tope de ítems por tarea', () => {
    const muchas = Array.from({ length: MAX_ITEMS_PER_TASK + 10 }, (_, i) => `t${i}`)
    expect(parseChecklistInput(muchas)).toHaveLength(MAX_ITEMS_PER_TASK)
  })
})

describe('parseChecklistTemplate', () => {
  it('lee la plantilla JSON de una recurrencia', () => {
    expect(parseChecklistTemplate(JSON.stringify(['uno', 'dos']))).toEqual(['uno', 'dos'])
  })

  it('tolera null y JSON corrupto sin romper la materialización', () => {
    expect(parseChecklistTemplate(null)).toEqual([])
    expect(parseChecklistTemplate('')).toEqual([])
    expect(parseChecklistTemplate('{no es json')).toEqual([])
    expect(parseChecklistTemplate('"un string suelto"')).toEqual([])
    expect(parseChecklistTemplate('123')).toEqual([])
  })
})

describe('checklistCreateData', () => {
  it('arma el nested create con el orden de la lista', () => {
    expect(checklistCreateData('uno\ndos')).toEqual({
      create: [{ text: 'uno', order: 0 }, { text: 'dos', order: 1 }],
    })
  })

  // Sin subtareas el create de la tarea tiene que quedar exactamente como antes.
  it('devuelve undefined si no hay subtareas', () => {
    expect(checklistCreateData('')).toBeUndefined()
    expect(checklistCreateData(null)).toBeUndefined()
    expect(checklistCreateData([])).toBeUndefined()
  })
})
