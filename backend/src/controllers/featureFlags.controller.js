const prisma = require('../lib/prisma')

/**
 * GET /api/superadmin/feature-flags
 * Lista todos los feature flags.
 */
async function list(req, res, next) {
  try {
    const flags = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } })
    res.json(flags.map(f => ({
      ...f,
      enabledWorkspaceIds: JSON.parse(f.enabledWorkspaceIds),
    })))
  } catch (err) { next(err) }
}

/**
 * POST /api/superadmin/feature-flags
 * Crea un nuevo feature flag.
 * Body: { key, name, description? }
 */
async function create(req, res, next) {
  try {
    const { key, name, description = '' } = req.body
    if (!key?.trim() || !name?.trim()) {
      return res.status(400).json({ error: 'key y name son requeridos' })
    }
    const flag = await prisma.featureFlag.create({
      data: { key: key.trim().toLowerCase().replace(/\s+/g, '_'), name: name.trim(), description: description.trim() },
    })
    res.status(201).json({ ...flag, enabledWorkspaceIds: [] })
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un flag con esa key' })
    next(err)
  }
}

/**
 * PATCH /api/superadmin/feature-flags/:id
 * Actualiza un flag: name, description, enabledGlobally, enabledWorkspaceIds.
 */
async function update(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { name, description, enabledGlobally, enabledWorkspaceIds } = req.body

    const data = {}
    if (name !== undefined)               data.name = name.trim()
    if (description !== undefined)        data.description = description.trim()
    if (enabledGlobally !== undefined)    data.enabledGlobally = Boolean(enabledGlobally)
    if (enabledWorkspaceIds !== undefined) data.enabledWorkspaceIds = JSON.stringify(enabledWorkspaceIds)

    const flag = await prisma.featureFlag.update({ where: { id }, data })
    res.json({ ...flag, enabledWorkspaceIds: JSON.parse(flag.enabledWorkspaceIds) })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Flag no encontrado' })
    next(err)
  }
}

/**
 * DELETE /api/superadmin/feature-flags/:id
 */
async function remove(req, res, next) {
  try {
    await prisma.featureFlag.delete({ where: { id: Number(req.params.id) } })
    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Flag no encontrado' })
    next(err)
  }
}

/**
 * GET /api/feature-flags/:key
 * Endpoint autenticado (no superadmin) que el frontend usa para saber si un flag
 * está habilitado para el workspace actual.
 */
async function checkFlag(req, res, next) {
  try {
    const flag = await prisma.featureFlag.findUnique({ where: { key: req.params.key } })
    if (!flag) return res.json({ enabled: false })

    const workspaceId = req.workspace?.id
    const ids = JSON.parse(flag.enabledWorkspaceIds)
    const enabled = flag.enabledGlobally || (workspaceId ? ids.includes(workspaceId) : false)

    res.json({ enabled })
  } catch (err) { next(err) }
}

module.exports = { list, create, update, remove, checkFlag }
