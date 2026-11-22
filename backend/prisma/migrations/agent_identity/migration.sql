-- Identidad propia del agente IA. La fila McpToken ya ERA el agente (su label es su
-- nombre); lo que faltaba era poder nombrarlo, distinguirlo de los demás de un vistazo
-- y decir qué hace. Ver concepto "Identidad del agente" en docs/claude/agentes-ia.md.

-- Color de identidad: token de la paleta de utils/agentColor.js, no hex libre. NULL =
-- se deriva del nombre por hash, así los agentes que ya existen salen con colores
-- distintos sin backfill.
ALTER TABLE "McpToken" ADD COLUMN "color" TEXT;

-- Rol de equipo del agente. Misma convención que WorkspaceMember.teamRole: referencia
-- a UserRole.name, así RoleBadge y useRoles().labelFor funcionan sin catálogo nuevo.
ALTER TABLE "McpToken" ADD COLUMN "teamRole" TEXT NOT NULL DEFAULT '';

-- Qué hace este agente. Se muestra en el roster y en su ficha, y se le informa a él
-- mismo en whoami para que sepa cuál es su trabajo.
ALTER TABLE "McpToken" ADD COLUMN "description" TEXT;
