const prisma = require('../lib/prisma')
const objectStorage = require('../services/objectStorage.service')
const { getSetting } = require('../lib/platformSettings')
const { emitTo } = require('../lib/socket')
const { validateImageUpload } = require('../lib/imageType')
const { validateMediaHeader } = require('../lib/mediaType')
const { resolveCtx, loadPiece, formatPiece, formatAsset } = require('./content.controller')

// El asset cambió, pero lo que muestran las vistas (Kanban/Tabla/Calendario) es
// la PIEZA con su array de assets embebido — se recarga y emite completa, mismo
// evento que usan las mutaciones de content.controller.js.
async function emitPieceUpdated(workspaceId, projectId, pieceId) {
  const fresh = await loadPiece(pieceId, projectId, workspaceId)
  if (fresh) emitTo(`workspace:${workspaceId}`, 'content:piece:updated', { projectId, piece: formatPiece(fresh) })
}

const MAX_BYTES = {
  image: 15 * 1024 * 1024,   // 15 MB
  video: 150 * 1024 * 1024,  // 150 MB — un reel/video real pesa 10-40MB, 150 da margen
}
const ALLOWED_MIME = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
}
const MAX_READY_ASSETS_PER_PIECE = 8
const MAX_PENDING_ASSETS_PER_PIECE = 3
const PENDING_MAX_AGE_MS = 60 * 60 * 1000 // 1h — pendings más viejos no cuentan para el límite (los barre el cron)
const PRESIGN_EXPIRES_IN = 600 // 10 min

function sanitizeFileName(name) {
  if (typeof name !== 'string') return null
  const clean = name.replace(/[/\\]/g, '').replace(/[\x00-\x1f]/g, '').trim()
  return clean ? clean.slice(0, 200) : null
}

