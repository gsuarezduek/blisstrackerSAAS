const prisma = require('../lib/prisma')
const { isValidBriefType } = require('../lib/briefCatalog')
const { isAdmin, canWrite } = require('../lib/projectAccess')

// Resuelve :id (numérico o name) a un projectId del workspace actual.
async function resolveProjectId(param, workspaceId) {
  const num = Number(param)
  if (Number.isInteger(num) && num > 0) {
    const p = await prisma.project.findFirst({ where: { id: num, workspaceId }, select: { id: true } })
    return p?.id ?? null
  }
  const p = await prisma.project.findFirst({ where: { name: param, workspaceId }, select: { id: true } })
  return p?.id ?? null
}

function shape(b) {
  return {
    type: b.type,
    answers: b.answers && typeof b.answers === 'object' ? b.answers : {},
    updatedAt: b.updatedAt,
  }
}

/**
 * GET /api/projects/:id/briefs
 * Lista todos los briefs del proyecto (cualquier miembro del workspace).
 */
async function listBriefs(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const briefs = await prisma.projectBrief.findMany({
      where: { projectId, workspaceId },
      orderBy: { updatedAt: 'desc' },
    })
    res.json({ briefs: briefs.map(shape) })
  } catch (err) { next(err) }
}

/**
 * PUT /api/projects/:id/briefs/:type
 * Upsert de las respuestas de un brief. Body: { answers: { fieldKey: value } }.
 * Modular: se guarda cada brief por separado, sin requerir completar todos los campos.
 */
async function saveBrief(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const { type } = req.params
    if (!isValidBriefType(type)) return res.status(400).json({ error: 'Tipo de brief inválido' })

    if (!(await canWrite(req, projectId))) {
      return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    const { answers } = req.body
    if (answers == null || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers debe ser un objeto' })
    }

    // Persistir solo strings; descartar valores vacíos para no inflar el JSON.
    const clean = {}
    for (const [k, v] of Object.entries(answers)) {
      if (v == null) continue
      const str = String(v).trim()
      if (str) clean[k] = str
    }

    const saved = await prisma.projectBrief.upsert({
      where:  { projectId_type: { projectId, type } },
      update: { answers: clean },
      create: { projectId, workspaceId, type, answers: clean },
    })
    res.json({ brief: shape(saved) })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/projects/:id/briefs/:type
 * Elimina por completo el brief (la fila en DB). Mismo criterio de escritura que saveBrief.
 */
async function deleteBrief(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const { type } = req.params
    if (!isValidBriefType(type)) return res.status(400).json({ error: 'Tipo de brief inválido' })

    if (!(await canWrite(req, projectId))) {
      return res.status(403).json({ error: 'No tenés acceso a este proyecto' })
    }

    await prisma.projectBrief.deleteMany({ where: { projectId, workspaceId, type } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { listBriefs, saveBrief, deleteBrief }
