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
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'Nombre requerido' })
    const service = await prisma.service.create({
      data: { workspaceId: req.workspace.id, name },
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
    const { name, active } = req.body
    const data = {}
    if (name !== undefined) data.name = name
    if (active !== undefined) data.active = active
    const service = await prisma.service.update({ where: { id: Number(id) }, data })
    res.json(service)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Servicio no encontrado' })
    next(err)
  }
}

module.exports = { list, listAll, create, update }