const MAX_URL_LEN = 2000
function isValidHttpUrl(str) {
  try {
    const u = new URL(str)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch { return false }
}

// width/height/durationSec son metadata de display declarada por el cliente —
// NUNCA se confían para nada de seguridad, solo se acotan a rangos razonables.
function clampDimension(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n < 20000 ? Math.round(n) : null
}
function clampDuration(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 && n < 24 * 60 * 60 ? Math.round(n) : null
}

/** ≤8 assets 'ready' por pieza. */
async function assertReadySlot(pieceId) {
  const count = await prisma.contentAsset.count({ where: { pieceId, status: 'ready' } })
  if (count >= MAX_READY_ASSETS_PER_PIECE) {
    return `Esta pieza ya tiene el máximo de archivos (${MAX_READY_ASSETS_PER_PIECE}).`
  }
  return null
}

/** ≤3 assets 'pending' recientes (<1h) por pieza — anti-acumulación de uploads abandonados. */
async function assertPendingSlot(pieceId) {
  const count = await prisma.contentAsset.count({
    where: { pieceId, status: 'pending', createdAt: { gt: new Date(Date.now() - PENDING_MAX_AGE_MS) } },
  })
  if (count >= MAX_PENDING_ASSETS_PER_PIECE) {
    return 'Hay demasiadas subidas en curso para esta pieza. Esperá a que terminen o reintentá en unos minutos.'
  }
  return null
}

/** Cuota de storage del workspace (assets ready + pending). 0 = ilimitado. */
async function assertWithinQuota(workspaceId, extraBytes) {
  const limitMb = await getSetting('contentStorageMaxMbPerWorkspace')
  if (!limitMb) return null
  const limitBytes = limitMb * 1024 * 1024
  const agg = await prisma.contentAsset.aggregate({
    where: { workspaceId, status: { in: ['ready', 'pending'] } },
    _sum:  { sizeBytes: true },
  })
  const used = agg._sum.sizeBytes || 0
  if (used + extraBytes > limitBytes) {
    return `Se alcanzó el límite de almacenamiento del workspace (${limitMb} MB).`
  }
  return null
}

/**
 * POST /api/contenido/projects/:id/pieces/:pid/assets/presign
 * Body: { kind, mimeType, sizeBytes, fileName? }
 * Valida SIN ver los bytes (todo lo que sigue es metadata declarada por el
 * cliente); el tamaño y el tipo reales se verifican recién en confirmAsset,
 * sobre el objeto ya subido.
 */
async function presignAsset(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const piece = await loadPiece(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    if (!objectStorage.isConfigured()) {
      return res.status(503).json({ error: 'La subida de archivos no está configurada.', code: 'STORAGE_NOT_CONFIGURED' })
    }

    const { kind, mimeType, sizeBytes, fileName } = req.body || {}
    if (kind !== 'image' && kind !== 'video') return res.status(400).json({ error: 'kind debe ser "image" o "video"' })
    if (!ALLOWED_MIME[kind].includes(mimeType)) return res.status(400).json({ error: 'Formato no soportado' })

    const declaredSize = Number(sizeBytes)
    if (!Number.isInteger(declaredSize) || declaredSize <= 0) return res.status(400).json({ error: 'sizeBytes inválido' })
    if (declaredSize > MAX_BYTES[kind]) {
      return res.status(413).json({ error: `El archivo supera el máximo permitido (${Math.round(MAX_BYTES[kind] / (1024 * 1024))}MB).` })
    }

    const slotError = (await assertReadySlot(piece.id)) || (await assertPendingSlot(piece.id))
    if (slotError) return res.status(400).json({ error: slotError })

    const quotaError = await assertWithinQuota(ctx.workspaceId, declaredSize)
    if (quotaError) return res.status(413).json({ error: quotaError, code: 'STORAGE_QUOTA_EXCEEDED' })

    const order = await prisma.contentAsset.count({ where: { pieceId: piece.id } })
    const objectKey = objectStorage.buildKey(`content/${ctx.workspaceId}`, mimeType)

    const asset = await prisma.contentAsset.create({
      data: {
        pieceId: piece.id,
        workspaceId: ctx.workspaceId,
        kind,
        status: 'pending',
        mimeType,
        objectKey,
        sizeBytes: declaredSize, // provisorio — confirmAsset lo pisa con el HeadObject real
        fileName: sanitizeFileName(fileName),
        order,
        uploadedById: req.user.userId,
      },
    })

    const uploadUrl = await objectStorage.presignPut(objectKey, mimeType, { expiresIn: PRESIGN_EXPIRES_IN })
    res.status(201).json({ assetId: asset.id, uploadUrl, expiresIn: PRESIGN_EXPIRES_IN })
  } catch (err) { next(err) }
}

/**
 * POST /api/contenido/projects/:id/pieces/:pid/assets/:aid/confirm
 * Body: { width?, height?, durationSec?, posterAssetId? }
 * Confirma un upload directo a R2: valida tamaño real + magic bytes sobre el
 * objeto ya subido (nunca sobre lo que declaró el cliente en el presign).
 * Cualquier mismatch borra el objeto de R2 y la fila — no queda un asset roto.
 */
async function confirmAsset(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const piece = await loadPiece(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    const asset = await prisma.contentAsset.findFirst({
      where: { id: Number(req.params.aid), pieceId: piece.id, workspaceId: ctx.workspaceId },
    })
    if (!asset) return res.status(404).json({ error: 'Archivo no encontrado' })
    if (asset.status !== 'pending') return res.status(409).json({ error: 'Este archivo ya fue confirmado.' })

    async function reject(status, error, code) {
      await objectStorage.deleteObject(asset.objectKey)
      await prisma.contentAsset.delete({ where: { id: asset.id } })
      res.status(status).json(code ? { error, code } : { error })
    }

    const head = await objectStorage.headObject(asset.objectKey)
    if (!head) return reject(400, 'No se encontró el archivo subido. Probá de nuevo.', 'UPLOAD_NOT_FOUND')

    const maxBytes = MAX_BYTES[asset.kind]
    if (head.size > maxBytes) {
      return reject(413, `El archivo supera el máximo permitido (${Math.round(maxBytes / (1024 * 1024))}MB).`)
    }

    const headerBuf = await objectStorage.getObjectHead(asset.objectKey, 32)
    const check = validateMediaHeader(headerBuf, asset.kind, ALLOWED_MIME[asset.kind])
    if (!check.ok) return reject(400, check.error)

    let posterKey = null
    if (req.body?.posterAssetId) {
      const poster = await prisma.contentAsset.findFirst({
        where: { id: Number(req.body.posterAssetId), pieceId: piece.id, workspaceId: ctx.workspaceId, kind: 'image', status: 'ready' },
        select: { objectKey: true },
      })
      if (poster) posterKey = poster.objectKey
    }

    const updated = await prisma.contentAsset.update({
      where: { id: asset.id },
      data: {
        status: 'ready',
        sizeBytes: head.size, // autoritativo, no lo declarado en el presign
        mimeType: check.mimeType,
        width:  clampDimension(req.body?.width),
        height: clampDimension(req.body?.height),
        durationSec: clampDuration(req.body?.durationSec),
        posterKey,
        confirmedAt: new Date(),
      },
    })

    await emitPieceUpdated(ctx.workspaceId, ctx.projectId, piece.id)
    res.json(formatAsset(updated))
  } catch (err) { next(err) }
}

/**
 * POST /api/contenido/projects/:id/pieces/:pid/assets — multipart `file`.
 * Fallback SOLO imagen para cuando R2 no está configurado (dev local, o un
 * workspace corriendo sin object storage). En producción con R2 activo este
 * endpoint no se usa — el frontend elige presign/confirm por defecto y sólo
 * cae acá si el presign devuelve 503 STORAGE_NOT_CONFIGURED.
 */
async function uploadAssetFallback(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const piece = await loadPiece(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    if (!req.file) return res.status(400).json({ error: 'Archivo requerido' })

    const check = validateImageUpload(req.file.buffer, ALLOWED_MIME.image)
    if (!check.ok) return res.status(400).json({ error: check.error })

    const slotError = await assertReadySlot(piece.id)
    if (slotError) return res.status(400).json({ error: slotError })

    const quotaError = await assertWithinQuota(ctx.workspaceId, req.file.buffer.length)
    if (quotaError) return res.status(413).json({ error: quotaError, code: 'STORAGE_QUOTA_EXCEEDED' })

    const order = await prisma.contentAsset.count({ where: { pieceId: piece.id } })

    const asset = await prisma.contentAsset.create({
      data: {
        pieceId: piece.id,
        workspaceId: ctx.workspaceId,
        kind: 'image',
        status: 'ready',
        mimeType: check.mimeType,
        imageData: req.file.buffer,
        sizeBytes: req.file.buffer.length,
        fileName: sanitizeFileName(req.file.originalname),
        order,
        uploadedById: req.user.userId,
        confirmedAt: new Date(),
      },
    })

    await emitPieceUpdated(ctx.workspaceId, ctx.projectId, piece.id)
    res.status(201).json(formatAsset(asset))
  } catch (err) { next(err) }
}

/**
 * POST /api/contenido/projects/:id/pieces/:pid/assets/link
 * Body: { url, fileName? } — asset tipo "link" (Google Drive, etc.): sin
 * archivo propio, no pasa por R2. Queda 'ready' directo, mismo cupo
 * (assertReadySlot) que imagen/video.
 */
async function createLinkAsset(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const piece = await loadPiece(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
    if (!url || url.length > MAX_URL_LEN || !isValidHttpUrl(url)) {
      return res.status(400).json({ error: 'Ingresá un link válido (http/https)' })
    }

    const slotError = await assertReadySlot(piece.id)
    if (slotError) return res.status(400).json({ error: slotError })

    const order = await prisma.contentAsset.count({ where: { pieceId: piece.id } })

    const asset = await prisma.contentAsset.create({
      data: {
        pieceId: piece.id,
        workspaceId: ctx.workspaceId,
        kind: 'link',
        status: 'ready',
        sourceUrl: url,
        fileName: sanitizeFileName(req.body?.fileName),
        order,
        uploadedById: req.user.userId,
        confirmedAt: new Date(),
      },
    })

    await emitPieceUpdated(ctx.workspaceId, ctx.projectId, piece.id)
    res.status(201).json(formatAsset(asset))
  } catch (err) { next(err) }
}

/**
 * PATCH /api/contenido/projects/:id/pieces/:pid/assets/:aid — { order }
 * Reindexa todos los assets 'ready' de la pieza en una transacción, mismo
 * patrón que movePiece (content.controller.js) para el Kanban.
 */
async function reorderAsset(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const piece = await loadPiece(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    const asset = await prisma.contentAsset.findFirst({
      where: { id: Number(req.params.aid), pieceId: piece.id, workspaceId: ctx.workspaceId },
    })
    if (!asset) return res.status(404).json({ error: 'Archivo no encontrado' })

    const rawOrder = Number(req.body?.order)
    if (!Number.isInteger(rawOrder) || rawOrder < 0) return res.status(400).json({ error: 'order inválido' })

    const siblings = await prisma.contentAsset.findMany({
      where:   { pieceId: piece.id, status: 'ready', id: { not: asset.id } },
      orderBy: { order: 'asc' },
      select:  { id: true },
    })
    const ids = siblings.map(s => s.id)
    const targetIndex = Math.min(rawOrder, ids.length)
    ids.splice(targetIndex, 0, asset.id)

    await prisma.$transaction(
      ids.map((id, index) => prisma.contentAsset.update({ where: { id }, data: { order: index } }))
    )

    const fresh = await prisma.contentAsset.findUnique({ where: { id: asset.id } })
    await emitPieceUpdated(ctx.workspaceId, ctx.projectId, piece.id)
    res.json(formatAsset(fresh))
  } catch (err) { next(err) }
}

/**
 * DELETE /api/contenido/projects/:id/pieces/:pid/assets/:aid
 * Borra del bucket antes que la fila (si el objeto nunca se subió, deleteObjects
 * es idempotente y no falla).
 */
async function deleteAsset(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return

    const piece = await loadPiece(req.params.pid, ctx.projectId, ctx.workspaceId)
    if (!piece) return res.status(404).json({ error: 'Pieza no encontrada' })

    const asset = await prisma.contentAsset.findFirst({
      where: { id: Number(req.params.aid), pieceId: piece.id, workspaceId: ctx.workspaceId },
    })
    if (!asset) return res.status(404).json({ error: 'Archivo no encontrado' })

    await objectStorage.deleteObjects([asset.objectKey, asset.posterKey].filter(Boolean))
    await prisma.contentAsset.delete({ where: { id: asset.id } })

    await emitPieceUpdated(ctx.workspaceId, ctx.projectId, piece.id)
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

/**
 * GET /api/public/content-asset/:publicId — sin auth.
 * `publicId` es un UUID no adivinable: esa no-adivinabilidad ES el control de
 * acceso (mismo criterio que /api/social-image/:id). `?poster=1` sirve el
 * thumbnail del video en vez del archivo principal.
 */
async function serveContentAsset(req, res, next) {
  try {
    const asset = await prisma.contentAsset.findUnique({
      where:  { publicId: req.params.publicId },
      select: { imageData: true, mimeType: true, objectKey: true, posterKey: true, status: true },
    })
    if (!asset || asset.status !== 'ready') return res.status(404).send('Not found')

    if (req.query.poster === '1') {
      if (!asset.posterKey) return res.status(404).send('Not found')
      res.set('Cache-Control', 'public, max-age=86400')
      return res.redirect(302, objectStorage.publicUrl(asset.posterKey))
    }

    if (asset.objectKey) {
      // 1 día, NO inmutable — permite re-apuntar R2_PUBLIC_BASE sin quedar clavado.
      res.set('Cache-Control', 'public, max-age=86400')
      return res.redirect(302, objectStorage.publicUrl(asset.objectKey))
    }

    if (!asset.imageData) return res.status(404).send('Not found')
    res.set('Content-Type', asset.mimeType)
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    res.send(Buffer.from(asset.imageData))
  } catch (err) { next(err) }
}

module.exports = {
  presignAsset,
  confirmAsset,
  uploadAssetFallback,
  createLinkAsset,
  reorderAsset,
  deleteAsset,
  serveContentAsset,
  // exportados para tests
  MAX_BYTES,
  ALLOWED_MIME,
}
