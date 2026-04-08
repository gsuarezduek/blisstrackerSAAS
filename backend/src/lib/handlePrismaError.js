function handlePrismaError(err, res, next) {
  if (err.code === 'P2025') return res.status(404).json({ error: 'Recurso no encontrado' })
  if (err.code === 'P2002') return res.status(409).json({ error: 'Ya existe un registro con estos datos' })
  next(err)
}

module.exports = { handlePrismaError }
