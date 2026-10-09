const prisma = require('../../lib/prisma')

// GET /api/finanzas/workspace-note — sección 4.6, textarea libre con autoguardado.
async function getNote(req, res, next) {
  try {
    const note = await prisma.financeWorkspaceNote.findUnique({ where: { workspaceId: req.workspace.id } })
    res.json({ content: note?.content || '' })
  } catch (err) { next(err) }
}

// PATCH /api/finanzas/workspace-note — { content }
async function updateNote(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const content = typeof req.body?.content === 'string' ? req.body.content : ''
    const note = await prisma.financeWorkspaceNote.upsert({
      where: { workspaceId },
      update: { content, updatedById: req.user.userId },
      create: { workspaceId, content, updatedById: req.user.userId },
    })
    res.json({ content: note.content })
  } catch (err) { next(err) }
}

module.exports = { getNote, updateNote }
