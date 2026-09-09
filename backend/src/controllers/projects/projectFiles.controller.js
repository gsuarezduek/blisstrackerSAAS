// ─── ARCHIVOS DEL PROYECTO (repositorio tipo Drive) ─────────────────────────
// Igual que Accesos/Links/Info, visible y gestionable por cualquier miembro
// del workspace, no solo el equipo del proyecto (ProjectMember) o admins —
// es un reemplazo de un drive compartido de todo el equipo, no un recurso
// scopeado al equipo de un proyecto puntual.
//
// Los archivos van a Cloudflare R2 vía objectStorage.service.js, mismo patrón
// presign→PUT directo→confirm que usa Contenido (contentAssets.controller.js),
// pero sin whitelist de MIME por tipo: acá se acepta cualquier archivo salvo
// un denylist muy chico de tipos con riesgo real de XSS al servirse (html/svg).
const prisma = require('../../lib/prisma')
const objectStorage = require('../../services/objectStorage.service')
const { getSetting } = require('../../lib/platformSettings')
const { detectImageType } = require('../../lib/imageType')
const { detectVideoType } = require('../../lib/mediaType')
const { resolveProjectId } = require('./_shared')

const MAX_FILE_BYTES = 500 * 1024 * 1024 // 500MB — un solo PUT sin reintento parcial; más grande necesitaría multiparte
const DENIED_MIME = ['text/html', 'application/xhtml+xml', 'image/svg+xml']
const PRESIGN_EXPIRES_IN = 900 // 15 min (más margen que Contenido: archivos más pesados)
const PENDING_MAX_AGE_MS = 60 * 60 * 1000
const MAX_PENDING_PER_PROJECT = 5

// Resuelve el proyecto dentro del workspace actual + chequea el toggle filesEnabled.
async function resolveFilesGuard(req) {
  const workspaceId = req.workspace.id
  const projectId = await resolveProjectId(req.params.id, workspaceId)
  if (!projectId) return { error: 'Proyecto no encontrado', status: 404 }
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { filesEnabled: true } })
  if (project?.filesEnabled === false) {
    return { error: 'La sección de Archivos está deshabilitada para este workspace', status: 403 }
  }
  return { projectId, workspaceId }
}

function sanitizeName(name) {
  if (typeof name !== 'string') return null
  const clean = name.replace(/[/\\]/g, '').replace(/[\x00-\x1f]/g, '').trim()
  return clean ? clean.slice(0, 200) : null
}

function clampDim(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n < 20000 ? Math.round(n) : null
}

// width/height llegan del cliente (imagen decodificada en el browser antes de subir)
// — nunca se confían para nada de seguridad, solo se acotan a rangos razonables.
//
// `url` solo se expone para imágenes de verdad (raster, renderizables en un
// <img>) — es un link público sin auth a R2 (mismo criterio de "no-adivinable
// = control de acceso" que SocialImage/ContentAsset), pensado para la
// miniatura de la grilla. PDF/video/el resto NO tienen link público: se ven o
// se descargan siempre vía el endpoint autenticado /download (proxied, no
// redirect — ver objectStorage.getObjectStream), nunca directo contra R2.
function shapeItem(f) {
  const isImage = f.mimeType && f.mimeType.startsWith('image/')
  const isPreviewInBrowser = f.mimeType && (isImage || f.mimeType.startsWith('video/') || f.mimeType === 'application/pdf')
  return {
    id: f.id,
    type: f.type,
    name: f.name,
    status: f.status,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    width: f.width,
    height: f.height,
    url: f.type === 'file' && f.status === 'ready' && f.objectKey && isImage
      ? objectStorage.publicUrl(f.objectKey) : null,
    previewable: Boolean(f.type === 'file' && f.status === 'ready' && isPreviewInBrowser),
    posterUrl: f.posterKey ? objectStorage.publicUrl(f.posterKey) : null,
    uploadedBy: f.uploadedBy ? { id: f.uploadedBy.id, name: f.uploadedBy.name } : null,
    createdAt: f.createdAt,
  }
}

