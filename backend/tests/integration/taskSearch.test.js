jest.mock('../../src/lib/prisma', () => ({
  workspace:       { findUnique: jest.fn() },
  workspaceMember: { findUnique: jest.fn() },
  task:            { findMany: jest.fn() },
}))

const request = require('supertest')
const jwt     = require('jsonwebtoken')
const prisma  = require('../../src/lib/prisma')
const app     = require('../../src/app')

const SECRET         = process.env.JWT_SECRET
const WORKSPACE_SLUG = 'bliss'
const WORKSPACE_ID   = 1

function authHeader(role = 'member', userId = 1) {
  return `Bearer ${jwt.sign(
    { userId, workspaceId: WORKSPACE_ID, role, isSuperAdmin: false, name: 'Test', email: 't@t.com' },
    SECRET,
  )}`
}

function search(qs, role = 'member') {
  return request(app)
    .get(`/api/tasks/search${qs}`)
    .set('Authorization', authHeader(role))
    .set('X-Workspace', WORKSPACE_SLUG)
}

const whereOf = () => prisma.task.findMany.mock.calls[0][0].where

function row(over = {}) {
  return {
    id: 1, description: 'Redactar posteos de noviembre', status: 'PENDING', userId: 1,
    createdAt: new Date('2026-11-01T10:00:00Z'), completedAt: null, startedAt: null,
    pausedMinutes: 0, minutesOverride: null, scheduledFor: null, isBacklog: false,
    starred: 0, blockedReason: null, isAgentTask: false, agentName: null,
    project: { id: 7, name: 'Pastiza' }, user: { name: 'Ana' },
    workDay: { date: '2026-11-01' }, agent: null, _count: { comments: 0 },
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  prisma.workspace.findUnique.mockResolvedValue({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, status: 'active', name: 'Bliss', timezone: 'America/Argentina/Buenos_Aires' })
  prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'member', active: true })
  prisma.task.findMany.mockResolvedValue([])
})

describe('GET /api/tasks/search', () => {
  it('busca por texto en las tareas propias', async () => {
    const res = await search('?q=posteos')
    expect(res.status).toBe(200)
    expect(whereOf().userId).toBe(1)
    const [word] = whereOf().AND
    expect(word.OR).toContainEqual({ description: { contains: 'posteos', mode: 'insensitive' } })
  })

  // Lo que encontró el agente: "aprobacion" no encontraba "aprobación", y la frase
  // tenía que estar exacta. Las dos cosas le hacen creer que la tarea no existe y
  // duplicarla, que es justo lo que esta tool viene a evitar. Ver lib/textSearch.js.
  it('no distingue tildes', async () => {
    await search('?q=aprobacion')
    const [word] = whereOf().AND
    expect(word.OR.map(c => c.description.contains)).toContain('aprobación')
  })

  it('las palabras se combinan con AND, en cualquier orden', async () => {
    await search('?q=redactar%20posteos')
    expect(whereOf().AND).toHaveLength(2)
    expect(whereOf().AND[0].OR[0].description.contains).toBe('redactar')
    expect(whereOf().AND[1].OR[0].description.contains).toBe('posteos')
  })

  it('sin q no filtra por texto', async () => {
    await search('?projectId=7')
    expect(whereOf().AND).toBeUndefined()
  })

  // Lo que se paga en tokens es cada campo de cada fila: la respuesta es el recorte,
  // no `taskInclude`.
  it('devuelve filas recortadas, sin los campos que el consumidor no usa', async () => {
    prisma.task.findMany.mockResolvedValue([row()])
    const res = await search('?q=posteos')

    expect(res.body.tasks).toEqual([{
      id: 1,
      description: 'Redactar posteos de noviembre',
      status: 'PENDING',
      project: { id: 7, name: 'Pastiza' },
      owner: 'Ana',
      ownerId: 1,
      date: '2026-11-01',
      createdAt: '2026-11-01T10:00:00.000Z',
    }])
    expect(res.body.hasMore).toBe(false)
  })

  it('una completada trae el tiempo trabajado, y una de agente su ejecutor', async () => {
    prisma.task.findMany.mockResolvedValue([row({
      status: 'COMPLETED', completedAt: new Date('2026-11-01T11:00:00Z'), minutesOverride: 45,
      isAgentTask: true, agentName: 'SEO', agent: { label: 'grokbot' },
    })])
    const res = await search('?status=COMPLETED')

    expect(res.body.tasks[0]).toEqual(expect.objectContaining({
      workedMinutes: 45, executor: 'agent', agent: 'grokbot · SEO',
    }))
  })

  it('"open" es un atajo de todas las abiertas', async () => {
    await search('?status=open')
    expect(whereOf().status).toEqual({ in: ['PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED'] })
  })

  // Un estado mal escrito tiene que ser un error y no un filtro vacío: si no, la
  // respuesta "no hay nada" se lee como "la tarea no existe" y se duplica igual.
  it('400 con un estado que no existe', async () => {
    const res = await search('?status=TERMINADA')
    expect(res.status).toBe(400)
    expect(prisma.task.findMany).not.toHaveBeenCalled()
  })

  it('filtra por proyecto y por ejecutor', async () => {
    await search('?projectId=7&executor=agent')
    expect(whereOf()).toEqual(expect.objectContaining({ projectId: 7, isAgentTask: true }))
  })

  it('el rango de fechas va sobre el día de la jornada, no sobre createdAt', async () => {
    await search('?from=2026-11-01&to=2026-11-30')
    expect(whereOf().workDay).toEqual({ workspaceId: WORKSPACE_ID, date: { gte: '2026-11-01', lte: '2026-11-30' } })
  })

  it('403 al buscar tareas de otra persona sin ser admin', async () => {
    const res = await search('?userId=2')
    expect(res.status).toBe(403)
    expect(prisma.task.findMany).not.toHaveBeenCalled()
  })

  it('un admin sí puede buscar las de otra persona', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'admin', active: true })
    const res = await search('?userId=2', 'admin')
    expect(res.status).toBe(200)
    expect(whereOf().userId).toBe(2)
  })

  // Ver concepto "Proyectos privados": el nombre no es secreto, el contenido sí.
  it('quien no es admin no ve tareas de proyectos privados ajenos', async () => {
    await search('?q=x')
    expect(whereOf().project).toEqual({ OR: [{ isPrivate: false }, { members: { some: { userId: 1 } } }] })
  })

  it('un admin no arrastra ese filtro', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID, userId: 1, role: 'admin', active: true })
    await search('?q=x', 'admin')
    expect(whereOf().project).toBeUndefined()
  })

  it('topea el take y marca que hay más', async () => {
    prisma.task.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, i) => row({ id: i + 1 })))
    const res = await search('?take=999')

    expect(prisma.task.findMany.mock.calls[0][0].take).toBe(51) // 50 + 1 para saber si hay más
    expect(res.body.tasks).toHaveLength(50)
    expect(res.body.hasMore).toBe(true)
  })
})
