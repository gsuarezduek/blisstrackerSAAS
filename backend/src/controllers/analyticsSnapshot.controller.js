const prisma = require('../lib/prisma')
const { saveMonthSnapshot, generateInsight } = require('../services/analyticsSnapshot.service')

const MONTH_RE = /^\d{4}-\d{2}$/

async function verifyProject(projectId, workspaceId) {
  return prisma.project.findFirst({
    where:  { id: projectId, workspaceId },
    select: { id: true },
  })
}

/**
 * GET /api/marketing/projects/:id/snapshots?month=2026-04
 * Devuelve el snapshot del mes indicado (o 404 si no existe).
 */
async function getSnapshot(req, res) {
  const projectId = Number(req.params.id)
  const { month } = req.query
  if (!month || !MONTH_RE.test(month))
    return res.status(400).json({ error: 'Formato de mes inválido. Usar YYYY-MM.' })

  if (!await verifyProject(projectId, req.workspace.id))
    return res.status(404).json({ error: 'Proyecto no encontrado' })

  const snap = await prisma.analyticsSnapshot.findUnique({
    where: { projectId_month: { projectId, month } },
  })
  if (!snap) return res.status(404).json({ error: 'No hay snapshot para este mes' })

  res.json({ ...snap, topChannels: JSON.parse(snap.topChannels) })
}

/**
 * POST /api/marketing/projects/:id/snapshots
 * Body: { month: "2026-04" }
 * Guarda (o actualiza) el snapshot del mes indicado con datos frescos de GA4.
 */
async function saveSnapshot(req, res) {
  const projectId = Number(req.params.id)
  const { month } = req.body
  if (!month || !MONTH_RE.test(month))
    return res.status(400).json({ error: 'Formato de mes inválido. Usar YYYY-MM.' })

  if (!await verifyProject(projectId, req.workspace.id))
    return res.status(404).json({ error: 'Proyecto no encontrado' })

  try {
    const snap = await saveMonthSnapshot(projectId, req.workspace.id, month)
    if (!snap)
      return res.status(400).json({ error: 'No se pudo guardar: verificá que GA4 esté conectado y con Property ID configurado' })
    res.json({ ...snap, topChannels: JSON.parse(snap.topChannels) })
  } catch (err) {
    console.error('[saveSnapshot]', err.message)
    res.status(500).json({ error: err.message })
  }
}

/**
 * GET /api/marketing/projects/:id/insights/:month
 * Devuelve el insight IA del mes (o 404 si no existe).
 */
async function getInsight(req, res) {
  const projectId = Number(req.params.id)
  const { month } = req.params
  if (!MONTH_RE.test(month))
    return res.status(400).json({ error: 'Formato de mes inválido. Usar YYYY-MM.' })

  if (!await verifyProject(projectId, req.workspace.id))
    return res.status(404).json({ error: 'Proyecto no encontrado' })

  const insight = await prisma.analyticsInsight.findUnique({
    where: { projectId_month: { projectId, month } },
  })
  if (!insight) return res.status(404).json({ error: 'No hay insight para este mes' })

  res.json({ ...insight, content: JSON.parse(insight.content) })
}

/**
 * POST /api/marketing/projects/:id/insights/:month
 * Genera (o regenera) el insight IA del mes. Requiere snapshot previo.
 */
async function createInsight(req, res) {
  const projectId = Number(req.params.id)
  const { month } = req.params
  if (!MONTH_RE.test(month))
    return res.status(400).json({ error: 'Formato de mes inválido. Usar YYYY-MM.' })

  if (!await verifyProject(projectId, req.workspace.id))
    return res.status(404).json({ error: 'Proyecto no encontrado' })

  try {
    const insight = await generateInsight(projectId, req.workspace.id, month)
    res.json(insight)
  } catch (err) {
    console.error('[createInsight]', err.message)
    res.status(500).json({ error: err.message })
  }
}

module.exports = { getSnapshot, saveSnapshot, getInsight, createInsight }
