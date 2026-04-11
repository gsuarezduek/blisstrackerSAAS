/**
 * Handles common Prisma errors and converts them to HTTP responses.
 * Returns true if the error was handled, false otherwise.
 */
function handlePrismaError(err, res) {
  if (err.code === 'P2025') {
    res.status(404).json({ error: 'Recurso no encontrado' })
    return true
  }
  if (err.code === 'P2002') {
    res.status(409).json({ error: 'Ya existe un registro con estos datos' })
    return true
  }
  if (err.code === 'P2003') {
    res.status(400).json({ error: 'Referencia inválida: el recurso relacionado no existe' })
    return true
  }
  return false
}

module.exports = { handlePrismaError }
