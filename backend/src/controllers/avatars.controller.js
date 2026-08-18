const prisma = require('../lib/prisma')
const fs     = require('fs')
const { validateImageUpload } = require('../lib/imageType')
const objectStorage = require('../services/objectStorage.service')

// ─── Público / usuarios autenticados ─────────────────────────────────────────

/**
 * GET /api/avatars
 * Lista de avatares activos del catálogo compartido, ordenados. No incluye
 * imageData ni las fotos propias subidas por usuarios (ownerId != null,
 * privadas — ver profile.controller.js para esas).
 */
async function list(req, res, next) {
  try {
    const avatars = await prisma.avatar.findMany({
      where:   { active: true, ownerId: null },
      orderBy: { order: 'asc' },
      select:  { id: true, filename: true, label: true, order: true },
    })
    res.json(avatars)
  } catch (err) { next(err) }
}

/**
 * GET /api/avatars/img/:filename
 * Sirve la imagen. Ruta pública (sin auth). Dos orígenes posibles (mismo
 * patrón dual que SocialImage): objectKey → redirect a R2; imageData → bytes
 * desde la DB (legacy / sin R2 configurado).
 */
async function serveImage(req, res, next) {
  try {
    const { filename } = req.params
    const avatar = await prisma.avatar.findUnique({
      where:  { filename },
      select: { imageData: true, mimeType: true, objectKey: true },
    })

    if (!avatar) return res.status(404).json({ error: 'Imagen no encontrada' })

    if (avatar.objectKey) {
      res.set('Cache-Control', 'public, max-age=86400') // 1 día — el objeto en R2 ya cachea 1 año
      return res.redirect(302, objectStorage.publicUrl(avatar.objectKey))
    }

    if (!avatar.imageData) return res.status(404).json({ error: 'Imagen no encontrada' })

    res.set('Content-Type', avatar.mimeType)
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'public, max-age=86400') // 24h cache
    res.send(Buffer.from(avatar.imageData))
  } catch (err) { next(err) }
}

// ─── Superadmin ───────────────────────────────────────────────────────────────

/**
 * GET /api/superadmin/avatars
 * Lista completa (activos + inactivos) para el panel.
 */
async function listAll(req, res, next) {
  try {
    const avatars = await prisma.avatar.findMany({
      where:   { ownerId: null }, // el catálogo de SuperAdmin no gestiona fotos propias de usuarios
      orderBy: { order: 'asc' },
      select:  { id: true, filename: true, label: true, order: true, active: true, createdAt: true },
    })

    // Cuántos usuarios usan cada avatar ahora mismo (User.avatar = filename).
    const usage = await prisma.user.groupBy({
      by:     ['avatar'],
      _count: { _all: true },
    })
    const usageByFilename = Object.fromEntries(
      usage.map(u => [u.avatar, u._count._all])
    )

    res.json(avatars.map(a => ({ ...a, usageCount: usageByFilename[a.filename] ?? 0 })))
  } catch (err) { next(err) }
}

/**
 * POST /api/superadmin/avatars
 * Sube un nuevo avatar. Espera multipart/form-data con campo "image" y "label".
 * También acepta JSON con { filename, label, imageBase64 } para compatibilidad.
 */
async function upload(req, res, next) {
  try {
    // Si viene como multipart (multer ya procesó el archivo)
    if (req.file) {
      const { label } = req.body
      if (!label?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })

      const filename = req.file.originalname
      // Validar por contenido real (magic bytes), no por extensión ni Content-Type del cliente.
      const check = validateImageUpload(req.file.buffer, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
      if (!check.ok) {
        return res.status(400).json({ error: 'Formato no soportado. Usar PNG, JPG, WEBP o GIF.' })
      }
      const mimeType = check.mimeType

      // Nombre único si ya existe
      const existing = await prisma.avatar.findUnique({ where: { filename } })
      const finalFilename = existing
        ? `${Date.now()}_${filename}`
        : filename

      // Calcular orden máximo
      const maxOrder = await prisma.avatar.aggregate({ _max: { order: true } })
      const nextOrder = (maxOrder._max.order ?? 0) + 1

      const avatar = await prisma.avatar.create({
        data: {
          filename: finalFilename,
          label:    label.trim(),
          order:    nextOrder,
          active:   true,
          imageData: req.file.buffer,
          mimeType,
        },
        select: { id: true, filename: true, label: true, order: true, active: true },
      })
      return res.status(201).json(avatar)
    }

    return res.status(400).json({ error: 'No se recibió ninguna imagen' })
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/avatars/:id
 * Actualiza label y/o order. El order se maneja manualmente.
 */
async function update(req, res, next) {
  try {
    const id    = Number(req.params.id)
    const { label, order } = req.body

    const existing = await prisma.avatar.findUnique({ where: { id } })
    if (!existing || existing.ownerId) return res.status(404).json({ error: 'Avatar no encontrado' })

    const data = {}
    if (label !== undefined) data.label = label.trim()
    if (order !== undefined) data.order = Number(order)

    const avatar = await prisma.avatar.update({
      where:  { id },
      data,
      select: { id: true, filename: true, label: true, order: true, active: true },
    })
    res.json(avatar)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/avatars/reorder
 * Body: { items: [{ id, order }] }
 * Actualiza el orden de múltiples avatares en una sola operación.
 */
async function reorder(req, res, next) {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items debe ser un array' })
    }

    await prisma.$transaction(
      items.map(({ id, order }) =>
        prisma.avatar.update({
          where: { id: Number(id) },
          data:  { order: Number(order) },
        })
      )
    )

    const avatars = await prisma.avatar.findMany({
      orderBy: { order: 'asc' },
      select:  { id: true, filename: true, label: true, order: true, active: true },
    })
    res.json(avatars)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/avatars/:id/toggle
 * Activa / desactiva un avatar.
 */
async function toggle(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.avatar.findUnique({ where: { id }, select: { active: true, ownerId: true } })
    if (!existing || existing.ownerId) return res.status(404).json({ error: 'Avatar no encontrado' })

    const avatar = await prisma.avatar.update({
      where:  { id },
      data:   { active: !existing.active },
      select: { id: true, filename: true, label: true, order: true, active: true },
    })
    res.json(avatar)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/superadmin/avatars/:id
 * Elimina un avatar si ningún usuario lo está usando.
 * Si hay usuarios con ese avatar, retorna 409.
 */
async function remove(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.avatar.findUnique({ where: { id } })
    if (!existing || existing.ownerId) return res.status(404).json({ error: 'Avatar no encontrado' })

    // Verificar si algún usuario lo usa actualmente
    const usersWithAvatar = await prisma.user.count({
      where: { avatar: existing.filename },
    })
    if (usersWithAvatar > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: ${usersWithAvatar} usuario${usersWithAvatar !== 1 ? 's' : ''} usa${usersWithAvatar !== 1 ? 'n' : ''} este avatar`,
      })
    }

    await prisma.avatar.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { list, serveImage, listAll, upload, update, reorder, toggle, remove }
