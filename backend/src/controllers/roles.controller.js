const prisma = require('../lib/prisma')

async function list(req, res, next) {
  try {
    const roles = await prisma.userRole.findMany({
      where: { workspaceId: req.workspace.id },
      orderBy: { id: 'asc' },
    })
    res.json(roles)
  } catch (err) { next(err) }
}

async function create(req, res, next) {
  try {
    const { name, label } = req.body
    if (!name || !label) return res.status(400).json({ error: 'Nombre e identificador requeridos' })
    const role = await prisma.userRole.create({
      data: {
        workspaceId: req.workspace.id,
        name: name.toUpperCase().replace(/\s+/g, '_'),
        label,
      },
    })
    res.status(201).json(role)
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un rol con ese identificador' })
    next(err)
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params
    const roleName = await prisma.userRole.findFirst({
      where: { id: Number(id), workspaceId: req.workspace.id },
    })
    if (!roleName) return res.status(404).json({ error: 'Rol no encontrado' })

    // Verificar que ningún miembro del workspace tenga ese rol
    const usersWithRole = await prisma.workspaceMember.count({
      where: { workspaceId: req.workspace.id, teamRole: roleName.name },
    })
    if (usersWithRole > 0) {
      return res.status(409).json({ error: `No se puede eliminar: ${usersWithRole} usuario(s) tienen este rol` })
    }
    await prisma.userRole.delete({ where: { id: Number(id) } })
    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Rol no encontrado' })
    next(err)
  }
}

module.exports = { list, create, remove }