// Breadcrumb: sube por parentId hasta la raíz. Acotado — no debería haber más
// de un puñado de niveles de anidamiento en un repositorio de proyecto.
async function buildPath(folderId, projectId) {
  const path = []
  let cursor = folderId
  let guardLoop = 0
  while (cursor != null && guardLoop < 20) {
    const node = await prisma.projectFile.findFirst({
      where: { id: cursor, projectId }, select: { id: true, name: true, parentId: true },
    })
    if (!node) break
    path.unshift({ id: node.id, name: node.name })
    cursor = node.parentId
    guardLoop++
  }
  return path
}

/** Cuota de storage del workspace (archivos ready + pending). 0 = ilimitado. */
async function assertWithinQuota(workspaceId, extraBytes) {
  const limitMb = await getSetting('projectFilesMaxMbPerWorkspace')
  if (!limitMb) return null
  const limitBytes = limitMb * 1024 * 1024
  const agg = await prisma.projectFile.aggregate({
    where: { workspaceId, type: 'file', status: { in: ['ready', 'pending'] } },
    _sum: { sizeBytes: true },
  })
  const used = agg._sum.sizeBytes || 0
  if (used + extraBytes > limitBytes) {
    return `Se alcanzó el límite de almacenamiento del workspace (${limitMb} MB).`
  }
  return null
}

/**
 * GET /api/projects/:id/files?parentId=
 * Lista carpetas + archivos de UN nivel (no recursivo) + breadcrumb. Solo
 * archivos 'ready' (oculta subidas pendientes/abandonadas de otras sesiones)
 * y nunca los que están en la papelera (deletedAt).
 */
async function listFiles(req, res, next) {
  try {
    const guard = await resolveFilesGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const { projectId } = guard

    let parentId = null
    if (req.query.parentId) {
      parentId = Number(req.query.parentId)
      if (!Number.isInteger(parentId) || parentId <= 0) return res.status(400).json({ error: 'parentId inválido' })
      const parent = await prisma.projectFile.findFirst({ where: { id: parentId, projectId, type: 'folder', deletedAt: null } })
      if (!parent) return res.status(404).json({ error: 'Carpeta no encontrada' })
    }

    const items = await prisma.projectFile.findMany({
      where: { projectId, parentId, deletedAt: null, OR: [{ type: 'folder' }, { type: 'file', status: 'ready' }] },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: [{ type: 'desc' }, { name: 'asc' }], // 'folder' > 'file' alfabéticamente → carpetas primero
    })
    const path = parentId ? await buildPath(parentId, projectId) : []

    res.json({
      folders: items.filter(i => i.type === 'folder').map(shapeItem),
      files:   items.filter(i => i.type === 'file').map(shapeItem),
      path,
    })
  } catch (err) { next(err) }
}

/**
 * GET /api/projects/:id/files/search?q=
 * Buscador global del proyecto (no acotado a la carpeta actual): substring
 * case-insensitive sobre el nombre, cualquier nivel de anidamiento. Cada
 * resultado incluye su breadcrumb (`path`) para poder navegar directo a la
 * carpeta que lo contiene sin que el usuario tenga que buscarla a mano.
 */
async function searchFiles(req, res, next) {
  try {
    const guard = await resolveFilesGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const { projectId } = guard

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (!q) return res.json({ items: [] })

    const items = await prisma.projectFile.findMany({
      where: {
        projectId, deletedAt: null,
        name: { contains: q, mode: 'insensitive' },
        OR: [{ type: 'folder' }, { type: 'file', status: 'ready' }],
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      take: 50,
    })

    const shaped = []
    for (const f of items) {
      shaped.push({ ...shapeItem(f), path: f.parentId ? await buildPath(f.parentId, projectId) : [] })
    }
    res.json({ items: shaped })
  } catch (err) { next(err) }
}

/** POST /api/projects/:id/files/folders — { name, parentId? } */
async function createFolder(req, res, next) {
  try {
    const guard = await resolveFilesGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const { projectId, workspaceId } = guard

    const name = sanitizeName(req.body?.name)
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })

    const parentId = req.body?.parentId != null ? Number(req.body.parentId) : null
    if (parentId != null) {
      const parent = await prisma.projectFile.findFirst({ where: { id: parentId, projectId, type: 'folder', deletedAt: null } })
      if (!parent) return res.status(404).json({ error: 'Carpeta destino no encontrada' })
    }

    const folder = await prisma.projectFile.create({
      data: { projectId, workspaceId, parentId, type: 'folder', name, uploadedById: req.user.userId },
    })
    res.status(201).json(shapeItem(folder))
  } catch (err) { next(err) }
}

