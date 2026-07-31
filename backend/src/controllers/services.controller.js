const prisma = require('../lib/prisma')

async function list(req, res, next) {
  try {
    const services = await prisma.service.findMany({
      where: { workspaceId: req.workspace.id, active: true },
      orderBy: { name: 'asc' },
    })
    res.json(services)
  } catch (err) { next(err) }
}

async function listAll(req, res, next) {
  try {
    const services = await prisma.service.findMany({
      where: { workspaceId: req.workspace.id },
      orderBy: { name: 'asc' },
    })
    res.json(services)
  } catch (err) { next(err) }
}

async function create(req, res, next) {
  try {
    const { name, description } = req.body
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })
    const service = await prisma.service.create({
      data: { workspaceId: req.workspace.id, name, description: description?.trim() || null },
    })
    res.status(201).json(service)
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Servicio ya existe' })
    next(err)
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.params
    const { name, description, active } = req.body
    const data = {}
    if (name !== undefined) data.name = name
    if (description !== undefined) data.description = description?.trim() || null
    if (active !== undefined) data.active = active
    const result = await prisma.service.updateMany({ where: { id: Number(id), workspaceId: req.workspace.id }, data })
    if (result.count === 0) return res.status(404).json({ error: 'Servicio no encontrado' })
    const service = await prisma.service.findUnique({ where: { id: Number(id) } })
    res.json(service)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Servicio no encontrado' })
    next(err)
  }
}

module.exports = { list, listAll, create, update }
