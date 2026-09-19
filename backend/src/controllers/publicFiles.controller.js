// ─── Carpetas de Archivos compartidas por link público (sin auth) ───────────
// Cualquiera con el link navega/descarga el contenido de la carpeta compartida
// y sus subcarpetas — mismo criterio "no-adivinable = control de acceso" que
// Proposal.publicToken/MonthlyReport.token. El link nunca expone nada por
// fuera del subárbol de esa carpeta, aunque se adivine un parentId/fileId de
// otra parte del proyecto (ver isWithinSharedTree). Reusa shapeItem/buildPath
// ya exportados de projectFiles.controller.js — mismo shape que ve el equipo,
// mismo criterio que clientPortalFiles.controller.js.
const prisma = require('../lib/prisma')
const objectStorage = require('../services/objectStorage.service')
const { safeContentDisposition } = require('../lib/contentDisposition')
const { shapeItem, buildPath } = require('./projects/projectFiles.controller')

async function resolveSharedRoot(token) {
  if (!token) return null
  const root = await prisma.projectFile.findFirst({
    where: { publicToken: token, type: 'folder', deletedAt: null },
    select: { id: true, name: true, projectId: true },
  })
  if (!root) return null
  const project = await prisma.project.findUnique({
    where: { id: root.projectId },
    select: { name: true, filesEnabled: true, workspace: { select: { name: true, slug: true } } },
  })
  if (!project || project.filesEnabled === false) return null
  return { ...root, projectName: project.name, workspace: project.workspace }
}

// Sube por parentId desde `startId` hasta encontrar rootId (o quedarse sin
// padre) — determina si un ítem cae dentro del subárbol compartido. Mismo
// guardLoop acotado que buildPath (no debería haber más de un puñado de
// niveles de anidamiento en un repositorio de proyecto).
async function isWithinSharedTree(startId, rootId, projectId) {
  if (startId === rootId) return true
  let cursor = startId
  let guardLoop = 0
  while (cursor != null && guardLoop < 20) {
    const node = await prisma.projectFile.findFirst({ where: { id: cursor, projectId }, select: { parentId: true } })
    if (!node) return false
    if (node.parentId === rootId) return true
    cursor = node.parentId
    guardLoop++
  }
  return false
}

// Recorta el breadcrumb completo (desde la raíz DEL PROYECTO) a solo lo que va
// desde la carpeta compartida hacia abajo — un visitante externo nunca debe
// ver el nombre de carpetas por encima del punto que se le compartió.
function relativePath(fullPath, rootId) {
  const idx = fullPath.findIndex(p => p.id === rootId)
  return idx >= 0 ? fullPath.slice(idx + 1) : fullPath
}

/**
 * GET /api/public/shared-folder/:token?parentId=
 * Sin parentId, lista el contenido de la carpeta raíz compartida. Con
 * parentId, navega a una subcarpeta — validada como parte del subárbol.
 */
async function getSharedFolder(req, res, next) {
  try {
    const root = await resolveSharedRoot(req.params.token)
    if (!root) return res.status(404).json({ error: 'Este link no existe o fue desactivado.' })

    let parentId = root.id
    if (req.query.parentId) {
      const requested = Number(req.query.parentId)
      if (!Number.isInteger(requested) || requested <= 0) return res.status(400).json({ error: 'parentId inválido' })
      const within = await isWithinSharedTree(requested, root.id, root.projectId)
      if (!within) return res.status(404).json({ error: 'Carpeta no encontrada' })
      const folder = await prisma.projectFile.findFirst({ where: { id: requested, projectId: root.projectId, type: 'folder', deletedAt: null } })
      if (!folder) return res.status(404).json({ error: 'Carpeta no encontrada' })
      parentId = requested
    }

    const items = await prisma.projectFile.findMany({
      where: { projectId: root.projectId, parentId, deletedAt: null, OR: [{ type: 'folder' }, { type: 'file', status: 'ready' }] },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: [{ type: 'desc' }, { name: 'asc' }],
    })

    const fullPath = parentId !== root.id ? await buildPath(parentId, root.projectId) : []

    res.json({
      rootName: root.name,
      projectName: root.projectName,
      workspace: root.workspace,
      path: relativePath(fullPath, root.id),
      folders: items.filter(i => i.type === 'folder').map(shapeItem),
      files:   items.filter(i => i.type === 'file').map(shapeItem),
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/public/shared-folder/:token/search?q=
 * Acotado al subárbol compartido — nunca devuelve resultados de otras partes
 * del proyecto aunque coincidan por nombre.
 */
async function searchSharedFolder(req, res, next) {
  try {
    const root = await resolveSharedRoot(req.params.token)
    if (!root) return res.status(404).json({ error: 'Este link no existe o fue desactivado.' })

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (!q) return res.json({ items: [] })

    const candidates = await prisma.projectFile.findMany({
      where: {
        projectId: root.projectId, deletedAt: null,
        name: { contains: q, mode: 'insensitive' },
        OR: [{ type: 'folder' }, { type: 'file', status: 'ready' }],
        id: { not: root.id },
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      take: 50,
    })

    const shaped = []
    for (const f of candidates) {
      if (f.parentId == null) continue
      const within = await isWithinSharedTree(f.parentId, root.id, root.projectId)
      if (!within) continue
      const fullPath = await buildPath(f.parentId, root.projectId)
      shaped.push({ ...shapeItem(f), path: relativePath(fullPath, root.id) })
    }
    res.json({ items: shaped })
  } catch (err) { next(err) }
}

/**
 * GET /api/public/shared-folder/:token/download/:fileId[?inline=1]
 * Mismo proxy (no redirect a R2) que el resto de Archivos — ver el comentario
 * en downloadFile de projectFiles.controller.js sobre por qué.
 */
async function downloadSharedFile(req, res, next) {
  try {
    const root = await resolveSharedRoot(req.params.token)
    if (!root) return res.status(404).json({ error: 'Este link no existe o fue desactivado.' })

    const file = await prisma.projectFile.findFirst({
      where: { id: Number(req.params.fileId), projectId: root.projectId, type: 'file', status: 'ready', deletedAt: null },
    })
    if (!file || !file.objectKey || file.parentId == null) return res.status(404).json({ error: 'Archivo no encontrado' })
    const within = await isWithinSharedTree(file.parentId, root.id, root.projectId)
    if (!within) return res.status(404).json({ error: 'Archivo no encontrado' })

    const { body, contentLength } = await objectStorage.getObjectStream(file.objectKey)
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream')
    if (contentLength != null) res.setHeader('Content-Length', contentLength)
    const type = req.query.inline === '1' ? 'inline' : 'attachment'
    res.setHeader('Content-Disposition', safeContentDisposition(file.name, { type }))
    body.on('error', next)
    body.pipe(res)
  } catch (err) { next(err) }
}

module.exports = { getSharedFolder, searchSharedFolder, downloadSharedFile }