/**
 * POST /api/projects/:id/files/presign — { name, mimeType, sizeBytes, parentId? }
 * Valida SIN ver los bytes (metadata declarada por el cliente); el tamaño y
 * tipo reales se verifican en confirmFile, sobre el objeto ya subido.
 */
async function presignFile(req, res, next) {
  try {
    const guard = await resolveFilesGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const { projectId, workspaceId } = guard

    if (!objectStorage.isConfigured()) {
      return res.status(503).json({ error: 'La subida de archivos no está configurada en este workspace.', code: 'STORAGE_NOT_CONFIGURED' })
    }

    const name = sanitizeName(req.body?.name)
    if (!name) return res.status(400).json({ error: 'Nombre de archivo requerido' })

    const mimeType = typeof req.body?.mimeType === 'string' && req.body.mimeType.trim()
      ? req.body.mimeType.trim() : 'application/octet-stream'
    if (DENIED_MIME.includes(mimeType)) return res.status(400).json({ error: 'Este tipo de archivo no está permitido.' })

    const declaredSize = Number(req.body?.sizeBytes)
    if (!Number.isInteger(declaredSize) || declaredSize <= 0) return res.status(400).json({ error: 'sizeBytes inválido' })
    if (declaredSize > MAX_FILE_BYTES) {
      return res.status(413).json({ error: `El archivo supera el máximo permitido (${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB).` })
    }

    const parentId = req.body?.parentId != null ? Number(req.body.parentId) : null
    if (parentId != null) {
      const parent = await prisma.projectFile.findFirst({ where: { id: parentId, projectId, type: 'folder', deletedAt: null } })
      if (!parent) return res.status(404).json({ error: 'Carpeta destino no encontrada' })
    }

    const pendingCount = await prisma.projectFile.count({
      where: { projectId, type: 'file', status: 'pending', createdAt: { gt: new Date(Date.now() - PENDING_MAX_AGE_MS) } },
    })
    if (pendingCount >= MAX_PENDING_PER_PROJECT) {
      return res.status(400).json({ error: 'Hay demasiadas subidas en curso en este proyecto. Esperá a que terminen o reintentá en unos minutos.' })
    }

    const quotaError = await assertWithinQuota(workspaceId, declaredSize)
    if (quotaError) return res.status(413).json({ error: quotaError, code: 'STORAGE_QUOTA_EXCEEDED' })

    const objectKey = objectStorage.buildKey(`files/${workspaceId}`, mimeType)

    const file = await prisma.projectFile.create({
      data: {
        projectId, workspaceId, parentId, type: 'file', status: 'pending',
        name, mimeType, objectKey, sizeBytes: declaredSize,
        uploadedById: req.user.userId,
      },
    })

    const uploadUrl = await objectStorage.presignPut(objectKey, mimeType, { expiresIn: PRESIGN_EXPIRES_IN })
    res.status(201).json({ fileId: file.id, uploadUrl, expiresIn: PRESIGN_EXPIRES_IN })
  } catch (err) { next(err) }
}

