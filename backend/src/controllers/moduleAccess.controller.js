const prisma = require('../lib/prisma')
const { MODULE_KEYS, resolveModuleAccess } = require('../lib/moduleAccess')

/**
 * GET /api/workspaces/current/module-access
 * Devuelve la config resuelta (default del catálogo + lo guardado) de los 6
 * módulos, para el editor de Preferencias.
 */
async function list(req, res, next) {
  try {
    const result = Object.fromEntries(
      MODULE_KEYS.map(key => [key, resolveModuleAccess(req.workspace, key)])
    )
    res.json(result)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/workspaces/current/module-access/:key
 * Body: { allMembers: boolean, roles: string[] }
 * Actualiza la config de UN módulo dentro del JSON, sin pisar los demás.
 */
async function update(req, res, next) {
  try {
    const { key } = req.params
    if (!MODULE_KEYS.includes(key)) {
      return res.status(400).json({ error: 'Módulo inválido' })
    }
    const { allMembers, roles } = req.body
    if (typeof allMembers !== 'boolean') {
      return res.status(400).json({ error: 'allMembers (boolean) es requerido' })
    }
    const cleanRoles = Array.isArray(roles) ? roles.filter(r => typeof r === 'string') : []

    const current = (req.workspace.moduleAccess && typeof req.workspace.moduleAccess === 'object')
      ? req.workspace.moduleAccess
      : {}
    const nextModuleAccess = { ...current, [key]: { allMembers, roles: cleanRoles } }

    await prisma.workspace.update({
      where: { id: req.workspace.id },
      data:  { moduleAccess: nextModuleAccess },
    })

    res.json({ [key]: { allMembers, roles: cleanRoles } })
  } catch (err) { next(err) }
}

module.exports = { list, update }
