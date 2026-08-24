const { computeProjectPendingItems, computeWorkspacePendingSummary } = require('../services/marketingPending.service')

/**
 * GET /api/marketing/projects/:id/pending
 * Backlog único de pendientes accionables del proyecto (panel "Hoy").
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
 * Vista cross-proyecto: proyectos activos con pendientes, para el panel "Hoy" sin
 * proyecto seleccionado.
 */
async function getWorkspacePending(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projects = await computeWorkspacePendingSummary({ workspaceId, tz: req.workspace.timezone })
    res.json({ projects })
  } catch (err) { next(err) }
}

module.exports = { getProjectPending, getWorkspacePending }
