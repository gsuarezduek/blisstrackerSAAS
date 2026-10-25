// ─── ADJUNTOS DE TAREAS ──────────────────────────────────────────────────────
// Adjuntar un archivo a una tarea lo sube directo al repositorio de Archivos
// del proyecto (ProjectFile, mismo bucket R2) — no es un adjunto aparte que
// vive solo "dentro" de la tarea. La carpeta destino se resuelve sola la
// primera vez ("Tareas / <Mes> / <título de la tarea>", mismo criterio de
// organización que usa Contenido para sus assets — ver contentFileMirror.
// service.js) y el vínculo queda registrado en TaskFile. Mismo flujo
// presign→PUT directo a R2→confirm y las mismas validaciones (MIME denylist,
// tamaño, magic bytes, cuota) que POST /api/projects/:id/files/presign —
// acá solo cambia de dónde sale el parentId y que además se crea el vínculo.
const axios = require('axios')
const prisma = require('../../lib/prisma')
const { assertPublicUrl } = require('../../lib/safeUrl')
const objectStorage = require('../../services/objectStorage.service')
const { detectImageType } = require('../../lib/imageType')
const { detectVideoType } = require('../../lib/mediaType')
const { detectDocumentType } = require('../../lib/documentType')
const { findOrCreateFolder } = require('../../lib/projectFileTree')
const { monthLabel } = require('../../lib/monthUtils')
const { todayString } = require('../../utils/dates')
const { isDangerousMime } = require('../../lib/dangerousMime')
const {
  sanitizeName, shapeItem, MAX_FILE_BYTES, assertWithinQuota, PRESIGN_EXPIRES_IN,
} = require('../projects/projectFiles.controller')

const PENDING_MAX_AGE_MS = 60 * 60 * 1000
const MAX_PENDING_PER_TASK = 5
const MAX_ATTACHMENTS_PER_TASK = 30
const ROOT_FOLDER_NAME = 'Tareas'

