const prisma = require('../lib/prisma')

const MAX_COLS = 3
const MAX_LEN = 100000 // límite defensivo de tamaño por columna (~100 KB)

/**
 * GET /api/notes
 * Devuelve las 3 columnas de la pizarra del usuario en el workspace actual.
 * Siempre responde un array de longitud 3 (columnas vacías como "").
 */
async function getNotes(req, res, next) {
  try {
    const rows = await prisma.notesBoardNote.findMany({
      where: { userId: req.user.userId, workspaceId: req.workspace.id },
      orderBy: { columnIndex: 'asc' },
    })
    const columns = ['', '', '']
    for (const r of rows) {
      if (r.columnIndex >= 0 && r.columnIndex < MAX_COLS) columns[r.columnIndex] = r.content
    }
    res.json({ columns })
  } catch (err) { next(err) }
}

/**
 * PUT /api/notes/:index
 * Upsert del contenido HTML de una columna (0-2).
 */
async function putNote(req, res, next) {
  try {
    const index = parseInt(req.params.index, 10)
    if (!Number.isInteger(index) || index < 0 || index >= MAX_COLS) {
      return res.status(400).json({ error: 'Columna inválida' })
    }
    let content = typeof req.body?.content === 'string' ? req.body.content : ''
    if (content.length > MAX_LEN) content = content.slice(0, MAX_LEN)

    const note = await prisma.notesBoardNote.upsert({
      where: {
        userId_workspaceId_columnIndex: {
          userId: req.user.userId,
          workspaceId: req.workspace.id,
          columnIndex: index,
        },
      },
      update: { content },
      create: { userId: req.user.userId, workspaceId: req.workspace.id, columnIndex: index, content },
    })
    res.json({ ok: true, updatedAt: note.updatedAt })
  } catch (err) { next(err) }
}

module.exports = { getNotes, putNote }
