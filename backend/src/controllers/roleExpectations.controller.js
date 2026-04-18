const prisma = require('../lib/prisma')

async function list(req, res, next) {
  try {
    const expectations = await prisma.roleExpectation.findMany({
      where: { workspaceId: req.workspace.id },
      orderBy: { roleName: 'asc' },
    })
    res.json(expectations)
  } catch (err) { next(err) }
}

async function getByRole(req, res, next) {
  try {
    const { roleName } = req.params
    const expectation = await prisma.roleExpectation.findUnique({
      where: { workspaceId_roleName: { workspaceId: req.workspace.id, roleName } },
    })
    if (!expectation) return res.json(null)
    res.json(expectation)
  } catch (err) { next(err) }
}

async function upsert(req, res, next) {
  try {
    const { roleName } = req.params
    const {
      description                 = '',
      expectedResults             = [],
      operationalResponsibilities = [],
      recurrentTasks              = [],
      dependencies                = [],
    } = req.body

    const workspaceId = req.workspace.id
    const data = { description, expectedResults, operationalResponsibilities, recurrentTasks, dependencies }
    const expectation = await prisma.roleExpectation.upsert({
      where:  { workspaceId_roleName: { workspaceId, roleName } },
      create: { workspaceId, roleName, ...data },
      update: data,
    })
    res.json(expectation)
  } catch (err) { next(err) }
}

async function getMyRoleExpectation(req, res, next) {
  try {
    const teamRole = req.workspaceMember?.teamRole
    if (!teamRole) return res.json(null)
    const expectation = await prisma.roleExpectation.findUnique({
      where: { workspaceId_roleName: { workspaceId: req.workspace.id, roleName: teamRole } },
    })
    res.json(expectation)
  } catch (err) { next(err) }
}

module.exports = { list, getByRole, upsert, getMyRoleExpectation }
