const prisma = require('../lib/prisma')

// ─── SUPERADMIN: CRUD ─────────────────────────────────────────────────────────

/**
 * GET /api/superadmin/announcements
 * Lista todos los anuncios (activos o no), ordenados por creación desc.
 */
async function listAll(req, res, next) {
  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    })
    res.json(announcements)
  } catch (err) { next(err) }
}

/**
 * POST /api/superadmin/announcements
 * Body: { title, body, type, targetAll, targetWorkspaceIds?, startsAt?, endsAt? }
 */
async function create(req, res, next) {
  try {
    const { title, body, type = 'info', targetAll = true, targetWorkspaceIds = [], startsAt, endsAt } = req.body

    if (!title?.trim()) return res.status(400).json({ error: 'El título es requerido' })
    if (!body?.trim())  return res.status(400).json({ error: 'El contenido es requerido' })

    const VALID_TYPES = ['info', 'warning', 'maintenance', 'feature']
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo inválido' })

    const ann = await prisma.announcement.create({
      data: {
        title:              title.trim(),
        body:               body.trim(),
        type,
        targetAll:          !!targetAll,
        targetWorkspaceIds: JSON.stringify(Array.isArray(targetWorkspaceIds) ? targetWorkspaceIds : []),
        startsAt:           startsAt ? new Date(startsAt) : null,
        endsAt:             endsAt   ? new Date(endsAt)   : null,
        createdById:        req.user.userId,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    })
    res.status(201).json(ann)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/announcements/:id
 * Editar campos del anuncio (parcial).
 */
async function update(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { title, body, type, targetAll, targetWorkspaceIds, startsAt, endsAt } = req.body

    const existing = await prisma.announcement.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Anuncio no encontrado' })

    const data = {}
    if (title !== undefined)              data.title              = title.trim()
    if (body  !== undefined)              data.body               = body.trim()
    if (type  !== undefined)              data.type               = type
    if (targetAll !== undefined)          data.targetAll          = !!targetAll
    if (targetWorkspaceIds !== undefined) data.targetWorkspaceIds = JSON.stringify(Array.isArray(targetWorkspaceIds) ? targetWorkspaceIds : [])
    if (startsAt !== undefined)           data.startsAt           = startsAt ? new Date(startsAt) : null
    if (endsAt   !== undefined)           data.endsAt             = endsAt   ? new Date(endsAt)   : null

    const ann = await prisma.announcement.update({
      where: { id },
      data,
      include: { createdBy: { select: { id: true, name: true } } },
    })
    res.json(ann)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/announcements/:id/toggle
 * Activar o desactivar un anuncio.
 */
async function toggle(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.announcement.findUnique({ where: { id }, select: { active: true } })
    if (!existing) return res.status(404).json({ error: 'Anuncio no encontrado' })

    const ann = await prisma.announcement.update({
      where: { id },
      data: { active: !existing.active },
      include: { createdBy: { select: { id: true, name: true } } },
    })
    res.json(ann)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/superadmin/announcements/:id
 */
async function remove(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.announcement.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: 'Anuncio no encontrado' })

    await prisma.announcement.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ─── USUARIO AUTENTICADO: LEER ANUNCIOS ACTIVOS ───────────────────────────────

/**
 * GET /api/announcements/active
 * Devuelve anuncios activos aplicables al workspace del usuario.
 * Un anuncio aplica si: targetAll=true, O si el workspaceId del usuario está en targetWorkspaceIds.
 * Filtra por startsAt/endsAt si están definidos.
 */
async function getActive(req, res, next) {
  try {
    const now = new Date()
    const workspaceId = req.workspace?.id ?? null

    const all = await prisma.announcement.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, body: true, type: true, targetAll: true, targetWorkspaceIds: true, startsAt: true, endsAt: true },
    })

    const visible = all.filter(ann => {
      if (ann.startsAt && ann.startsAt > now) return false
      if (ann.endsAt   && ann.endsAt   < now) return false
      if (ann.targetAll) return true
      if (!workspaceId) return false
      try {
        const ids = JSON.parse(ann.targetWorkspaceIds)
        return ids.includes(workspaceId)
      } catch { return false }
    })

    res.json(visible)
  } catch (err) { next(err) }
}

module.exports = { listAll, create, update, toggle, remove, getActive }
