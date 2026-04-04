const prisma = require('../lib/prisma')

async function list(req, res, next) {
  try {
    const expectations = await prisma.roleExpectation.findMany({
      orderBy: { roleName: 'asc' },
    })
    res.json(expectations)
  } catch (err) { next(err) }
}

async function getByRole(req, res, next) {
  try {
    const { roleName } = req.params
    const expectation = await prisma.roleExpectation.findUnique({
      where: { roleName },
    })
    if (!expectation) return res.json(null)
    res.json(expectation)
  } catch (err) { next(err) }
}

async function upsert(req, res, next) {
  try {
    const { roleName } = req.params
    const { description = '', recurrentTasks = [], dependencies = [] } = req.body

    const expectation = await prisma.roleExpectation.upsert({
      where: { roleName },
      create: { roleName, description, recurrentTasks, dependencies },
      update: { description, recurrentTasks, dependencies },
    })
    res.json(expectation)
  } catch (err) { next(err) }
}

// Devuelve solo si el rol del usuario autenticado tiene expectativas configuradas (no admin-only)
async function getMyRoleExpectation(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { role: true },
    })
    if (!user?.role) return res.json(null)
    const expectation = await prisma.roleExpectation.findUnique({
      where: { roleName: user.role },
      select: { roleName: true, description: true, recurrentTasks: true, dependencies: true },
    })
    res.json(expectation)
  } catch (err) { next(err) }
}

module.exports = { list, getByRole, upsert, getMyRoleExpectation }
