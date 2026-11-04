const { tools } = require('../../src/mcp/toolCatalog')

// Tools "compuestas" (`run(args, call)` en vez de `request(args)`): encadenan varias
// llamadas a los endpoints de siempre en vez de tener lógica propia en el backend.
// Lo que se testea acá es el encadenado — el orden de los pasos y qué devuelven
// cuando uno falla a mitad de camino —, no los endpoints, que tienen sus tests.

const byName = name => tools.find(t => t.name === name)

// `call` de mentira: registra los pasos y devuelve lo que diga el guion.
function fakeCall(script = {}) {
  const calls = []
  const call = async (method, path, opts = {}) => {
    calls.push({ method, path, body: opts.body })
    const key = `${method} ${path}`
    const hit = script[key] ?? script[path]
    return hit ?? { status: 200, data: { id: 99 } }
  }
  return { call, calls }
}

describe('task_log_done', () => {
  const tool = byName('task_log_done')

  it('con taskId: toma la tarea, la arranca, la completa, carga los minutos y recién ahí la fecha', async () => {
    const { call, calls } = fakeCall({
      'PATCH /tasks/5/working-on': { status: 200, data: { next: 'start' } },
      'PATCH /tasks/5/logged-at': { status: 200, data: { task: { id: 5 }, date: '2026-11-01', workedMinutes: 45 } },
    })

    const res = await tool.run({ taskId: 5, minutes: 45, date: '2026-11-01' }, call)

    expect(calls.map(c => c.path)).toEqual([
      '/tasks/5/working-on',
      '/tasks/5/start',
      '/tasks/5/complete',
      '/tasks/5/duration',
      '/tasks/5/logged-at',
    ])
    // La duración va ANTES de la fecha: el paso de fecha corre startedAt a partir de
    // lo que ya quedó registrado.
    expect(calls[3].body).toEqual({ minutes: 45 })
    expect(res.data).toEqual(expect.objectContaining({ loggedOn: '2026-11-01', workedMinutes: 45 }))
  })

  it('sin taskId crea la tarea como tarea de agente y la arranca', async () => {
    const { call, calls } = fakeCall()
    await tool.run({ description: 'Redactar posteos', projectId: 7, minutes: 30 }, call)

    expect(calls[0]).toEqual({ method: 'POST', path: '/tasks', body: { description: 'Redactar posteos', projectId: 7, executor: 'agent' } })
    expect(calls.map(c => c.path)).toEqual(['/tasks', '/tasks/99/start', '/tasks/99/complete', '/tasks/99/duration'])
  })

  it('sin fecha no llama al paso de fecha', async () => {
    const { call, calls } = fakeCall({ 'PATCH /tasks/5/working-on': { status: 200, data: { next: 'none' } } })
    await tool.run({ taskId: 5, minutes: 10 }, call)
    expect(calls.some(c => c.path.endsWith('/logged-at'))).toBe(false)
  })

  it('una tarea ya en curso no se vuelve a iniciar', async () => {
    const { call, calls } = fakeCall({ 'PATCH /tasks/5/working-on': { status: 200, data: { next: 'none' } } })
    await tool.run({ taskId: 5, minutes: 10 }, call)
    expect(calls.map(c => c.path)).toEqual(['/tasks/5/working-on', '/tasks/5/complete', '/tasks/5/duration'])
  })

  it('una pausada se retoma en vez de iniciarse', async () => {
    const { call, calls } = fakeCall({ 'PATCH /tasks/5/working-on': { status: 200, data: { next: 'resume' } } })
    await tool.run({ taskId: 5, minutes: 10 }, call)
    expect(calls[1].path).toBe('/tasks/5/resume')
  })

  // Desde `complete` la tarea ya quedó modificada: si falla un paso posterior, el
  // agente tiene que poder arreglar eso en vez de volver a cargar todo y duplicar.
  it('si falla la duración devuelve el taskId y qué quedó a medias', async () => {
    const { call } = fakeCall({ 'PATCH /tasks/5/duration': { status: 400, data: { error: 'minutes inválido' } } })
    const res = await tool.run({ taskId: 5, minutes: 99999 }, call)

    expect(res.status).toBe(400)
    expect(res.data.taskId).toBe(5)
    expect(res.data.warning).toMatch(/sin la duración/)
    expect(res.data.detail).toEqual({ error: 'minutes inválido' })
  })

  it('si falla la fecha avisa que quedó registrada hoy', async () => {
    const { call } = fakeCall({ 'PATCH /tasks/5/logged-at': { status: 400, data: { error: 'fuera del mes' } } })
    const res = await tool.run({ taskId: 5, minutes: 45, date: '2020-01-01' }, call)

    expect(res.status).toBe(400)
    expect(res.data.warning).toMatch(/registrada HOY/)
    expect(res.data.taskId).toBe(5)
  })

  it('un error al tomar la tarea corta antes de tocar nada', async () => {
    const { call, calls } = fakeCall({ 'PATCH /tasks/5/working-on': { status: 409, data: { error: 'La tiene otro agente' } } })
    const res = await tool.run({ taskId: 5, minutes: 45 }, call)

    expect(res.status).toBe(409)
    expect(calls).toHaveLength(1)
  })

  it('400 sin taskId y sin descripción/proyecto, sin llamar a nada', async () => {
    const { call, calls } = fakeCall()
    const res = await tool.run({ minutes: 45 }, call)
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })
})

