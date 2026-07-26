const prisma = require('../lib/prisma')
const { isGrantedBySuperAdmin, isFlagEnabledForWorkspace } = require('../lib/featureFlags')

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
 * Respeta disabledFeatureKeys del workspace (opt-out del admin).
 */
async function checkFlag(req, res, next) {
  try {
    const flag = await prisma.featureFlag.findUnique({ where: { key: req.params.key } })
    const workspaceId = req.workspace?.id

    if (!flag || !workspaceId) {
      // Sin workspace no hay enabledWorkspaceIds/opt-out que evaluar: solo cuenta el grant global.
      return res.json({ enabled: !!flag?.enabledGlobally })
    }

    const workspace = await prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { disabledFeatureKeys: true },
    })
    const disabledKeys = JSON.parse(workspace?.disabledFeatureKeys ?? '[]')

    res.json({ enabled: isFlagEnabledForWorkspace(flag, workspaceId, disabledKeys) })
  } catch (err) { next(err) }
}

/**
 * GET /api/workspaces/current/features
 * Lista todos los feature flags habilitados para el workspace actual (por SuperAdmin),
 * junto con la descripción y si el workspace los tiene desactivados (opt-out).
 * Solo admins.
 */
async function listWorkspaceFeatures(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const [flags, workspace] = await Promise.all([
      prisma.featureFlag.findMany({ orderBy: { key: 'asc' } }),
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { disabledFeatureKeys: true } }),
    ])

    const disabledKeys = JSON.parse(workspace?.disabledFeatureKeys ?? '[]')

    // Se lista por "grant de SuperAdmin" — el campo `disabled` de cada fila es el
    // estado actual del opt-out (lo que arma el toggle), no un filtro.
    const result = flags
      .filter(f => isGrantedBySuperAdmin(f, workspaceId))
      .map(f => ({
        key:         f.key,
        name:        f.name,
        description: f.description,
        disabled:    disabledKeys.includes(f.key),
      }))

    res.json(result)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/workspaces/current/features/:key
 * Workspace admin activa/desactiva (opt-out) un feature flag habilitado por SuperAdmin.
 * Body: { disabled: boolean }
 */
async function toggleWorkspaceFeature(req, res, next) {
  try {
    const { key } = req.params
    const { disabled } = req.body
    if (typeof disabled !== 'boolean') {
      return res.status(400).json({ error: 'disabled (boolean) es requerido' })
    }

    const workspaceId = req.workspace.id

    // Verificar que el flag existe y está habilitado para este workspace
    const flag = await prisma.featureFlag.findUnique({ where: { key } })
    if (!flag) return res.status(404).json({ error: 'Flag no encontrado' })

    if (!isGrantedBySuperAdmin(flag, workspaceId)) {
      return res.status(403).json({ error: 'Este módulo no está habilitado para el workspace' })
    }

    const workspace = await prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { disabledFeatureKeys: true },
    })
    let disabledKeys = JSON.parse(workspace?.disabledFeatureKeys ?? '[]')

    if (disabled) {
      if (!disabledKeys.includes(key)) disabledKeys.push(key)
    } else {
      disabledKeys = disabledKeys.filter(k => k !== key)
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data:  { disabledFeatureKeys: JSON.stringify(disabledKeys) },
    })

    res.json({ key, disabled })
  } catch (err) { next(err) }
}

module.exports = { list, create, update, remove, checkFlag, listWorkspaceFeatures, toggleWorkspaceFeature }
