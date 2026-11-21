// Subtareas (checklist) vía MCP: el mapeo de las tools a los endpoints y el recorte de
// respuestas. Ver "Subtareas (checklist)" en docs/claude/tareas.md y el catálogo en
// src/mcp/toolCatalog.js.

const { tools, shapeResult } = require('../../src/mcp/toolCatalog')

const byName = name => tools.find(t => t.name === name)

describe('tools del checklist', () => {
  test('task_checklist_list pega al GET de la tarea', () => {
    expect(byName('task_checklist_list').request({ taskId: 7 })).toEqual({
      method: 'GET', path: '/tasks/7/checklist',
    })
  })

  // `done` opcional con default true: la tool se usa casi siempre para tildar, y pedirle
  // el booleano en cada llamada es un parámetro más para equivocarse.
  test('task_checklist_set tilda por default y destilda con done:false', () => {
    const tool = byName('task_checklist_set')
    expect(tool.request({ taskId: 7, itemId: 3 })).toEqual({
      method: 'PATCH', path: '/tasks/7/checklist/3', body: { done: true },
    })
    expect(tool.request({ taskId: 7, itemId: 3, done: false }).body).toEqual({ done: false })
  })

  test('task_checklist_add manda el texto crudo (el backend parte por líneas)', () => {
    expect(byName('task_checklist_add').request({ taskId: 7, text: 'uno\ndos' })).toEqual({
      method: 'POST', path: '/tasks/7/checklist', body: { text: 'uno\ndos' } },
    )
  })

  // Las tres devuelven la lista completa, así que no declaran `shape` de tarea: un
  // array de ítems no es un array de tareas y compactTask no tiene nada que recortar.
  test('no declaran shape de tarea', () => {
    for (const n of ['task_checklist_list', 'task_checklist_set', 'task_checklist_add']) {
      expect(byName(n).shape).toBeUndefined()
    }
  })
})

// El agente ve el progreso porque `checklist` viaja en el taskInclude y compactTask
// conserva los campos propios de la tarea. Si alguien lo convierte en una whitelist, el
// agente deja de ver en qué está partida la tarea y este test lo avisa.
describe('el recorte de respuestas conserva el checklist', () => {
  const task = {
    id: 1, status: 'PENDING', description: 'Newsletter',
    project: { id: 2, name: 'Bliss', socialAccounts: '[…]' },
    sessions: [],
    checklist: [
      { id: 10, text: 'Escribir', done: true, order: 0 },
      { id: 11, text: 'Publicar', done: false, order: 1 },
    ],
  }

  test('shape "task" (task_create, task_start, task_complete…)', () => {
    const out = shapeResult('task', task)
    expect(out.checklist).toEqual(task.checklist)
    // Y sigue recortando lo que tiene que recortar.
    expect(out.project).toEqual({ id: 2, name: 'Bliss' })
    expect(out.sessions).toBeUndefined()
  })

  test('shape "tasks" (tasks_agent_queue)', () => {
    expect(shapeResult('tasks', [task])[0].checklist).toEqual(task.checklist)
  })

  test('shape "taskLists" (tasks_today)', () => {
    const out = shapeResult('taskLists', { tasks: [task], agentTasks: [task] })
    expect(out.tasks[0].checklist).toEqual(task.checklist)
    expect(out.agentTasks[0].checklist).toEqual(task.checklist)
  })
})