describe('list_projects', () => {
  const tool = byName('list_projects')

  const full = [{
    id: 7, name: 'Pastiza', active: true, locked: false, starred: true, isPrivate: false,
    websiteUrl: 'https://pastiza.com', monthlyHours: 20,
    connections: '{"instagram":"@pastiza"}', integrationDefaults: '{}', cannibalProtectedUrls: '[]',
    reportSections: null, createdAt: '2026-01-01', updatedAt: '2026-01-01',
    services: [{ serviceId: 3, service: { id: 3, name: 'Community Management' } }],
    members: [{ user: { id: 1, name: 'Ana', avatar: '2bee.png' } }],
    links: [{ id: 1, url: 'https://drive.google.com/x' }],
    integrations: [{ type: 'instagram' }],
    chatChannel: { slug: 'pastiza' },
    taskCounts: { IN_PROGRESS: 1, PENDING: 0, PAUSED: 0, BLOCKED: 2, COMPLETED_WEEK: 9 },
    _count: { tasks: 3 },
  }]

  it('por default recorta la ficha a lo que el agente usa', async () => {
    const call = async () => ({ status: 200, data: full })
    const res = await tool.run({}, call)

    expect(res.data).toEqual([{
      id: 7,
      name: 'Pastiza',
      websiteUrl: 'https://pastiza.com',
      starred: true,
      monthlyHours: 20,
      services: [{ id: 3, name: 'Community Management' }],
      team: ['Ana'],
      integrations: ['instagram'],
      openTasks: { IN_PROGRESS: 1, BLOCKED: 2 },   // los estados en cero no viajan
    }])
    // Lo que infla la respuesta sin que el agente lo use.
    const json = JSON.stringify(res.data)
    for (const field of ['links', 'connections', 'integrationDefaults', 'chatChannel', 'avatar', 'reportSections']) {
      expect(json).not.toContain(field)
    }
  })

  it('detail "full" devuelve la respuesta tal cual', async () => {
    const call = async () => ({ status: 200, data: full })
    const res = await tool.run({ detail: 'full' }, call)
    expect(res.data).toBe(full)
  })

  it('un proyecto privado ajeno sale con su nombre y nada más', async () => {
    const call = async () => ({ status: 200, data: [{ id: 9, name: 'Privado', locked: true, isPrivate: true, taskCounts: null }] })
    const res = await tool.run({}, call)
    expect(res.data[0]).toEqual({ id: 9, name: 'Privado', locked: true, note: expect.stringMatching(/privado/i) })
  })

  it('un error de la API pasa derecho, sin intentar recortar', async () => {
    const call = async () => ({ status: 403, data: { error: 'sin permiso' } })
    const res = await tool.run({}, call)
    expect(res).toEqual({ status: 403, data: { error: 'sin permiso' } })
  })
})
