const prisma = require('../../lib/prisma')
const { findGame, shapeTeam } = require('./_shared')

function parseTeamBody(body) {
  const name = body.name?.trim()
  if (!name) return { error: 'El nombre del equipo es obligatorio' }
  return {
    data: {
      name,
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(Number).filter(Number.isInteger) : [],
      projectIds: Array.isArray(body.projectIds) ? body.projectIds.map(Number).filter(Number.isInteger) : [],
    },
  }
}

/** POST /api/gamification/games/:id/teams (admin) */
async function createTeam(req, res, next) {
  try {
    const game = await findGame(req)
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    const { error, data } = parseTeamBody(req.body)
    if (error) return res.status(400).json({ error })
    const team = await prisma.gameTeam.create({ data: { ...data, gameId: game.id } })
    res.status(201).json({ team: shapeTeam(team) })
  } catch (err) { next(err) }
}

/** PATCH /api/gamification/games/:id/teams/:teamId (admin) */
async function updateTeam(req, res, next) {
  try {
    const game = await findGame(req)
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    const { error, data } = parseTeamBody(req.body)
    if (error) return res.status(400).json({ error })
    const r = await prisma.gameTeam.updateMany({ where: { id: req.params.teamId, gameId: game.id }, data })
    if (r.count === 0) return res.status(404).json({ error: 'Equipo no encontrado' })
    const team = await prisma.gameTeam.findUnique({ where: { id: req.params.teamId } })
    res.json({ team: shapeTeam(team) })
  } catch (err) { next(err) }
}

/** DELETE /api/gamification/games/:id/teams/:teamId (admin) */
async function deleteTeam(req, res, next) {
  try {
    const game = await findGame(req)
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    const r = await prisma.gameTeam.deleteMany({ where: { id: req.params.teamId, gameId: game.id } })
    if (r.count === 0) return res.status(404).json({ error: 'Equipo no encontrado' })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

module.exports = { createTeam, updateTeam, deleteTeam }