// Subida del lado del servidor (agentes vía MCP, que no pueden hacer el PUT a R2).
// El body JSON está topeado a 1MB (app.js), así que content/contentBase64 sirven para
// archivos chicos; los pesados (imágenes, videos) entran por url.
const DIRECT_MAX_BYTES = 25 * 1024 * 1024
const URL_MAX_REDIRECTS = 3
const MIME_BY_EXT = {
  md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain', csv: 'text/csv',
  tsv: 'text/tab-separated-values', json: 'application/json',
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
const httpError = (status, error, code) => Object.assign(new Error(error), { status, code, isOperational: true })

// Mismo criterio de acceso que los comentarios de tareas (comments.controller.js
// getTaskWithAccess): cualquier miembro activo del workspace, no solo el equipo
// del proyecto — "equipo = etiqueta, no barrera".
async function getTaskWithAccess(taskId, workspaceId) {
  return prisma.task.findFirst({
    where:  { id: taskId, workDay: { workspaceId } },
    select: {
      id: true, description: true, projectId: true,
      project: { select: { id: true, name: true, timezone: true, filesEnabled: true } },
    },
  })
}

// Resuelve (creando si hace falta) "Tareas / <Mes> / <título de la tarea>".
async function resolveTaskFolder(task, workspaceId, uploaderId) {
  const month = todayString(task.project.timezone).slice(0, 7)
  const monthName = sanitizeName(monthLabel(month)) || month
  const taskName = sanitizeName(task.description) || `Tarea #${task.id}`

  const rootId  = await findOrCreateFolder(task.projectId, workspaceId, null, ROOT_FOLDER_NAME, uploaderId)
  const monthId = await findOrCreateFolder(task.projectId, workspaceId, rootId, monthName, uploaderId)
  return findOrCreateFolder(task.projectId, workspaceId, monthId, taskName, uploaderId)
}

/**
 * GET /api/tasks/:id/attachments
 */
async function listAttachments(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const task = await getTaskWithAccess(taskId, req.workspace.id)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const links = await prisma.taskFile.findMany({
      where:   { taskId, file: { deletedAt: null, status: 'ready' } },
      include: { file: { include: { uploadedBy: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'asc' },
    })
    res.json(links.map(l => ({ ...shapeItem(l.file), taskFileId: l.id, projectId: task.projectId })))
  } catch (err) { next(err) }
}

/**
 * POST /api/tasks/:id/attachments/presign — { name, mimeType, sizeBytes }
 * Mismas validaciones que POST /api/projects/:id/files/presign — acá la
 * única diferencia es que el parentId no lo elige el cliente: se resuelve
 * (creando la carpeta si hace falta) contra "Tareas / <Mes> / <tarea>".
 */
async function presignAttachment(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const task = await getTaskWithAccess(taskId, req.workspace.id)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })
    if (task.project?.filesEnabled === false) {
      return res.status(403).json({ error: 'La sección de Nube está deshabilitada para este workspace' })
    }

    if (!objectStorage.isConfigured()) {
      return res.status(503).json({ error: 'La subida de archivos no está configurada en este workspace.', code: 'STORAGE_NOT_CONFIGURED' })
    }

    const name = sanitizeName(req.body?.name)
    if (!name) return res.status(400).json({ error: 'Nombre de archivo requerido' })

    const mimeType = typeof req.body?.mimeType === 'string' && req.body.mimeType.trim()
      ? req.body.mimeType.trim() : 'application/octet-stream'
    if (isDangerousMime(mimeType)) return res.status(400).json({ error: 'Este tipo de archivo no está permitido.' })

    const declaredSize = Number(req.body?.sizeBytes)
    if (!Number.isInteger(declaredSize) || declaredSize <= 0) return res.status(400).json({ error: 'sizeBytes inválido' })
    if (declaredSize > MAX_FILE_BYTES) {
      return res.status(413).json({ error: `El archivo supera el máximo permitido (${Math.round(MAX_FILE_BYTES / (1024 * 1024))}MB).` })
    }

    const [pendingCount, linkedCount] = await Promise.all([
      prisma.taskFile.count({
        where: { taskId, file: { status: 'pending', createdAt: { gt: new Date(Date.now() - PENDING_MAX_AGE_MS) } } },
      }),
      prisma.taskFile.count({ where: { taskId, file: { status: 'ready', deletedAt: null } } }),
    ])
    if (pendingCount >= MAX_PENDING_PER_TASK) {
      return res.status(400).json({ error: 'Hay demasiadas subidas en curso en esta tarea. Esperá a que terminen.' })
    }
    if (linkedCount >= MAX_ATTACHMENTS_PER_TASK) {
      return res.status(400).json({ error: `Esta tarea ya tiene el máximo de ${MAX_ATTACHMENTS_PER_TASK} adjuntos.` })
    }

    const quotaError = await assertWithinQuota(req.workspace.id, declaredSize)
    if (quotaError) return res.status(413).json({ error: quotaError, code: 'STORAGE_QUOTA_EXCEEDED' })

    const parentId = await resolveTaskFolder(task, req.workspace.id, req.user.userId)
    const objectKey = objectStorage.buildKey(`files/${req.workspace.id}`, mimeType)

    const file = await prisma.projectFile.create({
      data: {
        projectId: task.projectId, workspaceId: req.workspace.id, parentId, type: 'file', status: 'pending',
        name, mimeType, objectKey, sizeBytes: declaredSize,
        uploadedById: req.user.userId,
      },
    })

    const uploadUrl = await objectStorage.presignPut(objectKey, mimeType, { expiresIn: PRESIGN_EXPIRES_IN })
    res.status(201).json({ fileId: file.id, uploadUrl, expiresIn: PRESIGN_EXPIRES_IN })
  } catch (err) { next(err) }
}

/**
 * POST /api/tasks/:id/attachments/:fileId/confirm
 * Mismas validaciones que POST /api/projects/:id/files/:fileId/confirm
 * (tamaño real + magic bytes) y, si todo sale bien, deja el vínculo TaskFile.
 */
