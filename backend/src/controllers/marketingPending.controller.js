const prisma = require('../lib/prisma')
const {
  computeProjectPendingItems, computeWorkspacePendingSummary,
  dismissFinding, listDismissedFindings, undismissFinding,
} = require('../services/marketingPending.service')

const VALID_SOURCES = new Set(['geo', 'cannibal', 'pagespeed', 'keywords', 'objective', 'content', 'ads_advisor', 'rrss_advisor', 'report'])

/**
 * GET /api/marketing/projects/:id/pending
 * Backlog único de pendientes accionables del proyecto (panel "Prioridades").
 */
async function getProjectPending(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const result = await computeProjectPendingItems({ projectId, workspaceId, tz: req.workspace.timezone })
    if (!result) return res.status(404).json({ error: 'Proyecto no encontrado' })
    res.json(result)
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/summary/pending
 * Vista cross-proyecto: proyectos activos con pendientes, para el panel "Prioridades" sin
 * proyecto seleccionado. Marca `starred` (preferencia personal, mismo criterio que "Mis
 * Proyectos") para que el front pueda mostrar los destacados primero.
 */
async function getWorkspacePending(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projects = await computeWorkspacePendingSummary({ workspaceId, tz: req.workspace.timezone })
    const stars = await prisma.projectStar.findMany({
      where:  { userId: req.user.userId, projectId: { in: projects.map(p => p.projectId) } },
      select: { projectId: true },
    })
    const starredSet = new Set(stars.map(s => s.projectId))
    res.json({ projects: projects.map(p => ({ ...p, starred: starredSet.has(p.projectId) })) })
  } catch (err) { next(err) }
}

/**
 * POST /api/marketing/projects/:id/pending/dismiss
 * body: { source, title } — ignora un hallazgo del panel "Prioridades".
 */
async function dismiss(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const { source, title } = req.body
    if (!VALID_SOURCES.has(source)) return res.status(400).json({ error: 'source inválido' })
    if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title requerido' })
    await dismissFinding({ workspaceId, projectId, source, title, userId: req.user.userId })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * GET /api/marketing/projects/:id/pending/dismissed
 * Lista los hallazgos ignorados del proyecto (para "ver ignorados").
 */
async function listDismissed(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const items = await listDismissedFindings({ workspaceId, projectId })
    res.json({ items })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/marketing/projects/:id/pending/dismissed/:did
 * Restaura (des-ignora) un hallazgo.
 */
async function undismiss(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id
    const id = Number(req.params.did)
    const ok = await undismissFinding({ workspaceId, projectId, id })
    if (!ok) return res.status(404).json({ error: 'No encontrado' })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { getProjectPending, getWorkspacePending, dismiss, listDismissed, undismiss }
