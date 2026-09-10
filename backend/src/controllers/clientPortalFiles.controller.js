// ─── ARCHIVOS DEL PROYECTO — vista de solo lectura para el portal de cliente ──
// El cliente ve exactamente el mismo repositorio que el equipo interno
// (mismos folders/files, mismo shape) pero sin poder crear, subir, renombrar,
// mover ni borrar nada — replica listFiles/searchFiles/downloadFile de
// projectFiles.controller.js reusando sus helpers (shapeItem, buildPath),
// solo que resolviendo projectId/workspaceId desde req.clientPortal en vez de
// req.workspace/req.params.id (mismo patrón que contentPortal.controller.js
// respecto de content.controller.js).
const prisma = require('../lib/prisma')
const objectStorage = require('../services/objectStorage.service')
const { safeContentDisposition } = require('../lib/contentDisposition')
const { shapeItem, buildPath } = require('./projects/projectFiles.controller')

/**
 * Dos guardas que ningún middleware da acá (las rutas públicas no pasan por
 * resolveWorkspace): el opt-in del portal (showFiles) y el toggle de la
 * sección a nivel workspace (Project.filesEnabled).
 */
async function assertFilesAccess(portal) {
  if (!portal.showFiles) {
    return { status: 404, error: 'La sección de Archivos no está habilitada para este proyecto' }
  }
  const project = await prisma.project.findUnique({ where: { id: portal.projectId }, select: { filesEnabled: true } })
  if (project?.filesEnabled === false) {
    return { status: 404, error: 'La sección de Archivos está deshabilitada para este workspace' }
  }
  return null
}

/**
 * GET /api/public/client-portal/:slug/files?parentId=
 */
async function listPortalFiles(req, res, next) {
  try {
    const portal = req.clientPortal
    const guard = await assertFilesAccess(portal)
    if (guard) return res.status(guard.status).json({ error: guard.error })

    let parentId = null
    if (req.query.parentId) {
      parentId = Number(req.query.parentId)
      if (!Number.isInteger(parentId) || parentId <= 0) return res.status(400).json({ error: 'parentId inválido' })
      const parent = await prisma.projectFile.findFirst({ where: { id: parentId, projectId: portal.projectId, type: 'folder', deletedAt: null } })
      if (!parent) return res.status(404).json({ error: 'Carpeta no encontrada' })
    }

    const items = await prisma.projectFile.findMany({
      where: { projectId: portal.projectId, parentId, deletedAt: null, OR: [{ type: 'folder' }, { type: 'file', status: 'ready' }] },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: [{ type: 'desc' }, { name: 'asc' }],
    })
    const path = parentId ? await buildPath(parentId, portal.projectId) : []

    res.json({
      folders: items.filter(i => i.type === 'folder').map(shapeItem),
      files:   items.filter(i => i.type === 'file').map(shapeItem),
      path,
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/public/client-portal/:slug/files/search?q=
 */
async function searchPortalFiles(req, res, next) {
  try {
    const portal = req.clientPortal
    const guard = await assertFilesAccess(portal)
    if (guard) return res.status(guard.status).json({ error: guard.error })

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (!q) return res.json({ items: [] })

    const items = await prisma.projectFile.findMany({
      where: {
        projectId: portal.projectId, deletedAt: null,
        name: { contains: q, mode: 'insensitive' },
        OR: [{ type: 'folder' }, { type: 'file', status: 'ready' }],
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      take: 50,
    })

    const shaped = []
    for (const f of items) {
      shaped.push({ ...shapeItem(f), path: f.parentId ? await buildPath(f.parentId, portal.projectId) : [] })
    }
    res.json({ items: shaped })
  } catch (err) { next(err) }
}

/**
 * GET /api/public/client-portal/:slug/files/:fileId/download[?inline=1]
 * Mismo criterio de proxy (no redirect a R2) que el endpoint autenticado de
 * equipo — acá el motivo es el mismo: el frontend pega con fetch/axios y el
 * header Authorization del portal, no con una navegación real de página.
 */
async function downloadPortalFile(req, res, next) {
  try {
    const portal = req.clientPortal
    const guard = await assertFilesAccess(portal)
    if (guard) return res.status(guard.status).json({ error: guard.error })

    const file = await prisma.projectFile.findFirst({
      where: { id: Number(req.params.fileId), projectId: portal.projectId, type: 'file', status: 'ready', deletedAt: null },
    })
    if (!file || !file.objectKey) return res.status(404).json({ error: 'Archivo no encontrado' })

    const { body, contentLength } = await objectStorage.getObjectStream(file.objectKey)
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream')
    if (contentLength != null) res.setHeader('Content-Length', contentLength)
    const type = req.query.inline === '1' ? 'inline' : 'attachment'
    res.setHeader('Content-Disposition', safeContentDisposition(file.name, { type }))
    body.on('error', next)
    body.pipe(res)
  } catch (err) { next(err) }
}

module.exports = {
  listPortalFiles,
  searchPortalFiles,
  downloadPortalFile,
}
