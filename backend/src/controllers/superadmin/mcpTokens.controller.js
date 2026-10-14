const prisma = require('../../lib/prisma')

// Visibilidad global (todos los workspaces) de los tokens de MCP/Agentes IA —
// solo lectura, para que el equipo de BlissTracker vea quién conectó qué agente
// y cuándo lo usó por última vez. El alta/baja la gestiona cada usuario desde su
// propio perfil (Preferencias → Agentes IA) o, para casos puntuales, los scripts
// backend/scripts/mcp-*-token.js.
async function listAll(req, res, next) {
  try {
    const tokens = await prisma.mcpToken.findMany({
      select: {
        id: true,
        label: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        workspace: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(tokens)
  } catch (err) { next(err) }
}

module.exports = { listAll }
