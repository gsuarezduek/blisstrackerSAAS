const prisma = require('../../lib/prisma')
const { canWrite } = require('../../lib/projectAccess')
const { resolveProjectId, includeDetails } = require('./_shared')

async function assertToggleEnabled(projectId, field, label) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { [field]: true } })
  if (project?.[field] === false) {
    const err = new Error(`La sección de ${label} está deshabilitada para este workspace`)
    err.status = 403
    throw err
  }
}

async function saveLinks(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    await assertToggleEnabled(projectId, 'linksEnabled', 'Links')

    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const { links } = req.body
    if (!Array.isArray(links)) return res.status(400).json({ error: 'links debe ser un array' })
    for (const l of links) {
      if (!l.label?.trim() || !l.url?.trim()) {
        return res.status(400).json({ error: 'Cada link requiere label y url' })
      }
      try { new URL(l.url.trim()) }
      catch { return res.status(400).json({ error: `URL inválida: ${l.url}` }) }
    }

    await prisma.$transaction([
      prisma.projectLink.deleteMany({ where: { projectId } }),
      ...(links.length > 0
        ? [prisma.projectLink.createMany({
            data: links.map(l => ({ projectId, label: l.label.trim(), url: l.url.trim() })),
          })]
        : []),
    ])

    const updated = await prisma.project.findUnique({ where: { id: projectId }, include: includeDetails })
    res.json(updated)
  } catch (err) { next(err) }
}

async function saveSituation(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })
    await assertToggleEnabled(projectId, 'situationEnabled', 'Situación')

    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const { situation } = req.body
    if (typeof situation !== 'string') {
      return res.status(400).json({ error: 'situation debe ser un string' })
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { situation: situation.trim() || null },
      select: { situation: true },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/projects/:id/info
 * Actualiza websiteUrl y connections. Accesible por cualquier miembro del proyecto.
 */
async function saveInfo(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const projectId   = await resolveProjectId(req.params.id, workspaceId)
    if (!projectId) return res.status(404).json({ error: 'Proyecto no encontrado' })

    // Cualquier miembro del proyecto puede editar (no solo admin)
    if (!(await canWrite(req, projectId))) return res.status(403).json({ error: 'No tenés acceso a este proyecto' })

    const { websiteUrl, connections } = req.body
    const data = {}
    if (websiteUrl  !== undefined) data.websiteUrl  = websiteUrl || null
    if (connections !== undefined) data.connections = typeof connections === 'string' ? connections : JSON.stringify(connections)

    const updated = await prisma.project.update({
      where: { id: projectId },
      data,
      select: { websiteUrl: true, connections: true },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

module.exports = { saveLinks, saveSituation, saveInfo }