async function confirmAttachment(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const task = await getTaskWithAccess(taskId, req.workspace.id)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const file = await prisma.projectFile.findFirst({
      where: { id: Number(req.params.fileId), projectId: task.projectId, type: 'file' },
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
    mimeType = detectImageType(headerBuf) || detectVideoType(headerBuf)
      || (detectDocumentType(headerBuf) === 'pdf' ? 'application/pdf' : null) || mimeType
    if (isDangerousMime(mimeType)) return reject(400, 'Este tipo de archivo no está permitido.')

    const [updated] = await prisma.$transaction([
      prisma.projectFile.update({
        where: { id: file.id },
        data:  { status: 'ready', sizeBytes: head.size, mimeType, confirmedAt: new Date() },
        include: { uploadedBy: { select: { id: true, name: true } } },
      }),
      prisma.taskFile.create({
        data: { workspaceId: req.workspace.id, taskId, fileId: file.id, linkedById: req.user.userId },
      }),
    ])
    res.json({ ...shapeItem(updated), projectId: task.projectId })
  } catch (err) { next(err) }
}

/**
 * DELETE /api/tasks/:id/attachments/:fileId
 * Saca el vínculo con la tarea — el archivo en sí queda intacto en Archivos
 * (es "la Nube del proyecto", no algo scopeado a la tarea que deba borrarse
 * con ella). Borrar el archivo de verdad se hace desde Archivos.
 */
async function removeAttachment(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const task = await getTaskWithAccess(taskId, req.workspace.id)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })

    const link = await prisma.taskFile.findFirst({
      where: { taskId, fileId: Number(req.params.fileId) },
    })
    if (!link) return res.status(404).json({ error: 'Adjunto no encontrado' })

    await prisma.taskFile.delete({ where: { id: link.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// Baja una URL pública siguiendo redirects a mano: cada salto pasa por assertPublicUrl
// (un redirect automático podría apuntar a la red interna — SSRF).
async function downloadPublicUrl(rawUrl) {
  let url = rawUrl
  for (let hop = 0; hop <= URL_MAX_REDIRECTS; hop++) {
    try { await assertPublicUrl(url) } catch (e) { throw httpError(400, `URL no permitida: ${e.message}`) }
    let res
    try {
      res = await axios.get(url, {
        responseType: 'arraybuffer', maxRedirects: 0, timeout: 30000,
        maxContentLength: DIRECT_MAX_BYTES, validateStatus: () => true,
      })
    } catch (e) {
      if (/maxContentLength/i.test(e.message)) throw httpError(413, `El archivo supera el máximo de ${DIRECT_MAX_BYTES / (1024 * 1024)}MB para esta vía.`)
      throw httpError(400, `No se pudo descargar la URL: ${e.message}`)
    }
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = new URL(res.headers.location, url).toString()
      continue
    }
    if (res.status !== 200) throw httpError(400, `La URL respondió ${res.status}`)
    const contentType = String(res.headers['content-type'] || '').split(';')[0].trim() || null
    return { buffer: Buffer.from(res.data), contentType }
  }
  throw httpError(400, 'Demasiados redirects')
}

/**
 * POST /api/tasks/:id/attachments/direct — { name, content? | contentBase64? | url?, mimeType? }
 * Adjunta subiendo desde el servidor (lo usan los agentes vía MCP: un tool-call solo
 * manda JSON, no puede hacer el PUT directo a R2). Exactamente una fuente: `content`
 * (texto: informes, borradores en markdown, CSV…), `contentBase64` (binario chico) o
 * `url` (archivo público, ej. una pieza ya generada). Mismas validaciones que el flujo
 * presign→confirm (MIME denylist, magic bytes, topes por tarea, cuota) y misma carpeta.
 */
async function directAttachment(req, res, next) {
  try {
    const taskId = Number(req.params.id)
    const task = await getTaskWithAccess(taskId, req.workspace.id)
    if (!task) return res.status(403).json({ error: 'No tenés acceso a esta tarea' })
    if (task.project?.filesEnabled === false) {
      return res.status(403).json({ error: 'La sección de Nube está deshabilitada para este workspace' })
    }
    if (!objectStorage.isConfigured()) {
      return res.status(503).json({ error: 'La subida de archivos no está configurada en este workspace.', code: 'STORAGE_NOT_CONFIGURED' })
    }

    const name = sanitizeName(req.body?.name)
    if (!name) return res.status(400).json({ error: 'Nombre de archivo requerido' })

    const { content, contentBase64, url } = req.body || {}
    const sources = [content, contentBase64, url].filter(v => typeof v === 'string' && v.length > 0)
    if (sources.length !== 1) {
      return res.status(400).json({ error: 'Mandá exactamente uno de: content, contentBase64 o url' })
    }

    let buffer
    let sourceType = null
    if (content) buffer = Buffer.from(content, 'utf8')
    else if (contentBase64) buffer = Buffer.from(contentBase64.replace(/^data:[^,]*,/, ''), 'base64')
    else ({ buffer, contentType: sourceType } = await downloadPublicUrl(url))

    if (!buffer.length) return res.status(400).json({ error: 'El archivo está vacío' })
    if (buffer.length > DIRECT_MAX_BYTES) {
      return res.status(413).json({ error: `El archivo supera el máximo de ${DIRECT_MAX_BYTES / (1024 * 1024)}MB para esta vía.` })
    }

    // Tipo: los magic bytes mandan; si no dicen nada, el mimeType declarado, el
    // Content-Type de la URL o la extensión del nombre.
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
    const declared = typeof req.body?.mimeType === 'string' && req.body.mimeType.trim() ? req.body.mimeType.trim() : null
    const headerBuf = buffer.subarray(0, 32)
    const mimeType = detectImageType(headerBuf) || detectVideoType(headerBuf)
      || (detectDocumentType(headerBuf) === 'pdf' ? 'application/pdf' : null)
      || declared || (sourceType !== 'application/octet-stream' ? sourceType : null)
      || MIME_BY_EXT[ext] || (content ? 'text/plain' : 'application/octet-stream')
    if (isDangerousMime(mimeType)) return res.status(400).json({ error: 'Este tipo de archivo no está permitido.' })

    const linkedCount = await prisma.taskFile.count({ where: { taskId, file: { status: 'ready', deletedAt: null } } })
    if (linkedCount >= MAX_ATTACHMENTS_PER_TASK) {
      return res.status(400).json({ error: `Esta tarea ya tiene el máximo de ${MAX_ATTACHMENTS_PER_TASK} adjuntos.` })
    }
    const quotaError = await assertWithinQuota(req.workspace.id, buffer.length)
    if (quotaError) return res.status(413).json({ error: quotaError, code: 'STORAGE_QUOTA_EXCEEDED' })

    const parentId = await resolveTaskFolder(task, req.workspace.id, req.user.userId)
    const { key: objectKey } = await objectStorage.putObject(buffer, mimeType, { prefix: `files/${req.workspace.id}` })

    try {
      const created = await prisma.$transaction(async (tx) => {
        const file = await tx.projectFile.create({
          data: {
            projectId: task.projectId, workspaceId: req.workspace.id, parentId, type: 'file', status: 'ready',
            name, mimeType, objectKey, sizeBytes: buffer.length, uploadedById: req.user.userId, confirmedAt: new Date(),
          },
          include: { uploadedBy: { select: { id: true, name: true } } },
        })
        await tx.taskFile.create({ data: { workspaceId: req.workspace.id, taskId, fileId: file.id, linkedById: req.user.userId } })
        return file
      })
      res.status(201).json({ ...shapeItem(created), projectId: task.projectId })
    } catch (err) {
      await objectStorage.deleteObject(objectKey)
      throw err
    }
  } catch (err) {
    if (err.isOperational && err.status) return res.status(err.status).json(err.code ? { error: err.message, code: err.code } : { error: err.message })
    next(err)
  }
}

module.exports = { listAttachments, presignAttachment, confirmAttachment, directAttachment, removeAttachment }