/**
 * POST /api/projects/:id/files/:fileId/confirm — { width?, height?, posterFileId? }
 * Confirma un upload directo a R2: valida tamaño real sobre el objeto ya
 * subido. Si el mimeType declarado corresponde a un formato de imagen/video
 * conocido, corrige el mimeType con la firma real (best-effort); para el
 * resto (PDF, docx, zip, etc. — sin catálogo cerrado como en Contenido) se
 * confía en el declarado. Cualquier mismatch con el denylist borra el objeto.
 */
async function confirmFile(req, res, next) {
  try {
    const guard = await resolveFilesGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const { projectId } = guard

    const file = await prisma.projectFile.findFirst({
      where: { id: Number(req.params.fileId), projectId, type: 'file' },
    })
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' })
    if (file.status !== 'pending') return res.status(409).json({ error: 'Este archivo ya fue confirmado.' })

    async function reject(status, error, code) {
      await objectStorage.deleteObject(file.objectKey)
      await prisma.projectFile.delete({ where: { id: file.id } })
      res.status(status).json(code ? { error, code } : { error })
    }

    const head = await objectStorage.headObject(file.objectKey)
    if (!head) return reject(400, 'No se encontró el archivo subido. Probá de nuevo.', 'UPLOAD_NOT_FOUND')
    if (head.size > MAX_FILE_BYTES) {
      return reject(413, `El archivo supera el máximo permitido (${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB).`)
    }

    let mimeType = file.mimeType
    const headerBuf = await objectStorage.getObjectHead(file.objectKey, 32)
    mimeType = detectImageType(headerBuf) || detectVideoType(headerBuf) || mimeType
    if (DENIED_MIME.includes(mimeType)) return reject(400, 'Este tipo de archivo no está permitido.')

    let posterKey = null
    if (req.body?.posterFileId) {
      const poster = await prisma.projectFile.findFirst({
        where: { id: Number(req.body.posterFileId), projectId, type: 'file', status: 'ready', mimeType: { startsWith: 'image/' } },
        select: { objectKey: true },
      })
      if (poster) posterKey = poster.objectKey
    }

    const updated = await prisma.projectFile.update({
      where: { id: file.id },
      data: {
        status: 'ready',
        sizeBytes: head.size, // autoritativo, no lo declarado en el presign
        mimeType,
        width:  clampDim(req.body?.width),
        height: clampDim(req.body?.height),
        posterKey,
        confirmedAt: new Date(),
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    })
    res.json(shapeItem(updated))
  } catch (err) { next(err) }
}

/**
 * PATCH /api/projects/:id/files/:itemId — { name?, parentId? }
 * Renombrar y/o mover, carpeta o archivo indistintamente.
 */
async function updateItem(req, res, next) {
  try {
    const guard = await resolveFilesGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const { projectId } = guard

    const item = await prisma.projectFile.findFirst({ where: { id: Number(req.params.itemId), projectId, deletedAt: null } })
    if (!item) return res.status(404).json({ error: 'No encontrado' })

    const data = {}
    if (req.body?.name !== undefined) {
      const name = sanitizeName(req.body.name)
      if (!name) return res.status(400).json({ error: 'Nombre inválido' })
      data.name = name
    }

    if (req.body?.parentId !== undefined) {
      const parentId = req.body.parentId != null ? Number(req.body.parentId) : null
      if (parentId != null) {
        const target = await prisma.projectFile.findFirst({ where: { id: parentId, projectId, type: 'folder', deletedAt: null } })
        if (!target) return res.status(404).json({ error: 'Carpeta destino no encontrada' })

        // Evita mover una carpeta dentro de sí misma o de una de sus propias subcarpetas.
        if (item.type === 'folder') {
          let cursor = parentId
          let guardLoop = 0
          while (cursor != null && guardLoop < 50) {
            if (cursor === item.id) {
              return res.status(400).json({ error: 'No se puede mover una carpeta dentro de sí misma o de una de sus subcarpetas' })
            }
            const node = await prisma.projectFile.findFirst({ where: { id: cursor, projectId }, select: { parentId: true } })
            cursor = node?.parentId ?? null
            guardLoop++
          }
        }
      }
      data.parentId = parentId
    }

    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nada para actualizar' })

    const updated = await prisma.projectFile.update({
      where: { id: item.id },
      data,
      include: { uploadedBy: { select: { id: true, name: true } } },
    })
    res.json(shapeItem(updated))
  } catch (err) { next(err) }
}

// IDs de todo el subárbol de una carpeta (BFS por parentId), sin importar su
// estado de papelera actual — se usa para cascadear deletedAt (borrar/restaurar)
// a todo el contenido junto. Todo en JS, no una CTE recursiva — la profundidad
// esperada acá es baja, no vale la complejidad.
async function collectDescendantIds(rootId, projectId) {
  const ids = []
  let frontier = [rootId]
  let guardLoop = 0
  while (frontier.length > 0 && guardLoop < 1000) {
    const children = await prisma.projectFile.findMany({
      where: { projectId, parentId: { in: frontier } },
      select: { id: true },
    })
    ids.push(...children.map(c => c.id))
    frontier = children.map(c => c.id)
    guardLoop++
  }
  return ids
}

/**
 * DELETE /api/projects/:id/files/:itemId
 * Soft-delete (papelera), NO toca R2 todavía — mismo patrón que ContentPiece.
 * Al borrar una carpeta se cascadea el mismo deletedAt/deletedById a todo su
 * subárbol (si no, sus hijos quedarían "vivos" pero inalcanzables, ocultos
 * bajo un padre borrado). La limpieza semanal (cleanup.service.js) es quien
 * de verdad borra de R2 y de la DB, pasado projectFileTrashRetentionDays.
 */
async function deleteItem(req, res, next) {
  try {
    const guard = await resolveFilesGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const { projectId } = guard

    const item = await prisma.projectFile.findFirst({ where: { id: Number(req.params.itemId), projectId, deletedAt: null } })
    if (!item) return res.status(404).json({ error: 'No encontrado' })

    const ids = item.type === 'folder' ? [item.id, ...(await collectDescendantIds(item.id, projectId))] : [item.id]
    await prisma.projectFile.updateMany({
      where: { id: { in: ids } },
      data:  { deletedAt: new Date(), deletedById: req.user.userId },
    })

    res.json({ deleted: true })
  } catch (err) { next(err) }
}

/**
 * GET /api/projects/:id/files/trash
 * Solo las "raíces" de cada subárbol borrado (padre no borrado, o sin padre)
 * — así una carpeta con 50 archivos aparece como UNA fila, no 51 (sus hijos
 * viajan implícitos: restaurar la raíz los restaura a todos).
 */
async function listTrash(req, res, next) {
  try {
    const guard = await resolveFilesGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const { projectId } = guard

    const items = await prisma.projectFile.findMany({
      where: {
        projectId, deletedAt: { not: null },
        OR: [{ parentId: null }, { parent: { deletedAt: null } }],
      },
      include: { deletedBy: { select: { id: true, name: true } } },
      orderBy: { deletedAt: 'desc' },
    })

    res.json({
      items: items.map(f => ({
        id: f.id, type: f.type, name: f.name, mimeType: f.mimeType, sizeBytes: f.sizeBytes,
        deletedAt: f.deletedAt,
        deletedBy: f.deletedBy ? { id: f.deletedBy.id, name: f.deletedBy.name } : null,
      })),
    })
  } catch (err) { next(err) }
}

/**
 * POST /api/projects/:id/files/:itemId/restore
 * Saca de la papelera (y cascadea a todo su subárbol, si es carpeta). Si el
 * padre sigue borrado (o ya no existe), restaura a la raíz del proyecto en
 * vez de dejarlo huérfano dentro de una carpeta todavía en la papelera.
 */
async function restoreItem(req, res, next) {
  try {
    const guard = await resolveFilesGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const { projectId } = guard

    const item = await prisma.projectFile.findFirst({ where: { id: Number(req.params.itemId), projectId, deletedAt: { not: null } } })
    if (!item) return res.status(404).json({ error: 'No encontrado en la papelera' })

    let parentId = item.parentId
    if (parentId != null) {
      const parent = await prisma.projectFile.findFirst({ where: { id: parentId, projectId, deletedAt: null } })
      if (!parent) parentId = null
    }

    const ids = item.type === 'folder' ? [item.id, ...(await collectDescendantIds(item.id, projectId))] : [item.id]
    await prisma.projectFile.updateMany({
      where: { id: { in: ids } },
      data:  { deletedAt: null, deletedById: null },
    })
    if (parentId !== item.parentId) {
      await prisma.projectFile.update({ where: { id: item.id }, data: { parentId } })
    }

    res.json({ restored: true })
  } catch (err) { next(err) }
}

/**
 * GET /api/projects/:id/files/:fileId/download[?inline=1]
 * Autenticado (a diferencia del serve público de Contenido, pensado para el
 * portal de cliente) — por eso NO se puede resolver con un 302 a una URL
 * firmada de R2: el frontend pega a esta ruta vía fetch/XHR con el header
 * Authorization (no una navegación real de página), así que el redirect final
 * cross-origin queda sujeto al CORS del bucket, que no está configurado para
 * nuestro dominio. En cambio, hacemos *proxy* de los bytes: pedimos el stream
 * a R2 y lo mandamos tal cual por nuestra propia respuesta (mismo origen que
 * el resto de la API, ya con CORS resuelto). `?inline=1` sirve para que el
 * frontend lo use como <video>/<iframe> (blob con Content-Type real) en vez
 * de forzar "Guardar como" — en ambos casos el frontend lo pide como blob vía
 * JS, nunca como navegación de página, así que el header Content-Disposition
 * es solo informativo (no dispara nada por sí solo en ese flujo).
 */
async function downloadFile(req, res, next) {
  try {
    const guard = await resolveFilesGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const { projectId } = guard

    const file = await prisma.projectFile.findFirst({
      where: { id: Number(req.params.fileId), projectId, type: 'file', status: 'ready', deletedAt: null },
    })
    if (!file || !file.objectKey) return res.status(404).json({ error: 'Archivo no encontrado' })

    const { body, contentType, contentLength } = await objectStorage.getObjectStream(file.objectKey)
    res.setHeader('Content-Type', contentType || file.mimeType || 'application/octet-stream')
    if (contentLength != null) res.setHeader('Content-Length', contentLength)
    const disposition = req.query.inline === '1' ? 'inline' : 'attachment'
    res.setHeader('Content-Disposition', `${disposition}; filename="${file.name.replace(/"/g, "'")}"`)
    body.on('error', next)
    body.pipe(res)
  } catch (err) { next(err) }
}

/**
 * GET /api/projects/:id/files/:fileId/locate
 * Para el deep-link "🔗 Copiar enlace" de un archivo (ej. pegado en la
 * descripción de una tarea): dado solo el fileId, devuelve el archivo + el
 * breadcrumb de su carpeta contenedora, para que el frontend pueda navegar
 * directo a esa carpeta y abrirlo sin que quien pega el link tenga que saber
 * la ruta.
 */
async function locateFile(req, res, next) {
  try {
    const guard = await resolveFilesGuard(req)
    if (guard.error) return res.status(guard.status).json({ error: guard.error })
    const { projectId } = guard

    const file = await prisma.projectFile.findFirst({
      where: { id: Number(req.params.fileId), projectId, type: 'file', status: 'ready', deletedAt: null },
      include: { uploadedBy: { select: { id: true, name: true } } },
    })
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' })

    const path = file.parentId ? await buildPath(file.parentId, projectId) : []
    res.json({ file: shapeItem(file), parentId: file.parentId, path })
  } catch (err) { next(err) }
}

module.exports = {
  listFiles,
  searchFiles,
  createFolder,
  presignFile,
  confirmFile,
  updateItem,
  deleteItem,
  listTrash,
  restoreItem,
  downloadFile,
  locateFile,
  // exportados para tests
  MAX_FILE_BYTES,
  DENIED_MIME,
}
