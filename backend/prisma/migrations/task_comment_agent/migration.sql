-- Agentes IA (MCP): comentario de tarea dejado por un agente (el autor sigue siendo
-- su dueño, userId; agentId marca que lo escribió el agente). SetNull: si el token se
-- borra, el comentario queda como de la persona.
ALTER TABLE "TaskComment" ADD COLUMN "agentId" INTEGER;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "McpToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;
