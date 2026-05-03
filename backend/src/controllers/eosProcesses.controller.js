const prisma = require('../lib/prisma')

const VALID_STATUS = ['not_started', 'documented', 'followed']

// ─── GET /api/eos/processes ───────────────────────────────────────────────────

async function getProcesses(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const [members, processes] = await Promise.all([
      prisma.workspaceMember.findMany({
        where:   { workspaceId, active: true },
        include: { user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { user: { name: 'asc' } },
      }),
      prisma.eOSProcess.findMany({
        where:   { workspaceId },
        include: { steps: { orderBy: { order: 'asc' } } },
        orderBy: { order: 'asc' },
      }),
    ])

    res.json({
      members:   members.map(m => ({ id: m.user.id, name: m.user.name, avatar: m.user.avatar })),
      processes: processes.map(formatProcess),
    })
  } catch (err) { next(err) }
}

// ─── POST /api/eos/processes ──────────────────────────────────────────────────
// body: { name, ownerId? }

async function createProcess(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { name, ownerId } = req.body

    if (!name?.trim()) return res.status(400).json({ error: 'name es requerido' })

    const count = await prisma.eOSProcess.count({ where: { workspaceId } })

    const process = await prisma.eOSProcess.create({
      data: {
        workspaceId,
        name:    name.trim().slice(0, 200),
        ownerId: ownerId ? Number(ownerId) : null,
        order:   count,
      },
      include: { steps: true },
    })

    res.status(201).json(formatProcess(process))
  } catch (err) { next(err) }
}

// ─── PATCH /api/eos/processes/:id ─────────────────────────────────────────────
// body: { name?, ownerId?, status?, description?, order? }

async function updateProcess(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const { name, ownerId, status, description, order } = req.body

    const existing = await prisma.eOSProcess.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Proceso no encontrado' })

    if (status !== undefined && !VALID_STATUS.includes(status)) {
      return res.status(400).json({ error: 'status inválido' })
    }

    const data = {}
    if (name        !== undefined) data.name        = name.trim().slice(0, 200)
    if (ownerId     !== undefined) data.ownerId     = ownerId ? Number(ownerId) : null
    if (status      !== undefined) data.status      = status
    if (description !== undefined) data.description = description?.trim() || null
    if (order       !== undefined) data.order       = Number(order)

    const process = await prisma.eOSProcess.update({
      where:   { id },
      data,
      include: { steps: { orderBy: { order: 'asc' } } },
    })

    res.json(formatProcess(process))
  } catch (err) { next(err) }
}

// ─── DELETE /api/eos/processes/:id ────────────────────────────────────────────

async function deleteProcess(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)

    const existing = await prisma.eOSProcess.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Proceso no encontrado' })

    await prisma.eOSProcess.delete({ where: { id } })
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

// ─── POST /api/eos/processes/:id/steps ────────────────────────────────────────
// body: { title, description? }

async function createStep(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const processId   = Number(req.params.id)
    const { title, description } = req.body

    if (!title?.trim()) return res.status(400).json({ error: 'title es requerido' })

    const process = await prisma.eOSProcess.findFirst({ where: { id: processId, workspaceId } })
    if (!process) return res.status(404).json({ error: 'Proceso no encontrado' })

    const count = await prisma.eOSProcessStep.count({ where: { processId } })

    const step = await prisma.eOSProcessStep.create({
      data: {
        processId,
        workspaceId,
        title:       title.trim().slice(0, 300),
        description: description?.trim() || null,
        order:       count,
      },
    })

    res.status(201).json(formatStep(step))
  } catch (err) { next(err) }
}

// ─── PATCH /api/eos/processes/:id/steps/:stepId ───────────────────────────────
// body: { title?, description?, order? }

async function updateStep(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const processId   = Number(req.params.id)
    const stepId      = Number(req.params.stepId)
    const { title, description, order } = req.body

    const step = await prisma.eOSProcessStep.findFirst({ where: { id: stepId, processId, workspaceId } })
    if (!step) return res.status(404).json({ error: 'Paso no encontrado' })

    const data = {}
    if (title       !== undefined) data.title       = title.trim().slice(0, 300)
    if (description !== undefined) data.description = description?.trim() || null
    if (order       !== undefined) data.order       = Number(order)

    const updated = await prisma.eOSProcessStep.update({ where: { id: stepId }, data })
    res.json(formatStep(updated))
  } catch (err) { next(err) }
}

// ─── DELETE /api/eos/processes/:id/steps/:stepId ──────────────────────────────

async function deleteStep(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const processId   = Number(req.params.id)
    const stepId      = Number(req.params.stepId)

    const step = await prisma.eOSProcessStep.findFirst({ where: { id: stepId, processId, workspaceId } })
    if (!step) return res.status(404).json({ error: 'Paso no encontrado' })

    await prisma.eOSProcessStep.delete({ where: { id: stepId } })

    // Renumerar pasos restantes
    const remaining = await prisma.eOSProcessStep.findMany({
      where:   { processId, workspaceId },
      orderBy: { order: 'asc' },
    })
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i) {
        await prisma.eOSProcessStep.update({ where: { id: remaining[i].id }, data: { order: i } })
      }
    }

    res.json({ deleted: true })
  } catch (err) { next(err) }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatProcess(p) {
  return {
    id:          p.id,
    name:        p.name,
    ownerId:     p.ownerId,
    status:      p.status,
    description: p.description,
    order:       p.order,
    steps:       (p.steps || []).map(formatStep),
  }
}

function formatStep(s) {
  return {
    id:          s.id,
    processId:   s.processId,
    title:       s.title,
    description: s.description,
    order:       s.order,
  }
}

module.exports = {
  getProcesses, createProcess, updateProcess, deleteProcess,
  createStep, updateStep, deleteStep,
}
