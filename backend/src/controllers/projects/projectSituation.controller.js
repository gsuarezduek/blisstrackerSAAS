const prisma = require('../../lib/prisma')
const { isAdmin } = require('../../lib/projectAccess')
const { requestAgentId } = require('../tasks/_shared')
const { resolveProjectId } = require('./_shared')
const { assertToggleEnabled } = require('./projectSettings.controller')

// Situación de la cuenta: hojas que se acumulan por proyecto (ProjectSituationEntry).
// La más nueva es la "actual" — la única editable; las anteriores quedan como historial
// de solo lectura. Leer/crear/editar está abierto a cualquier miembro del workspace (la
// situación es información compartida, mismo criterio que tenía el campo único de
// antes); borrar, solo admin/owner o quien creó la hoja.

const MAX_CONTENT_CHARS = 200_000

const ENTRY_INCLUDE = {
  createdBy:      { select: { id: true, name: true, avatar: true } },
  updatedBy:      { select: { id: true, name: true } },
  createdByAgent: { select: { id: true, label: true } },
  updatedByAgent: { select: { id: true, label: true } },
}
const NEWEST_FIRST = [{ createdAt: 'desc' }, { id: 'desc' }]

function shapeEntry(req, entry, isCurrent) {
  return {
    ...entry,
    isCurrent,
    canDelete: isAdmin(req) || (entry.createdById != null && entry.createdById === req.user.userId),
  }
}

// El editor guarda HTML; un agente vía MCP puede mandar texto plano. Si no trae
// ninguna etiqueta, se arma en párrafos (escapado) para que se vea igual que lo
// escrito desde la app.
function toHtml(raw) {
  const text = String(raw).trim()
  if (!text || text === '<p></p>') return ''
  if (/<[a-z][\s\S]*>/i.test(text)) return text
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text.split(/\n{2,}/).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('')
}

function readContent(body) {
  const { content } = body || {}
  if (typeof content !== 'string') {
    const err = new Error('content debe ser un string'); err.status = 400; throw err
  }
  if (content.length > MAX_CONTENT_CHARS) {
    const err = new Error('La hoja es demasiado larga'); err.status = 400; throw err
  }
  return toHtml(content)
}

// requireProjectAccess (router.param de projects.routes.js) ya resolvió el proyecto
// dentro del workspace y validó la privacidad.
async function resolveProject(req) {
  const projectId = req.project?.id ?? await resolveProjectId(req.params.id, req.workspace.id)
  if (!projectId) {
    const err = new Error('Proyecto no encontrado'); err.status = 404; throw err
  }
  await assertToggleEnabled(projectId, 'situationEnabled', 'Situación')
  return projectId
}

function latestEntry(projectId) {
  return prisma.projectSituationEntry.findFirst({ where: { projectId }, orderBy: NEWEST_FIRST, select: { id: true } })
}

function sendError(res, next, err) {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message })
  next(err)
}

/** GET /api/projects/:id/situation — todas las hojas, la más nueva primero (= la actual). */
async function listEntries(req, res, next) {
  try {
    const projectId = await resolveProject(req)
    const entries = await prisma.projectSituationEntry.findMany({
      where: { projectId }, orderBy: NEWEST_FIRST, include: ENTRY_INCLUDE,
    })
    res.json({ entries: entries.map((e, i) => shapeEntry(req, e, i === 0)) })
  } catch (err) { sendError(res, next, err) }
}

/** POST /api/projects/:id/situation — hoja nueva; la que era actual pasa al historial. */
async function createEntry(req, res, next) {
  try {
    const projectId = await resolveProject(req)
    const content = readContent(req.body)
    // Una hoja vacía taparía a la anterior en el Resumen: la app recién crea la hoja
    // con lo primero que se escribe, y un agente siempre tiene que mandar contenido.
    if (!content) return res.status(400).json({ error: 'La hoja nueva no puede estar vacía' })

    const userId = req.user.userId
    const agentId = requestAgentId(req)
    const entry = await prisma.projectSituationEntry.create({
      data: {
        projectId, content,
        createdById: userId, updatedById: userId,
        createdByAgentId: agentId, updatedByAgentId: agentId,
      },
      include: ENTRY_INCLUDE,
    })
    res.status(201).json(shapeEntry(req, entry, true))
  } catch (err) { sendError(res, next, err) }
}

/** PATCH /api/projects/:id/situation/:entryId — edita la hoja actual (las anteriores son de solo lectura). */
async function updateEntry(req, res, next) {
  try {
    const projectId = await resolveProject(req)
    const entryId = Number(req.params.entryId)
    const content = readContent(req.body)

    const entry = await prisma.projectSituationEntry.findFirst({ where: { id: entryId, projectId }, select: { id: true } })
    if (!entry) return res.status(404).json({ error: 'Hoja no encontrada' })
    const latest = await latestEntry(projectId)
    if (latest.id !== entry.id) {
      return res.status(409).json({ error: 'Las hojas anteriores son de solo lectura: solo se puede editar la hoja actual' })
    }

    const updated = await prisma.projectSituationEntry.update({
      where: { id: entryId },
      data: { content, updatedById: req.user.userId, updatedByAgentId: requestAgentId(req) },
      include: ENTRY_INCLUDE,
    })
    res.json(shapeEntry(req, updated, true))
  } catch (err) { sendError(res, next, err) }
}

/** DELETE /api/projects/:id/situation/:entryId — admin/owner o quien creó la hoja. */
async function deleteEntry(req, res, next) {
  try {
    const projectId = await resolveProject(req)
    const entryId = Number(req.params.entryId)
    const entry = await prisma.projectSituationEntry.findFirst({ where: { id: entryId, projectId }, select: { id: true, createdById: true } })
    if (!entry) return res.status(404).json({ error: 'Hoja no encontrada' })
    if (!shapeEntry(req, entry, false).canDelete) {
      return res.status(403).json({ error: 'Solo un admin o quien creó la hoja puede borrarla' })
    }
    await prisma.projectSituationEntry.delete({ where: { id: entryId } })
    res.json({ ok: true })
  } catch (err) { sendError(res, next, err) }
}

module.exports = { listEntries, createEntry, updateEntry, deleteEntry, toHtml }
